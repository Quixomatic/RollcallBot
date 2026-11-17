// Upgrading a database created by an older version must keep every row and
// apply the per-event comment key, which fixes the "same text on two events
// is re-posted every poll" bug.
const { setupEnv, comment } = require('./helpers');
setupEnv();

const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../src/db-driver');

// Build a v1.0.x-shaped database at the test path before the app opens it.
const old = openDatabase(process.env.ROLLCALL_DB_PATH);
old.exec(`
  CREATE TABLE comments (
    comment_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    author_name TEXT,
    content TEXT,
    posted_at TEXT,
    likes INTEGER DEFAULT 0,
    parent_comment_id TEXT,
    first_seen_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE guild_settings (guild_id TEXT PRIMARY KEY, meetup_group_url TEXT, enabled INTEGER DEFAULT 1);
  INSERT INTO guild_settings (guild_id, meetup_group_url) VALUES ('g1', 'https://www.meetup.com/test-group/');
  INSERT INTO comments (comment_id, event_id, author_name, content, posted_at, likes) VALUES
    ('h1', 'e1', 'Chip F.', 'See you there', '2 days ago', 1),
    ('h2', 'e1', 'Ann L.', 'Bringing a ball', '1 day ago', 0);
`);
old.close?.();

const { queries, getDb } = require('../src/database');
const { detectNewComments } = require('../src/services/meetup-comments');

test('old rows survive the upgrade with their data', () => {
  const rows = queries.getCommentsForEvent().all('e1');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.comment_id, r.author_name, r.likes]).sort(), [['h1', 'Chip F.', 1], ['h2', 'Ann L.', 0]]);
  assert.equal(queries.getGuildSettings().get('g1').meetup_group_url, 'https://www.meetup.com/test-group/');
});

test('comments are keyed per event after the upgrade', () => {
  const pk = getDb().pragma('table_info(comments)').filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
  assert.deepEqual(pk, ['event_id', 'comment_id']);
});

test('the same comment on two events is stored for both and not re-posted (regression)', () => {
  const same = comment('Chip F.', 'I\'m in!', { id: 'x1' });
  assert.equal(detectNewComments('event-A', [same]).length, 1);
  assert.equal(detectNewComments('event-B', [{ ...same, meetup_comment_id: 'x2' }]).length, 1, 'first sight on event B');
  // Before the fix, event B's copy could never be stored and came back as new on every poll.
  assert.equal(detectNewComments('event-B', [{ ...same, meetup_comment_id: 'x2' }]).length, 0);
  assert.equal(detectNewComments('event-A', [same]).length, 0);
});

test('re-opening an upgraded database is a no-op', () => {
  const before = queries.getCommentsForEvent().all('e1').length;
  const again = openDatabase(process.env.ROLLCALL_DB_PATH);
  const pk = again.pragma('table_info(comments)').filter((c) => c.pk > 0).length;
  assert.equal(pk, 2);
  assert.equal(queries.getCommentsForEvent().all('e1').length, before);
});
