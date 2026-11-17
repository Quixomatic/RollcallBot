// The dashboard's HTTP API: auth, validation, safety guards, and data shapes.
// Runs the real server (in dry-run mode) on a random port with fake Meetup and Discord.
const { setupEnv, GROUP_URL, makeEvent, rsvp, fakeBackend, inHours } = require('./helpers');
setupEnv();
process.env.DASHBOARD_PASSWORD = 'test-pass';
process.env.DASHBOARD_PORT = '0';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('events');
const { queries } = require('../src/database');
const { setBackendForTests } = require('../src/services/backend');
const { createFakeClient } = require('../src/dev/fake-discord');
const { startDashboard } = require('../src/dashboard/server');
const poller = require('../src/services/poller');

const GUILD = 'dev-guild';
const outbox = [];
const discord = createFakeClient({ guildId: GUILD, outbox, log: false });
const world = { self: { id: 'bot', name: 'Eventer' }, events: [makeEvent(7, { date_time: inHours(3), max_tickets: 10 })], rsvps: { 7: [rsvp('Ann', 'going', 1)] }, comments: {} };
setBackendForTests(fakeBackend(world));

queries.setMeetupGroupUrl().run(GUILD, GROUP_URL);
queries.setMeetupCredentials().run(GUILD, 'x@example.com', 'x');
queries.setRsvpChannel().run(GUILD, '101');

let base;
let cookie = '';
let server;

test.before(async () => {
  server = startDashboard(discord, { outbox });
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api`;
  await poller.pollGuild(discord, GUILD, queries.getGuildSettings().get(GUILD));
});
test.after(() => server.close());

const call = async (path, { method = 'GET', body, auth = true } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth && cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null), res };
};

test('everything but login requires a session', async () => {
  assert.equal((await call('/overview', { auth: false })).status, 401);
  assert.equal((await call('/auth/me', { auth: false })).body.authenticated, false);
});

test('wrong password is refused; the right one sets an httpOnly cookie', async () => {
  assert.equal((await call('/auth/login', { method: 'POST', body: { password: 'nope' } })).status, 401);
  const ok = await call('/auth/login', { method: 'POST', body: { password: 'test-pass' } });
  assert.equal(ok.status, 200);
  const setCookie = ok.res.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  cookie = setCookie.split(';')[0];
  assert.equal((await call('/auth/me')).body.authenticated, true);
});

test('overview reports version, poller and the next event with capacity', async () => {
  const { status, body } = await call('/overview');
  assert.equal(status, 200);
  assert.match(body.version, /^\d+\.\d+\.\d+$/);
  assert.equal(body.dryRun, true);
  const next = body.guilds[0].nextEvent;
  assert.equal(next.event_id, '7');
  assert.equal(next.max_tickets, 10);
  assert.deepEqual([next.rsvps.going, next.rsvps.guests], [2, 1]);
});

test('heartbeats return one monitor per check type', async () => {
  const { body } = await call(`/guilds/${GUILD}/heartbeats?limit=10`);
  assert.deepEqual(body.map((m) => m.type), ['events', 'rsvps', 'comments']);
  assert.ok(body[0].beats.length >= 1);
  assert.equal(body[0].day.pct, 100);
});

test('settings are validated like /config', async () => {
  assert.equal((await call(`/guilds/${GUILD}/settings`, { method: 'PUT', body: { poll_interval_minutes: 2 } })).status, 400);
  assert.equal((await call(`/guilds/${GUILD}/settings`, { method: 'PUT', body: { timezone: 'Mars/Base' } })).status, 400);
  assert.equal((await call(`/guilds/${GUILD}/settings`, { method: 'PUT', body: { alerts_channel_id: '999' } })).status, 400, 'channel must exist');
  const ok = await call(`/guilds/${GUILD}/settings`, { method: 'PUT', body: { alerts_channel_id: '104', poll_interval_minutes: 15 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.settings.alerts_channel_id, '104');
});

test('the dry run refuses to post or delete real Meetup comments', async () => {
  const post = await call(`/guilds/${GUILD}/events/7/comments`, { method: 'POST', body: { authorName: 'James', text: 'hi' } });
  assert.equal(post.status, 403);
  assert.equal((await call(`/guilds/${GUILD}/events/7/comments/abc`, { method: 'DELETE' })).status, 403);
  assert.equal(world.posted, undefined, 'nothing reached the backend');
});

test('rescanning an event returns a summary including capacity', async () => {
  const { status, body } = await call(`/guilds/${GUILD}/events/7/rescan`, { method: 'POST' });
  assert.equal(status, 200);
  assert.deepEqual(body.capacity, { going: 2, max: 10, full: false });
});

test('remote login reports its status; its websocket refuses unauthenticated clients', async () => {
  const { body } = await call('/remote-login');
  assert.equal(body.state, 'idle');
  const WebSocket = require('ws');
  const ws = new WebSocket(`${base.replace('http', 'ws')}/remote-login/ws`);
  const err = await new Promise((resolve) => { ws.on('unexpected-response', (req, res) => resolve(res.statusCode)); ws.on('error', () => resolve('error')); });
  assert.equal(err, 401);
});
