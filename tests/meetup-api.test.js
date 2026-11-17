// Mapping of Meetup GraphQL responses into Rollcall's shapes (no network: gql is stubbed).
const { setupEnv } = require('./helpers');
setupEnv();

const test = require('node:test');
const assert = require('node:assert/strict');
const client = require('../src/services/meetup-api/client');
const api = require('../src/services/meetup-api');

const URL = 'https://www.meetup.com/test-group/events/111/';

/** Stub client.gql: route by operation name to a handler (variables → data). */
function stubGql(handlers) {
  const calls = [];
  client.gql = async (query, variables) => {
    const op = query.match(/(?:query|mutation)\s+(\w+)/)[1];
    calls.push({ op, variables });
    if (!handlers[op]) throw new Error(`unexpected operation ${op}`);
    return handlers[op](variables);
  };
  client.getSelf = async () => ({ id: 'bot', name: 'Eventer' });
  return calls;
}

const node = (id, name, text, extra = {}) => ({
  id, text, created: extra.created || '2026-11-10T18:00:00-05:00', likeCount: extra.likes || 0, isPinned: !!extra.pinned, inReplyTo: null,
  member: { id: `m${id}`, name }, replies: { totalCount: 0, edges: (extra.replies || []).map((r) => ({ node: r })) },
});

test('formatLocation matches the JSON-LD string the browser backend builds', () => {
  assert.equal(api.formatLocation({ name: 'Lake Fairfax Field #1', address: 'Reston, VA 20190, USA', city: 'Reston', state: 'VA' }),
    'Lake Fairfax Field #1 — Reston, VA 20190, USA, Reston, VA');
  assert.equal(api.formatLocation({ name: 'Online' }), 'Online');
  assert.equal(api.formatLocation(null), null);
});

test('displayName abbreviates like Meetup\'s comment section', () => {
  assert.equal(api.displayName('Chip Finan'), 'Chip F.');
  assert.equal(api.displayName('Bryan G'), 'Bryan G.');
  assert.equal(api.displayName('  Mary Ann Smith '), 'Mary Ann S.');
  assert.equal(api.displayName('Eventer'), 'Eventer');
  assert.equal(api.displayName(''), 'Unknown');
});

test('eventIdFromUrl / urlnameFromGroupUrl', () => {
  assert.equal(api.eventIdFromUrl('https://www.meetup.com/g/events/317182497/?x=1'), '317182497');
  assert.throws(() => api.eventIdFromUrl('https://www.meetup.com/g/'));
  assert.equal(api.urlnameFromGroupUrl('https://www.meetup.com/reston-pickup-soccer-rps/'), 'reston-pickup-soccer-rps');
});

test('fetchEvents maps fields, capacity and status, and pages until done', async () => {
  const ev = (id, extra = {}) => ({
    id, title: `E${id}`, eventUrl: `https://www.meetup.com/g/events/${id}/`, description: 'd', dateTime: '2026-12-01T19:00:00-05:00',
    endTime: '2026-12-01T22:00:00-05:00', status: 'ACTIVE', maxTickets: 24, going: { totalCount: 9 },
    venue: { name: 'Field', address: '1 Rd', city: 'Reston', state: 'VA' }, ...extra,
  });
  const calls = stubGql({
    rollcallGroupEvents: ({ after }) => ({
      groupByUrlname: {
        events: after
          ? { edges: [{ node: ev('3', { status: 'CANCELLED', maxTickets: 0 }) }], pageInfo: { hasNextPage: false } }
          : { edges: [{ node: ev('1') }, { node: ev('2') }], pageInfo: { hasNextPage: true, endCursor: 'c1' } },
      },
    }),
  });
  const events = await api.fetchEvents('https://www.meetup.com/g/', 'guild-1', { horizonDays: 30 });
  assert.equal(calls.length, 2, 'followed pagination');
  assert.equal(events.length, 3);
  assert.deepEqual(
    { id: events[0].event_id, guild: events[0].guild_id, loc: events[0].location, going: events[0].rsvp_count, max: events[0].max_tickets },
    { id: '1', guild: 'guild-1', loc: 'Field — 1 Rd, Reston, VA', going: 9, max: 24 },
  );
  assert.equal(events[2].status, 'CANCELLED');
  assert.equal(events[2].max_tickets, null, 'maxTickets 0 means unlimited');
  assert.ok(calls[0].variables.beforeDateTime, 'queries a bounded window');
});

test('fetchRsvps uses one query per tab, maps statuses, trims names, keeps guests', async () => {
  stubGql({
    rollcallEventRsvps: ({ filter }) => {
      const s = filter.rsvpStatus;
      const edges = s.includes('YES') ? [{ node: { status: 'YES', guestsCount: 1, member: { id: '1', name: 'Emad Farouz ' } } }, { node: { status: 'ATTENDED', guestsCount: 0, member: { id: '2', name: 'Ann' } } }]
        : s.includes('WAITLIST') ? [{ node: { status: 'WAITLIST', guestsCount: 0, member: { id: '3', name: 'Wes' } } }]
          : [{ node: { status: 'NO', guestsCount: 2, member: { id: '4', name: 'Ned' } } }];
      return { event: { rsvps: { edges, pageInfo: { hasNextPage: false } } } };
    },
  });
  const rsvps = await api.fetchRsvps(URL);
  assert.deepEqual(rsvps.map((r) => [r.member_name, r.rsvp_status, r.guests]), [
    ['Emad Farouz', 'going', 1], ['Ann', 'going', 0], ['Wes', 'waitlist', 0], ['Ned', 'not_going', 2],
  ]);
  assert.equal(rsvps[0].member_id, '1');
});

test('fetchComments: oldest first, replies threaded, pinned merged once, display names', async () => {
  const reply = node('r1', 'James Freund', 'We will check HHS', { created: '2026-11-10T18:30:00-05:00' });
  const pinned = node('p1', 'Bryan G', 'Go to Herndon hs', { pinned: true, created: '2026-11-10T18:10:00-05:00' });
  stubGql({
    rollcallEventComments: () => ({
      event: {
        comments: {
          edges: [
            { node: node('c2', 'Chip Finan', 'We are at lake Fairifax', { created: '2026-11-10T19:00:00-05:00', likes: 2 }) },
            { node: node('c1', 'Chip Finan', 'HHS or Lake Fairifax?', { replies: [reply] }) },
            { node: pinned },
          ],
          pageInfo: { hasNextPage: false },
        },
      },
    }),
    rollcallEventPinnedComments: () => ({ event: { pinnedComments: [pinned] } }),
  });
  const comments = await api.fetchComments(URL);
  assert.deepEqual(comments.map((c) => [c.author_name, c.content, c.is_reply]), [
    ['Chip F.', 'HHS or Lake Fairifax?', false],
    ['James F.', 'We will check HHS', true],
    ['Bryan G.', 'Go to Herndon hs', false],
    ['Chip F.', 'We are at lake Fairifax', false],
  ]);
  assert.equal(comments[1].parent_comment_id, comments[0].comment_id, 'reply points at its parent');
  assert.equal(comments[2].is_pinned, true);
  assert.equal(comments[3].likes, 2);
  assert.equal(new Set(comments.map((c) => c.comment_id)).size, 4, 'pinned comment not duplicated');
});

test('fetchComments: identical text from the same author gets distinct keys', async () => {
  stubGql({
    rollcallEventComments: () => ({
      event: { comments: { edges: [{ node: node('a', 'Ann Lee', 'here') }, { node: node('b', 'Ann Lee', 'here', { created: '2026-11-10T20:00:00-05:00' }) }], pageInfo: { hasNextPage: false } } },
    }),
    rollcallEventPinnedComments: () => ({ event: { pinnedComments: [] } }),
  });
  const [first, second] = await api.fetchComments(URL);
  assert.notEqual(first.comment_id, second.comment_id);
  assert.ok(second.comment_id.endsWith(':b'));
});

test('postComment sends the right mutation, enforces 700 chars, reports Meetup errors', async () => {
  const calls = stubGql({
    addComment: () => ({ addComment: { errors: [] } }),
    addCommentReply: () => ({ addCommentReply: { errors: [{ code: 'NOPE', message: 'replies closed' }] } }),
    rollcallEventComments: () => ({ event: { comments: { edges: [{ node: { ...node('n1', 'Eventer', 'James: hi'), member: { id: 'bot', name: 'Eventer' } } }], pageInfo: { hasNextPage: false } } } }),
    rollcallEventPinnedComments: () => ({ event: { pinnedComments: [] } }),
  });
  const { meetupCommentId } = await api.postComment(URL, '  James: hi ');
  assert.equal(meetupCommentId, 'n1', 'found the new comment by author and text');
  assert.deepEqual(calls[0].variables, { input: { eventId: '111', text: 'James: hi' } });

  await assert.rejects(api.postComment(URL, 'x'.repeat(701)), /700/);
  await assert.rejects(api.postComment(URL, '   '), /empty/);
  await assert.rejects(api.postComment(URL, 'yo', { replyTo: 'c1' }), /replies closed/);
});

test('deleteComment uses replyId for replies', async () => {
  const calls = stubGql({
    deleteComment: () => ({ deleteComment: { errors: [] } }),
    deleteCommentReply: () => ({ deleteCommentReply: { errors: [] } }),
  });
  await api.deleteComment(URL, 'c1');
  await api.deleteComment(URL, 'r1', { isReply: true });
  assert.deepEqual(calls[0].variables, { input: { eventId: '111', commentId: 'c1' } });
  assert.deepEqual(calls[1].variables, { input: { eventId: '111', replyId: 'r1' } });
});
