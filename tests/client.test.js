// The GraphQL client's auth handling: refresh on access_token_expired, session
// death on access_token_invalid, upload verification. fetch is mocked.
const { setupEnv } = require('./helpers');
setupEnv();

const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const client = require('../src/services/meetup-api/client');

const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const cookie = (name, value) => ({ name, value, domain: '.meetup.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' });

function writeSession(accessValue = jwt({ iat: 1, exp: 2 })) {
  fs.writeFileSync(client.STATE_FILE, JSON.stringify({
    cookies: [cookie('MEETUP_SESSION', 's'), cookie('__meetup_auth_access_token', accessValue), cookie('__meetup_auth_refresh_token', 'r1')],
    origins: [],
  }));
  client.clearSessionDead();
}

/** Mock fetch with a queue of responders; each gets (url, body) and returns { json, setCookie? }. */
function mockFetch(responders) {
  const seen = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url, body, cookie: init.headers.cookie });
    const r = responders.shift();
    if (!r) throw new Error(`unexpected request to ${url}`);
    const out = r(url, body);
    return {
      ok: true,
      status: 200,
      headers: { getSetCookie: () => out.setCookie || [], get: () => null },
      text: async () => JSON.stringify(out.json),
      json: async () => out.json,
    };
  };
  return seen;
}

const expired = { json: { errors: [{ message: 'expired', extensions: { classification: 'access_token_expired' } }] } };
const selfOk = { json: { data: { self: { id: '42', name: 'Eventer' } } } };

test('an expired-token error triggers one refresh, saves the new token, and retries', async () => {
  writeSession();
  const newToken = jwt({ iat: 100, exp: 200 });
  const seen = mockFetch([
    () => expired,
    (url) => {
      assert.match(url, /refresh-token$/);
      return { json: { data: { refreshTokens: { session: { accessToken: newToken, refreshToken: 'r2' }, error: null } } } };
    },
    () => selfOk,
  ]);
  const self = await client.getSelf();
  assert.deepEqual(self, { id: '42', name: 'Eventer' });
  assert.equal(seen.length, 3);
  assert.match(seen[2].cookie, new RegExp(newToken.replace(/\./g, '\\.')), 'retried with the new token');
  const saved = JSON.parse(fs.readFileSync(client.STATE_FILE, 'utf8'));
  assert.equal(saved.cookies.find((c) => c.name === '__meetup_auth_refresh_token').value, 'r2', 'rotated refresh token persisted');
});

test('an expired JWT alone does not trigger a refresh (Meetup does not enforce it)', async () => {
  writeSession(jwt({ iat: 1, exp: 2 })); // long expired
  const seen = mockFetch([() => selfOk]);
  await client.getSelf();
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /gql2$/);
});

test('access_token_invalid marks the session dead and stops further requests', async () => {
  writeSession();
  mockFetch([() => ({ json: { errors: [{ message: 'invalid', extensions: { classification: 'access_token_invalid' } }] } })]);
  assert.equal(await client.getSelf(), null);
  assert.equal(client.isSessionDead(), true);
  await assert.rejects(client.gql('query x { self { id } }'), /Session expired/);
  client.clearSessionDead();
});

test('a rejected refresh token marks the session dead', async () => {
  writeSession();
  mockFetch([() => expired, () => ({ json: { data: { refreshTokens: { session: null, error: { code: 'X', message: 'bad refresh token' } } } } })]);
  await assert.rejects(client.ensureLoggedIn(), /Session expired/);
  assert.equal(client.isSessionDead(), true);
  client.clearSessionDead();
});

test('getLastSelf remembers the last check without a request', async () => {
  writeSession();
  mockFetch([() => selfOk]);
  await client.getSelf();
  const last = client.getLastSelf();
  assert.equal(last.value.name, 'Eventer');
  assert.ok(last.at);
});

test('verifySession rejects incomplete files and accepts a working one', async () => {
  assert.equal((await client.verifySession({})).ok, false);
  const missing = await client.verifySession({ cookies: [cookie('MEETUP_SESSION', 's')] });
  assert.match(missing.reason, /__meetup_auth_access_token/);

  mockFetch([() => selfOk]);
  const good = await client.verifySession({ cookies: [cookie('MEETUP_SESSION', 's'), cookie('__meetup_auth_access_token', 'a'), cookie('__meetup_auth_refresh_token', 'r')] });
  assert.equal(good.ok, true);
  assert.equal(good.self.name, 'Eventer');
});

test('installSession backs up the old file and writes the new one', () => {
  writeSession();
  const { backup } = client.installSession({ cookies: [cookie('MEETUP_SESSION', 'new')], origins: [] });
  assert.ok(fs.existsSync(backup));
  assert.equal(JSON.parse(fs.readFileSync(client.STATE_FILE, 'utf8')).cookies[0].value, 'new');
});
