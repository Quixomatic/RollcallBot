/**
 * Password login for the dashboard. One shared admin password
 * (DASHBOARD_PASSWORD); a successful login sets a signed, httpOnly cookie.
 * Tokens are HMAC-signed with a key derived from the password (or
 * DASHBOARD_SESSION_SECRET), so they survive restarts and changing the
 * password logs everyone out.
 */

const crypto = require('crypto');

const COOKIE = 'rollcall_session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

const failures = new Map(); // ip -> { count, since }

function secretKey() {
  const base = process.env.DASHBOARD_SESSION_SECRET || `rollcall-dashboard:${process.env.DASHBOARD_PASSWORD}`;
  return crypto.createHash('sha256').update(base).digest();
}

function sign(payload) {
  return crypto.createHmac('sha256', secretKey()).update(payload).digest('base64url');
}

function issueToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + MAX_AGE_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function validToken(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function passwordMatches(given) {
  const a = crypto.createHash('sha256').update(String(given ?? '')).digest();
  const b = crypto.createHash('sha256').update(process.env.DASHBOARD_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    maxAge: MAX_AGE_MS,
    path: '/',
  };
}

function login(req, res) {
  const ip = req.ip;
  const f = failures.get(ip);
  if (f && Date.now() - f.since < FAIL_WINDOW_MS && f.count >= MAX_FAILS) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  }
  if (!passwordMatches(req.body?.password)) {
    const entry = f && Date.now() - f.since < FAIL_WINDOW_MS ? f : { count: 0, since: Date.now() };
    entry.count++;
    failures.set(ip, entry);
    console.warn(`[dashboard] Failed login from ${ip} (${entry.count}/${MAX_FAILS})`);
    return res.status(401).json({ error: 'Wrong password' });
  }
  failures.delete(ip);
  res.cookie(COOKIE, issueToken(), cookieOptions(req));
  console.log(`[dashboard] Login from ${ip}`);
  res.json({ authenticated: true });
}

function logout(req, res) {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ authenticated: false });
}

function isAuthenticated(req) {
  return validToken(readCookie(req, COOKIE));
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: 'Not logged in' });
}

module.exports = { login, logout, isAuthenticated, requireAuth };
