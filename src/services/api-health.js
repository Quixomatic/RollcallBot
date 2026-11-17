/**
 * Meetup GraphQL health checks, shared by `pnpm run api-check` (CLI) and the
 * dashboard's Health page. Each result names the exact operation, field path
 * or enum value that failed, so Meetup API drift is easy to pin down.
 */

const api = require('./meetup-api');
const client = require('./meetup-api/client');
const Q = require('./meetup-api/queries');

// Enum values Rollcall understands. Anything else is reported as drift.
const KNOWN_EVENT_STATUS = ['ACTIVE', 'CANCELLED', 'PAST', 'DRAFT', 'AUTOSCHED', 'PROPOSED', 'CANCELLED_PERM'];
const KNOWN_RSVP_STATUS = ['YES', 'NO', 'WAITLIST', 'ATTENDED', 'NO_SHOW', 'EXCUSED_ABSENCE'];

/** Read a dotted path; returns undefined if any segment is missing. */
function at(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Run the checks. Returns { results: [{ section, level: ok|warn|fail, msg }], failures, eventUrl }.
 *
 *   groupUrl  group to list events for (required for the events check)
 *   eventUrl  event to check RSVPs/comments on (default: the next upcoming one)
 *   refresh   also force a token refresh
 *   onResult  optional callback per result (the CLI prints as it goes)
 */
async function runHealthChecks({ groupUrl = null, eventUrl = null, refresh = false, onResult = null } = {}) {
  const results = [];
  let section = '';
  const record = (level, msg) => {
    const r = { section, level, msg };
    results.push(r);
    if (onResult) onResult(r);
  };
  const ok = (m) => record('ok', m);
  const warn = (m) => record('warn', m);
  const fail = (m) => record('fail', m);
  const requirePaths = (label, obj, paths) => {
    const missing = paths.filter((p) => at(obj, p) === undefined || at(obj, p) === null);
    if (missing.length) fail(`${label}: missing/null ${missing.join(', ')}`);
    return missing.length === 0;
  };
  const check = async (name, fn) => {
    section = name;
    if (onResult) onResult({ section: name, level: 'section', msg: name });
    try {
      await fn();
    } catch (err) {
      fail(err.message + (err.errors ? ` — raw: ${JSON.stringify(err.errors).slice(0, 600)}` : ''));
    }
  };

  await check('Session', async () => {
    const self = await api.getSelf();
    if (!self) return fail('not logged in — upload a new session or run export-session.js');
    ok(`logged in as ${self.name} (member ${self.id})`);
    const claims = client.accessTokenClaims();
    if (!claims?.iat) warn('access token cookie missing or not a JWT');
    else ok(`session token issued ${new Date(claims.iat * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC (Meetup doesn't enforce its 1-hour exp)`);
  });

  if (refresh) {
    await check('Token refresh', async () => {
      const before = client.accessTokenClaims()?.iat;
      if (!(await client.refreshTokens())) return fail('refresh failed — see logs');
      const after = client.accessTokenClaims()?.iat;
      ok(after && after !== before ? 'refresh accepted; Meetup issued a new access token' : 'refresh accepted; Meetup returned the current token (normal — it does not enforce the token expiry)');
      const self = await api.getSelf();
      if (self) ok(`token works (self = ${self.name})`); else fail('self query failed after refresh');
    });
  }

  if (!groupUrl) {
    section = 'Group events';
    fail('no Meetup group URL configured');
  } else {
    await check('Group events', async () => {
      const urlname = api.urlnameFromGroupUrl(groupUrl);
      const data = await client.gql(Q.GROUP_EVENTS, {
        urlname,
        afterDateTime: new Date(Date.now() - 3 * 3600e3).toISOString(),
        beforeDateTime: new Date(Date.now() + 30 * 86400e3).toISOString(),
        first: 100,
      });
      if (!requirePaths('groupByUrlname', data, ['groupByUrlname.id', 'groupByUrlname.events.edges', 'groupByUrlname.events.pageInfo'])) return;
      const nodes = data.groupByUrlname.events.edges.map((e) => e.node);
      ok(`${nodes.length} event(s) in the next 30 days for ${urlname}`);
      for (const n of nodes) requirePaths(`event ${n.id}`, n, ['id', 'title', 'eventUrl', 'dateTime', 'status', 'going.totalCount']);
      const noVenue = nodes.filter((n) => !n.venue);
      if (noVenue.length) warn(`${noVenue.length} event(s) without a venue (online/TBD) — location will be empty`);
      const statuses = [...new Set(nodes.map((n) => n.status))];
      const unknown = statuses.filter((s) => !KNOWN_EVENT_STATUS.includes(s));
      if (unknown.length) fail(`unknown event status value(s): ${unknown.join(', ')}`); else ok(`statuses: ${statuses.join(', ') || 'none'}`);
      if (!eventUrl && nodes[0]) eventUrl = nodes[0].eventUrl;
    });
  }

  if (eventUrl) {
    const eventId = api.eventIdFromUrl(eventUrl);

    await check('Event lookup', async () => {
      const data = await client.gql(Q.EVENT, { eventId });
      if (!requirePaths('event', data, ['event.id', 'event.title', 'event.dateTime', 'event.status', 'event.eventUrl'])) return;
      ok(`"${data.event.title}" ${data.event.dateTime} ${data.event.status}`);
      ok(`location → "${api.formatLocation(data.event.venue)}"`);
    });

    await check('RSVPs', async () => {
      const unfiltered = await client.gql(Q.EVENT_RSVPS, { eventId, first: 100 });
      if (!requirePaths('event.rsvps', unfiltered, ['event.rsvps.totalCount', 'event.rsvps.edges', 'event.rsvps.pageInfo'])) return;
      const nodes = unfiltered.event.rsvps.edges.map((e) => e.node);
      for (const n of nodes) requirePaths(`rsvp ${n.id}`, n, ['id', 'status', 'member.id', 'member.name']);
      const unknown = [...new Set(nodes.map((n) => n.status))].filter((s) => !KNOWN_RSVP_STATUS.includes(s));
      if (unknown.length) fail(`unknown RSVP status value(s): ${unknown.join(', ')} — they would be dropped from every list`);

      // Each tab's list must add up to Meetup's own counters (yesCount includes guests).
      const rsvps = await api.fetchRsvps(eventUrl);
      const list = (s) => rsvps.filter((r) => r.rsvp_status === s);
      const goingPeople = list('going').reduce((s, r) => s + 1 + r.guests, 0);
      const { yesCount, waitlistCount, noCount } = unfiltered.event.rsvps;
      const compare = (label, ours, theirs) => (ours === theirs
        ? ok(`${label}: ${ours} matches Meetup`)
        : fail(`${label}: we have ${ours}, Meetup's counter says ${theirs}`));
      compare(`going (${list('going').length} RSVPs + ${goingPeople - list('going').length} guests)`, goingPeople, yesCount);
      compare('waitlist', list('waitlist').length, waitlistCount);
      compare('not going', list('not_going').length, noCount);
      const untrimmed = nodes.filter((n) => n.member?.name !== n.member?.name?.trim()).length;
      if (untrimmed) warn(`${untrimmed} member name(s) have stray whitespace in Meetup's data (trimmed by Rollcall)`);
    });

    await check('Comments', async () => {
      const data = await client.gql(Q.EVENT_COMMENTS, { eventId, first: 100 });
      if (!requirePaths('event.comments', data, ['event.comments.totalCount', 'event.comments.edges', 'event.comments.pageInfo'])) return;
      for (const { node } of data.event.comments.edges) {
        requirePaths(`comment ${node.id}`, node, ['id', 'text', 'created', 'member.name', 'replies.edges']);
      }
      const pinned = await client.gql(Q.EVENT_PINNED_COMMENTS, { eventId });
      if (!Array.isArray(pinned.event?.pinnedComments)) fail('event.pinnedComments is not a list');
      const comments = await api.fetchComments(eventUrl);
      ok(`${comments.length} comment(s) incl. replies; ${pinned.event?.pinnedComments?.length || 0} pinned`);
    });
  }

  return { results, failures: results.filter((r) => r.level === 'fail').length, eventUrl };
}

module.exports = { runHealthChecks };
