/**
 * Shared test setup. Call setupEnv() at the very top of a test file, before
 * requiring anything from src/: it points the database and session file at a
 * throwaway directory, so tests never touch real data.
 *
 * Meetup is replaced by fakeBackend() (synthetic data, no network) and
 * Discord by the same stand-in the dry run uses (src/dev/fake-discord.js).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function setupEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollcall-test-'));
  process.env.ROLLCALL_DB_PATH = path.join(dir, 'test.db');
  process.env.MEETUP_STATE_FILE = path.join(dir, 'state.json');
  process.env.MEETUP_BACKEND = 'graphql';
  delete process.env.DASHBOARD_URL;
  // Keep test output readable: the code under test logs a lot.
  if (!process.env.TEST_VERBOSE) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }
  return dir;
}

const GROUP_URL = 'https://www.meetup.com/test-group/';
const eventUrl = (id) => `https://www.meetup.com/test-group/events/${id}/`;
const inHours = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const clone = (x) => JSON.parse(JSON.stringify(x));

/** An event as the GraphQL backend returns it. */
function makeEvent(id, overrides = {}) {
  return {
    event_id: String(id),
    title: `Pickup ${id}`,
    url: eventUrl(id),
    date_time: inHours(48),
    location: 'Field #1 — 1 Park Rd, Reston, VA',
    description: 'Bring water',
    rsvp_count: 0,
    waitlist_count: 0,
    max_tickets: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

const rsvp = (name, status = 'going', guests = 0, id = name) => ({
  member_name: name, member_id: `m-${id}`, member_url: `https://www.meetup.com/members/m-${id}/`, rsvp_status: status, guests,
});

/** A comment as the GraphQL backend returns it (same key formula as src). */
function comment(author, text, { id, likes = 0, pinned = false, created = inHours(-1), parent = null } = {}) {
  const hash = crypto.createHash('md5').update(`${author}:${text}`).digest('hex');
  return {
    comment_id: hash,
    meetup_comment_id: id || hash.slice(0, 8),
    author_name: author,
    author_id: `a-${author}`,
    content: text,
    posted_at: created,
    created,
    likes,
    is_reply: !!parent,
    parent_comment_id: parent,
    is_pinned: pinned,
  };
}

/**
 * A stand-in Meetup backend driven by a mutable `world`:
 *   { self, sessionDead, events: [...], rsvps: {eventId: [...]}, comments: {eventId: [...]}, unlisted: Set }
 */
function fakeBackend(world) {
  const idOf = (url) => url.match(/events\/(\d+)/)[1];
  return {
    name: 'graphql',
    canLookupEvents: true,
    calls: [],
    async ensureLoggedIn() {
      this.calls.push('ensureLoggedIn');
      if (world.sessionDead) throw new Error('Session expired — test');
      return world.self;
    },
    async getEvents(groupUrl, guildId) {
      this.calls.push('getEvents');
      return world.events.filter((e) => !world.unlisted?.has(e.event_id)).map((e) => ({ ...clone(e), guild_id: guildId }));
    },
    async getEventDetails(url) {
      this.calls.push('getEventDetails');
      const e = world.events.find((x) => x.event_id === idOf(url));
      if (!e) throw new Error(`Event not found: ${url}`);
      return clone(e);
    },
    async getRsvps(url) {
      this.calls.push('getRsvps');
      return clone(world.rsvps[idOf(url)] || []);
    },
    async getComments(url) {
      this.calls.push('getComments');
      return clone(world.comments[idOf(url)] || []);
    },
    async postComment(url, text) {
      this.calls.push('postComment');
      (world.posted ||= []).push({ eventId: idOf(url), text });
      return { meetupCommentId: 'new-1' };
    },
    async deleteComment() {},
    clearSessionDead() {},
    async reloadSession() {},
    async close() {},
  };
}

module.exports = { setupEnv, GROUP_URL, eventUrl, inHours, makeEvent, rsvp, comment, fakeBackend, clone };
