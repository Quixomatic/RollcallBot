// End-to-end polling behaviour against a fake Meetup backend and fake Discord:
// what gets stored, and exactly what gets posted.
const { setupEnv, GROUP_URL, makeEvent, rsvp, comment, fakeBackend, inHours } = require('./helpers');
setupEnv();

const test = require('node:test');
const assert = require('node:assert/strict');
const { queries, getDb } = require('../src/database');
const { setBackendForTests } = require('../src/services/backend');
const poller = require('../src/services/poller');
const { createFakeClient } = require('../src/dev/fake-discord');

const GUILD = 'dev-guild';
const outbox = [];
const discord = createFakeClient({ guildId: GUILD, outbox, log: false });

const world = { self: { id: 'bot', name: 'Eventer' }, sessionDead: false, events: [], rsvps: {}, comments: {}, unlisted: new Set() };
setBackendForTests(fakeBackend(world));

// Settings: all channels, no reminders (keeps the outbox focused).
queries.setMeetupGroupUrl().run(GUILD, GROUP_URL);
queries.setMeetupCredentials().run(GUILD, 'x@example.com', 'x');
queries.setEventsChannel().run(GUILD, '100');
queries.setRsvpChannel().run(GUILD, '101');
queries.setCommentsChannel().run(GUILD, '102');
queries.setRemindersChannel().run(GUILD, '103');
queries.setAlertsChannel().run(GUILD, '104');
queries.setReminderDayBefore().run(GUILD, 0);
queries.setReminderHoursBefore().run(GUILD, '');

const settings = () => queries.getGuildSettings().get(GUILD);
const poll = () => poller.pollGuild(discord, GUILD, settings());
const take = () => outbox.splice(0);
const sent = (items, channel) => items.filter((m) => m.action === 'send' && m.channel === channel);
const titles = (items) => items.map((m) => `${m.action}#${m.channel}:${m.embeds[0]?.title}`);

// Event 1 is tonight (quick-polled); events 2 and 3 are later.
world.events = [
  makeEvent(1, { date_time: inHours(5), max_tickets: 3 }),
  makeEvent(2, { date_time: inHours(72) }),
  makeEvent(3, { date_time: inHours(96) }),
];
world.rsvps['1'] = [rsvp('Ann'), rsvp('Bob', 'waitlist')];
world.comments['1'] = [comment('Chip F.', 'Where are we playing?', { id: 'c1' })];

test('first poll seeds events silently and posts the first RSVP summary and comments', async () => {
  await poll();
  const out = take();
  assert.equal(queries.getEventsForGuild().all(GUILD).length, 3);
  assert.deepEqual(titles(out), ['send#rsvps:RSVPs: Pickup 1', 'send#comments:Comments: Pickup 1']);
  const rsvpEmbed = out[0].embeds[0];
  assert.match(rsvpEmbed.fields[0].name, /Going \(1\/3\)/, 'shows capacity');
  assert.match(rsvpEmbed.description, /2.* of 3 spots left/);
});

test('a poll with nothing changed posts nothing', async () => {
  await poll();
  assert.deepEqual(take(), []);
});

test('a location change is posted as an update', async () => {
  world.events[1].location = 'New Field — 2 Park Rd';
  await poll();
  const out = take();
  assert.deepEqual(titles(out), ['send#events:Event Updated: Pickup 2']);
  assert.match(out[0].embeds[0].description, /New Field/);
});

test('waitlist promotion is called out, and filling up posts one "full" alert', async () => {
  world.rsvps['1'] = [rsvp('Ann'), rsvp('Bob', 'going'), rsvp('Cat', 'going')];
  await poll();
  const out = take();
  // Within the edit window the summary is edited in place rather than reposted.
  const rsvpPost = out.find((m) => m.channel === 'rsvps' && m.embeds[0]?.title.startsWith('RSVPs'));
  assert.equal(rsvpPost.action, 'edit');
  const changes = rsvpPost.embeds[0].fields.find((f) => f.name === 'Changes');
  assert.match(changes.value, /⬆️ \*\*Bob\*\*: waitlist → going/);
  assert.ok(sent(out, 'rsvps').some((m) => m.embeds[0].title === '🚫 Event full: Pickup 1'));
  assert.equal(queries.getEventForGuild().get('1', GUILD).is_full, 1);

  await poll();
  assert.ok(!take().some((m) => /Event full/.test(m.embeds[0]?.title)), 'not announced twice');
});

test('a spot opening up after being full is announced', async () => {
  world.rsvps['1'] = [rsvp('Ann'), rsvp('Bob', 'going'), rsvp('Cat', 'not_going')];
  await poll();
  const out = take();
  assert.ok(sent(out, 'rsvps').some((m) => m.embeds[0].title === '🎟️ Spot opened: Pickup 1'));
  assert.equal(queries.getEventForGuild().get('1', GUILD).is_full, 0);
});

test('a new like or pin edits the original comments post instead of reposting', async () => {
  const original = queries.getCommentsForEvent().all('1')[0];
  assert.ok(original.discord_message_id, 'post was tracked');
  world.comments['1'] = [comment('Chip F.', 'Where are we playing?', { id: 'c1', likes: 3, pinned: true })];
  await poll();
  const out = take();
  assert.deepEqual(out.map((m) => `${m.action}#${m.channel}`), ['edit#comments']);
  assert.equal(out[0].messageId, original.discord_message_id);
  assert.match(out[0].embeds[0].description, /📌 Pinned/);
  assert.match(out[0].embeds[0].description, /Likes: 3/);
});

test('a new comment is posted; an edited one (same Meetup ID) is not', async () => {
  world.comments['1'] = [
    comment('Chip F.', 'Where are we playing? (edited)', { id: 'c1', likes: 3, pinned: true }),
    comment('Dee K.', 'Bringing cones', { id: 'c2', created: inHours(0) }),
  ];
  await poll();
  const posts = sent(take(), 'comments');
  assert.equal(posts.length, 1);
  assert.match(posts[0].embeds[0].description, /Bringing cones/);
  assert.doesNotMatch(posts[0].embeds[0].description, /edited/);
});

test('an event that drops out of the listing but still exists is kept, not cancelled', async () => {
  world.unlisted.add('3');
  await poll();
  assert.ok(!take().some((m) => /Cancelled/.test(m.embeds[0]?.title)));
  assert.equal(queries.getEventForGuild().get('3', GUILD).is_cancelled, 0);
});

test('only Meetup\'s CANCELLED status cancels an event, and it is announced once', async () => {
  world.events.find((e) => e.event_id === '3').status = 'CANCELLED';
  await poll();
  assert.deepEqual(titles(take()), ['send#events:Event Cancelled: Pickup 3']);
  await poll();
  assert.ok(!take().some((m) => /Cancelled/.test(m.embeds[0]?.title)));
});

test('an event deleted from Meetup is hidden without a post', async () => {
  world.events = world.events.filter((e) => e.event_id !== '2');
  await poll();
  assert.ok(!take().some((m) => /Cancelled/.test(m.embeds[0]?.title)));
  assert.equal(queries.getEventForGuild().get('2', GUILD).is_cancelled, 1);
});

test('a dead session alerts once, and its recovery alerts once', async () => {
  world.sessionDead = true;
  await poll();
  await poll();
  let alerts = sent(take(), 'alerts');
  assert.deepEqual(alerts.map((m) => m.embeds[0].title), ['🔑 Meetup session expired']);

  world.sessionDead = false;
  await poll();
  await poll();
  alerts = sent(take(), 'alerts');
  assert.deepEqual(alerts.map((m) => m.embeds[0].title), ['✅ Meetup session restored']);
});

test('scrape history older than 30 days is removed on a full poll', async () => {
  getDb().prepare("INSERT INTO scrape_log (guild_id, scrape_type, status, duration_ms, scraped_at) VALUES (?, 'events', 'success', 1, datetime('now', '-31 days'))").run(GUILD);
  getDb().prepare("INSERT INTO scrape_log (guild_id, scrape_type, status, duration_ms, scraped_at) VALUES (?, 'events', 'success', 1, datetime('now', '-29 days'))").run(GUILD);
  await poll();
  take();
  const oldest = getDb().prepare('SELECT MIN(scraped_at) AS t FROM scrape_log').get().t;
  assert.ok(new Date(`${oldest}Z`) > new Date(Date.now() - 30 * 86400e3), `oldest row is ${oldest}`);
});

test('manual polls refuse to overlap', async () => {
  const first = poller.pollGuildNow(discord, GUILD, 'test 1');
  await assert.rejects(poller.pollGuildNow(discord, GUILD, 'test 2'), poller.PollerBusyError);
  await first;
  take();
});
