/**
 * Minimal Meetup GraphQL client.
 *
 * Auth is cookie-based and shared with the browser backend: it reads and
 * writes the same Playwright storageState file (data/browser-state/state.json)
 * that the dashboard's remote login, uploads and export-session.js produce, so either backend can
 * pick up a session the other one saved.
 *
 * Token lifecycle (from meetup.com's own Apollo client, see
 * docs/meetup-api/README.md):
 *   - __meetup_auth_access_token  JWT whose `exp` says 1 hour — but Meetup does
 *     NOT enforce it: tokens weeks past `exp` are still accepted, and
 *     /refresh-token just returns the same token. What actually ends a
 *     session is Meetup's server side.
 *   - __meetup_auth_refresh_token JWT, `exp` 1 year
 *   - If Meetup ever does reject an expired token, it answers with a GraphQL
 *     error whose extensions.classification is "access_token_expired"; the site
 *     then POSTs refreshTokensMutation to /refresh-token and retries. So do we.
 *   - "access_token_invalid" means the session is gone: log in again.
 * /refresh-token returns the tokens both as Set-Cookie headers and in the
 * response body; we apply both.
 */

const path = require('path');
const fs = require('fs');
const { SELF, REFRESH_TOKENS } = require('./queries');

// MEETUP_STATE_FILE points the client at another session (used by the API check tools).
const STATE_FILE = process.env.MEETUP_STATE_FILE
  || path.join(__dirname, '..', '..', '..', 'data', 'browser-state', 'state.json');
const GQL_URL = 'https://www.meetup.com/gql2';
const REFRESH_URL = 'https://www.meetup.com/refresh-token';
const ACCESS_COOKIE = '__meetup_auth_access_token';
const REFRESH_COOKIE = '__meetup_auth_refresh_token';
const REQUEST_TIMEOUT_MS = 30000;

const SESSION_DEAD_MESSAGE = 'Session expired — log in again from the dashboard (Meetup session → Remote login) or upload a new state.json';

class MeetupApiError extends Error {
  constructor(message, { operation, errors, status } = {}) {
    super(message);
    this.name = 'MeetupApiError';
    this.operation = operation;
    this.errors = errors;
    this.status = status;
  }
}

let state = null;
let stateMtimeMs = 0;
let sessionDead = false;
let refreshInFlight = null;

/**
 * Load cookies from disk, re-reading whenever the file changed underneath us
 * (e.g. a fresh state.json was copied in after a re-login).
 */
function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    throw new MeetupApiError(`No session file at ${STATE_FILE}. ${SESSION_DEAD_MESSAGE}`);
  }
  const { mtimeMs } = fs.statSync(STATE_FILE);
  if (!state || mtimeMs !== stateMtimeMs) {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    state.cookies = state.cookies || [];
    state.origins = state.origins || [];
    stateMtimeMs = mtimeMs;
  }
  return state;
}

function saveState() {
  if (!state) return;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  stateMtimeMs = fs.statSync(STATE_FILE).mtimeMs;
}

function getCookie(name) {
  return loadState().cookies.find((c) => c.name === name && c.domain.endsWith('meetup.com'));
}

function cookieHeader() {
  const now = Date.now() / 1000;
  return loadState().cookies
    .filter((c) => c.domain.endsWith('meetup.com') && (c.expires <= 0 || c.expires > now))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

/** Set (or add) a cookie in the storageState, keeping Playwright's format. */
function setCookie(name, value, { expires = null, httpOnly = true } = {}) {
  const s = loadState();
  let cookie = s.cookies.find((c) => c.name === name && c.domain.endsWith('meetup.com'));
  if (!cookie) {
    cookie = { name, value, domain: '.meetup.com', path: '/', expires: -1, httpOnly, secure: true, sameSite: 'Lax' };
    s.cookies.push(cookie);
  }
  cookie.value = value;
  if (expires !== null) cookie.expires = expires;
}

/** Apply Set-Cookie headers from a meetup.com response. Returns true if anything changed. */
function applySetCookies(res) {
  const headers = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  let changed = false;
  for (const header of headers) {
    const [pair, ...attrs] = header.split(';');
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();

    let expires = null;
    for (const attr of attrs) {
      const [k, v] = attr.split('=').map((x) => x && x.trim());
      if (/^max-age$/i.test(k)) expires = Math.floor(Date.now() / 1000) + parseInt(v, 10);
      else if (/^expires$/i.test(k) && expires === null) {
        const t = Date.parse(v);
        if (!isNaN(t)) expires = Math.floor(t / 1000);
      }
    }

    const existing = getCookie(name);
    if (!existing || existing.value !== value) changed = true;
    setCookie(name, value, { expires, httpOnly: attrs.some((a) => /httponly/i.test(a)) });
  }
  return changed;
}

/** The access token's JWT claims ({ iat, exp } in seconds), or null if unreadable. */
function accessTokenClaims() {
  const token = getCookie(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

/** Seconds until the access token's JWT `exp` (informational: Meetup doesn't enforce it). */
function accessTokenSecondsLeft() {
  const claims = accessTokenClaims();
  return claims?.exp ? claims.exp - Date.now() / 1000 : null;
}

function markSessionDead(reason) {
  if (!sessionDead) {
    console.error(`[meetup-api] ⚠ Session is no longer valid (${reason}).`);
    console.error('[meetup-api] Log in again from the dashboard (Meetup session → Remote login). Polling paused until then.');
  }
  sessionDead = true;
}

function clearSessionDead() {
  sessionDead = false;
  state = null; // force a re-read of state.json on the next request
}

function isSessionDead() {
  return sessionDead;
}

function classificationOf(errors) {
  return (errors || []).map((e) => e?.extensions?.classification).find(Boolean) || null;
}

async function post(url, body, operation) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: '*/*',
        origin: 'https://www.meetup.com',
        referer: 'https://www.meetup.com/',
        'apollographql-client-name': 'nextjs-web',
        cookie: cookieHeader(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new MeetupApiError(`${operation}: request failed: ${err.message}`, { operation });
  }

  if (applySetCookies(res)) saveState();

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new MeetupApiError(`${operation}: HTTP ${res.status}, non-JSON response: ${text.slice(0, 200)}`, { operation, status: res.status });
  }
  if (!res.ok && !json.errors) {
    throw new MeetupApiError(`${operation}: HTTP ${res.status}`, { operation, status: res.status });
  }
  return json;
}

/**
 * Exchange the refresh token for a new access token. Concurrent callers share
 * one in-flight refresh, like the site's Apollo link does.
 */
async function refreshTokens() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    if (!getCookie(REFRESH_COOKIE)) {
      markSessionDead('no refresh token in state.json');
      return false;
    }
    const json = await post(REFRESH_URL, { operationName: 'refreshTokensMutation', variables: {}, query: REFRESH_TOKENS }, 'refreshTokensMutation');
    const result = json?.data?.refreshTokens;
    if (json.errors || result?.error || !result?.session?.accessToken) {
      const reason = result?.error?.message || json.errors?.[0]?.message || 'no session returned';
      markSessionDead(`token refresh failed: ${reason}`);
      return false;
    }
    // Set-Cookie already applied in post(); the body is the fallback.
    setCookie(ACCESS_COOKIE, result.session.accessToken);
    if (result.session.refreshToken) setCookie(REFRESH_COOKIE, result.session.refreshToken);
    saveState();
    const left = accessTokenSecondsLeft();
    console.log(left !== null && left <= 0
      ? '[meetup-api] Token refresh: Meetup returned the current token'
      : `[meetup-api] Access token refreshed${left !== null ? ` (exp in ${Math.round(left / 60)} min)` : ''}`);
    return true;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * Run a GraphQL query. If Meetup reports the access token expired, refresh it
 * and retry once (it doesn't enforce the JWT's own `exp`, so there's no point
 * refreshing on a timer). Throws MeetupApiError on any GraphQL error, with the
 * operation name and Meetup's error messages, so schema drift shows up as a
 * precise message rather than empty data.
 */
async function gql(query, variables = {}, { retried = false } = {}) {
  if (sessionDead) throw new MeetupApiError(SESSION_DEAD_MESSAGE);

  const operation = query.match(/(?:query|mutation)\s+(\w+)/)?.[1] || 'anonymous';

  const json = await post(GQL_URL, { operationName: operation, variables, query }, operation);

  if (json.errors?.length) {
    const classification = classificationOf(json.errors);
    if (classification === 'access_token_expired' && !retried) {
      if (await refreshTokens()) return gql(query, variables, { retried: true });
      throw new MeetupApiError(SESSION_DEAD_MESSAGE, { operation, errors: json.errors });
    }
    if (classification === 'access_token_invalid') {
      markSessionDead('access_token_invalid');
      throw new MeetupApiError(SESSION_DEAD_MESSAGE, { operation, errors: json.errors });
    }
    const messages = json.errors.map((e) => e.message).join('; ');
    throw new MeetupApiError(`${operation}: ${messages}`, { operation, errors: json.errors });
  }

  return json.data;
}

// Result of the most recent session check (every poll does one), so the
// dashboard can show session status without making requests of its own.
let lastSelf = { value: null, at: null };

/** The logged-in member ({ id, name }), or null if the session isn't authenticated. */
async function getSelf() {
  try {
    const data = await gql(SELF);
    const self = data?.self?.id ? data.self : null;
    lastSelf = { value: self, at: new Date().toISOString() };
    return self;
  } catch (err) {
    if (sessionDead) {
      lastSelf = { value: null, at: new Date().toISOString() };
      return null;
    }
    throw err;
  }
}

/** The last session check's result ({ value, at }); no request is made. */
function getLastSelf() {
  return lastSelf;
}

/** Throws (and pauses polling) if the session isn't logged in. Same contract as scraper.ensureLoggedIn. */
async function ensureLoggedIn() {
  if (sessionDead) throw new MeetupApiError(SESSION_DEAD_MESSAGE);
  const self = await getSelf();
  if (!self) {
    markSessionDead('not logged in');
    throw new MeetupApiError(SESSION_DEAD_MESSAGE);
  }
  return self;
}

const REQUIRED_COOKIES = ['MEETUP_SESSION', ACCESS_COOKIE, REFRESH_COOKIE];

/**
 * Check a candidate storageState (e.g. an uploaded state.json) against Meetup
 * without touching the installed session. If its access token has expired it
 * is refreshed using the candidate's own refresh token. Returns
 * { ok, self, state, reason } — `state` carries any renewed tokens.
 */
async function verifySession(candidate) {
  if (!candidate || !Array.isArray(candidate.cookies)) {
    return { ok: false, reason: 'Not a Playwright storageState file (no "cookies" array)' };
  }
  const meetup = candidate.cookies.filter((c) => typeof c?.domain === 'string' && c.domain.endsWith('meetup.com'));
  const missing = REQUIRED_COOKIES.filter((n) => !meetup.some((c) => c.name === n));
  if (missing.length) return { ok: false, reason: `Missing auth cookie(s): ${missing.join(', ')}` };

  const state = JSON.parse(JSON.stringify(candidate));
  state.origins = state.origins || [];
  const header = () => state.cookies.filter((c) => c.domain?.endsWith('meetup.com')).map((c) => `${c.name}=${c.value}`).join('; ');
  const send = (url, body) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://www.meetup.com', 'apollographql-client-name': 'nextjs-web', cookie: header() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).then((r) => r.json());

  let json = await send(GQL_URL, { operationName: 'rollcallSelf', query: SELF });
  if (classificationOf(json.errors) === 'access_token_expired') {
    const refreshed = await send(REFRESH_URL, { operationName: 'refreshTokensMutation', variables: {}, query: REFRESH_TOKENS });
    const session = refreshed?.data?.refreshTokens?.session;
    if (!session?.accessToken) return { ok: false, reason: 'Access token expired and the refresh token was rejected' };
    state.cookies.find((c) => c.name === ACCESS_COOKIE).value = session.accessToken;
    if (session.refreshToken) state.cookies.find((c) => c.name === REFRESH_COOKIE).value = session.refreshToken;
    json = await send(GQL_URL, { operationName: 'rollcallSelf', query: SELF });
  }
  if (json.errors?.length) return { ok: false, reason: `Meetup rejected the session: ${json.errors.map((e) => e.message).join('; ')}` };
  if (!json.data?.self?.id) return { ok: false, reason: 'Meetup says this session is not logged in' };
  return { ok: true, self: json.data.self, state };
}

/**
 * Install a verified storageState as the live session: back up the current
 * file, write the new one, and clear the session-dead flag so polling resumes.
 */
function installSession(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  let backup = null;
  if (fs.existsSync(STATE_FILE)) {
    backup = `${STATE_FILE}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(STATE_FILE, backup);
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  clearSessionDead();
  return { backup };
}

module.exports = {
  gql,
  getSelf,
  getLastSelf,
  ensureLoggedIn,
  refreshTokens,
  verifySession,
  installSession,
  clearSessionDead,
  isSessionDead,
  accessTokenSecondsLeft,
  accessTokenClaims,
  MeetupApiError,
  STATE_FILE,
};
