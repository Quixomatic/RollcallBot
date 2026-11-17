// Live, read-only checks against the real Meetup API. Opt-in:
//   pnpm test:live            (uses data/browser-state/state.json)
//   LIVE_GROUP_URL=https://www.meetup.com/<group>/ pnpm test:live
// Skipped unless LIVE=1. Nothing is posted or changed on Meetup.
const test = require('node:test');
const assert = require('node:assert/strict');

const LIVE = process.env.LIVE === '1';
const GROUP_URL = process.env.LIVE_GROUP_URL || 'https://www.meetup.com/reston-pickup-soccer-rps/';

test('Meetup API health checks all pass', { skip: !LIVE && 'set LIVE=1 to run' }, async () => {
  const { runHealthChecks } = require('../../src/services/api-health');
  const { results, failures } = await runHealthChecks({ groupUrl: GROUP_URL });
  const failed = results.filter((r) => r.level === 'fail').map((r) => `${r.section}: ${r.msg}`);
  assert.equal(failures, 0, failed.join('\n'));
});

test('events, RSVPs and comments come back in the expected shapes', { skip: !LIVE && 'set LIVE=1 to run' }, async () => {
  const api = require('../../src/services/meetup-api');
  const events = await api.fetchEvents(GROUP_URL, 'live', { horizonDays: 14 });
  assert.ok(events.length > 0, 'the group has upcoming events');
  for (const e of events) {
    assert.match(e.event_id, /^\d+$/);
    assert.match(e.date_time, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(['ACTIVE', 'CANCELLED'].includes(e.status), `status ${e.status}`);
  }
  const rsvps = await api.fetchRsvps(events[0].url);
  for (const r of rsvps) assert.ok(['going', 'waitlist', 'not_going'].includes(r.rsvp_status));
  const comments = await api.fetchComments(events[0].url);
  for (const c of comments) assert.ok(c.comment_id && c.meetup_comment_id && typeof c.likes === 'number');
});
