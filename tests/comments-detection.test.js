// Comment de-duplication, especially across a browser → GraphQL backend switch,
// where nothing that was already posted may be posted again.
const { setupEnv, comment, inHours } = require('./helpers');
setupEnv();

const test = require('node:test');
const assert = require('node:assert/strict');
const { queries, getDb } = require('../src/database');
const { detectNewComments, detectCommentUpdates } = require('../src/services/meetup-comments');

const threads = () => [
  comment('Chip F.', 'HHS or Lake Fairifax?', { id: 'c1' }),
  comment('Bryan G.', 'Go to Herndon hs', { id: 'c2', pinned: true }),
];

/** Store comments as the browser backend did: same keys, no Meetup IDs, relative times. */
function storeAsBrowser(eventId, list, mutate = (c) => c) {
  for (const c of list.map(mutate)) {
    queries.insertComment().run(c.comment_id, eventId, c.author_name, c.content, '1 week ago', c.likes, c.parent_comment_id, null, 0);
  }
}

test('first sight of an event reports every comment (v1 behaviour)', () => {
  assert.equal(detectNewComments('e-fresh', threads()).length, 2);
});

test('switching from the browser backend re-posts nothing and backfills Meetup IDs', () => {
  storeAsBrowser('e-switch', threads());
  assert.equal(detectNewComments('e-switch', threads()).length, 0);
  const ids = getDb().prepare("SELECT meetup_comment_id FROM comments WHERE event_id = 'e-switch'").all().map((r) => r.meetup_comment_id);
  assert.deepEqual(ids.sort(), ['c1', 'c2']);
});

test('text that rendered slightly differently in the browser still matches', () => {
  storeAsBrowser('e-ws', threads(), (c) => ({ ...c, comment_id: `browser-${c.comment_id}`, content: `  ${c.content.replace(/ /g, '  ')} ` }));
  assert.equal(detectNewComments('e-ws', threads()).length, 0);
});

test('an edited comment (same Meetup ID, new text) is not reported', () => {
  detectNewComments('e-edit', threads());
  const edited = threads().map((c, i) => (i === 0 ? comment('Chip F.', 'HHS or Lake Fairfax? (edited)', { id: 'c1' }) : c));
  assert.equal(detectNewComments('e-edit', edited).length, 0);
});

test('a genuinely new comment is reported', () => {
  detectNewComments('e-new', threads());
  const added = [...threads(), comment('Dee K.', 'Bringing cones', { id: 'c3', created: inHours(1) })];
  const fresh = detectNewComments('e-new', added);
  assert.deepEqual(fresh.map((c) => c.content), ['Bringing cones']);
});

test('likes/pin changes are stored, and only already-posted comments ask for an edit', () => {
  detectNewComments('e-meta', threads());
  const [c1, c2] = threads();
  queries.setCommentMessage().run('msg-1', 'chan-1', c1.comment_id, 'e-meta');

  const updated = [{ ...c1, likes: 4 }, { ...c2, likes: 1 }];
  const edits = detectCommentUpdates('e-meta', updated);
  assert.deepEqual(edits, [{ messageId: 'msg-1', channelId: 'chan-1' }], 'c2 changed too but was never posted');
  const rows = Object.fromEntries(queries.getCommentsForEvent().all('e-meta').map((r) => [r.meetup_comment_id, r]));
  assert.equal(rows.c1.likes, 4);
  assert.equal(rows.c2.likes, 1);
  assert.deepEqual(detectCommentUpdates('e-meta', updated), [], 'no further edits without changes');
});

test('the browser backend (no is_pinned field) never unpins a comment', () => {
  detectNewComments('e-pin', threads());
  const browserView = threads().map(({ is_pinned, ...rest }) => rest); // eslint-disable-line no-unused-vars
  detectCommentUpdates('e-pin', browserView);
  const pinned = queries.getCommentsForEvent().all('e-pin').find((r) => r.meetup_comment_id === 'c2');
  assert.equal(pinned.is_pinned, 1);
});
