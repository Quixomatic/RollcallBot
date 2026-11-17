/**
 * GraphQL backend: fetch events, RSVPs and comments from Meetup's API and
 * return them in exactly the shapes the browser scrapers produce, so the
 * poller, change detection and notifier work unchanged with either backend.
 * New information (Meetup IDs, event status) rides along in extra fields.
 */

const crypto = require('crypto');
const client = require('./client');
const Q = require('./queries');

const PAGE_SIZE = 100;

// Attendee tabs, mirroring the site's attendees page (filter + sort per tab).
const RSVP_TABS = [
  {
    status: 'going',
    filter: { rsvpStatus: ['YES', 'ATTENDED', 'NO_SHOW', 'EXCUSED_ABSENCE'] },
    sort: { sortField: 'RELEVANCE', sortOrder: 'DESC', hostsFirst: true },
  },
  {
    status: 'waitlist',
    filter: { rsvpStatus: ['WAITLIST'] },
    sort: { sortField: 'LOCAL_TIME', sortOrder: 'ASC' },
  },
  {
    status: 'not_going',
    filter: { rsvpStatus: ['NO'] },
    sort: { sortField: 'RELEVANCE', sortOrder: 'DESC', hostsFirst: true },
  },
];

function eventIdFromUrl(eventUrl) {
  const id = eventUrl.match(/events\/(\d+)/)?.[1];
  if (!id) throw new Error(`Not a Meetup event URL: ${eventUrl}`);
  return id;
}

function urlnameFromGroupUrl(groupUrl) {
  return groupUrl.replace(/[?#].*$/, '').replace(/\/$/, '').split('/').pop();
}

/**
 * Location string in the same format the browser backend builds from the
 * page's JSON-LD: "<venue name> — <streetAddress>", where Meetup's JSON-LD
 * streetAddress is "<address>, <city>, <state>". Matching it exactly keeps a
 * backend switch from looking like a location change on every event.
 */
function formatLocation(venue) {
  if (!venue) return null;
  const street = [venue.address, venue.city, venue.state].filter(Boolean).join(', ');
  return [venue.name, street].filter(Boolean).join(' — ') || null;
}

function toEvent(node, guildId = null) {
  return {
    event_id: node.id,
    guild_id: guildId,
    title: node.title,
    url: node.eventUrl,
    date_time: node.dateTime,
    end_time: node.endTime,
    location: formatLocation(node.venue),
    description: node.description || null,
    rsvp_count: node.going?.totalCount ?? 0,
    waitlist_count: 0,
    max_tickets: node.maxTickets > 0 ? node.maxTickets : null, // capacity; null = unlimited
    status: node.status, // ACTIVE | CANCELLED | ...
  };
}

/** Page through a connection until hasNextPage is false. */
async function collectPages(fetchPage) {
  const nodes = [];
  let after = null;
  for (let page = 0; page < 50; page++) {
    const connection = await fetchPage(after);
    if (!connection) break;
    nodes.push(...connection.edges.map((e) => e.node));
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }
  return nodes;
}

/**
 * Events for a group from 3 hours ago (in-progress events stay tracked,
 * matching the poller's grace period) to `horizonDays` out. Includes
 * CANCELLED events so cancellations are reported from Meetup's own status.
 */
async function fetchEvents(groupUrl, guildId, { horizonDays = 30 } = {}) {
  const urlname = urlnameFromGroupUrl(groupUrl);
  const afterDateTime = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000);

  const nodes = await collectPages(async (after) => {
    const data = await client.gql(Q.GROUP_EVENTS, {
      urlname, afterDateTime, beforeDateTime: windowEnd.toISOString(), first: PAGE_SIZE, after,
    });
    if (!data.groupByUrlname) throw new Error(`Meetup group "${urlname}" not found`);
    return data.groupByUrlname.events;
  });

  console.log(`[meetup-api] ${nodes.length} event(s) for ${urlname} through ${windowEnd.toISOString().slice(0, 10)}`);
  return nodes.map((n) => toEvent(n, guildId));
}

/** Same shape as selectors.extractEventDetails, plus id/status/url. */
async function fetchEventDetails(eventUrl) {
  const data = await client.gql(Q.EVENT, { eventId: eventIdFromUrl(eventUrl) });
  if (!data.event) throw new Error(`Event not found: ${eventUrl}`);
  const e = toEvent(data.event);
  return {
    event_id: e.event_id,
    title: e.title,
    url: e.url,
    date_time: e.date_time,
    location: e.location,
    description: e.description,
    rsvp_count: e.rsvp_count,
    max_tickets: e.max_tickets,
    status: e.status,
  };
}

/** Same shape as scrapeRsvps: [{ member_name, rsvp_status, guests }], plus member_id/member_url. */
async function fetchRsvps(eventUrl) {
  const eventId = eventIdFromUrl(eventUrl);
  const rsvps = [];

  for (const tab of RSVP_TABS) {
    const nodes = await collectPages(async (after) => {
      const data = await client.gql(Q.EVENT_RSVPS, { eventId, first: PAGE_SIZE, after, filter: tab.filter, sort: tab.sort });
      return data.event?.rsvps;
    });
    for (const n of nodes) {
      if (!n.member) continue;
      rsvps.push({
        // Trimmed: some names carry trailing spaces in Meetup's data, which
        // the page (and so the browser backend's stored keys) doesn't show.
        member_name: (n.member.name || '').trim(),
        member_id: n.member.id,
        member_url: `https://www.meetup.com/members/${n.member.id}/`,
        rsvp_status: tab.status,
        guests: n.guestsCount || 0,
      });
    }
  }

  console.log(`[meetup-api] ${rsvps.length} RSVP(s) for event ${eventId}`);
  return rsvps;
}

/** The comment key both backends share: md5("<author>:<text>"). */
function commentHash(author, content) {
  return crypto.createHash('md5').update(`${author}:${content}`).digest('hex');
}

/**
 * Meetup's comment section shows authors as first name + last initial
 * ("Chip Finan" → "Chip F.", "Bryan G" → "Bryan G."), while the API returns
 * the full name. Using the displayed form keeps the comment key identical to
 * the browser backend's and keeps Discord posts showing what Meetup shows.
 */
function displayName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || 'Unknown';
  const last = parts.pop();
  return `${parts.join(' ')} ${last[0]}.`;
}

/**
 * Same shape as scrapeComments: oldest-first threads, each top-level comment
 * followed by its replies, with comment_id / parent_comment_id keyed the same
 * way. Adds meetup_comment_id and created (ISO).
 */
async function fetchComments(eventUrl) {
  const eventId = eventIdFromUrl(eventUrl);

  const topLevel = await collectPages(async (after) => {
    const data = await client.gql(Q.EVENT_COMMENTS, { eventId, first: PAGE_SIZE, after });
    return data.event?.comments;
  });

  // Pinned comments may live outside the regular list; merge any we haven't seen.
  const pinnedData = await client.gql(Q.EVENT_PINNED_COMMENTS, { eventId });
  const seenIds = new Set(topLevel.map((c) => c.id));
  for (const pinned of pinnedData.event?.pinnedComments || []) {
    if (!seenIds.has(pinned.id)) topLevel.push(pinned);
  }

  const byCreated = (a, b) => new Date(a.created) - new Date(b.created);
  topLevel.sort(byCreated);

  const comments = [];
  const usedIds = new Set();
  const idFor = (node) => {
    // Identical text from the same author would collide on the hash; keep the
    // first one on the shared key and make later ones unique with Meetup's ID.
    const content = (node.text || '').trim();
    let id = commentHash(displayName(node.member?.name), content);
    if (usedIds.has(id)) id = `${id}:${node.id}`;
    usedIds.add(id);
    return id;
  };

  for (const top of topLevel) {
    const topId = idFor(top);
    comments.push(toComment(top, topId, null));
    const replies = (top.replies?.edges || []).map((e) => e.node).sort(byCreated);
    for (const reply of replies) {
      comments.push(toComment(reply, idFor(reply), topId));
    }
  }

  console.log(`[meetup-api] ${comments.length} comment(s) for event ${eventId}`);
  return comments;
}

const MAX_COMMENT_LENGTH = 700; // meetup.com's limit for comments and replies

function mutationErrors(result) {
  const errors = result?.errors || [];
  return errors.length ? errors.map((e) => e.message || e.code).join('; ') : null;
}

/**
 * Post a comment on an event as the logged-in Meetup account, or a reply when
 * `replyTo` (a top-level comment's Meetup ID) is given. Meetup doesn't return
 * the new comment's ID, so it's found by re-reading the comments; returns
 * { meetupCommentId } (null if it couldn't be found).
 */
async function postComment(eventUrl, text, { replyTo = null } = {}) {
  const eventId = eventIdFromUrl(eventUrl);
  const body = (text || '').trim();
  if (!body) throw new Error('Comment text is empty');
  if (body.length > MAX_COMMENT_LENGTH) throw new Error(`Comment is ${body.length} characters; Meetup allows ${MAX_COMMENT_LENGTH}`);

  const data = replyTo
    ? await client.gql(Q.ADD_COMMENT_REPLY, { input: { eventId, text: body, commentId: replyTo } })
    : await client.gql(Q.ADD_COMMENT, { input: { eventId, text: body } });
  const failed = mutationErrors(replyTo ? data.addCommentReply : data.addComment);
  if (failed) throw new Error(`Meetup rejected the comment: ${failed}`);

  // Find it: the newest comment by this account with exactly this text.
  const self = await client.getSelf();
  const comments = await fetchComments(eventUrl);
  const mine = comments
    .filter((c) => c.author_id === self?.id && c.content === body)
    .sort((a, b) => new Date(b.created) - new Date(a.created))[0];
  console.log(`[meetup-api] Posted ${replyTo ? 'reply' : 'comment'} on event ${eventId}${mine ? ` (comment ${mine.meetup_comment_id})` : ''}`);
  return { meetupCommentId: mine?.meetup_comment_id || null };
}

/** Delete a comment (or a reply, with isReply) by its Meetup ID. */
async function deleteComment(eventUrl, meetupCommentId, { isReply = false } = {}) {
  const eventId = eventIdFromUrl(eventUrl);
  const data = isReply
    ? await client.gql(Q.DELETE_COMMENT_REPLY, { input: { eventId, replyId: meetupCommentId } })
    : await client.gql(Q.DELETE_COMMENT, { input: { eventId, commentId: meetupCommentId } });
  const failed = mutationErrors(isReply ? data.deleteCommentReply : data.deleteComment);
  if (failed) throw new Error(`Meetup refused to delete it: ${failed}`);
  console.log(`[meetup-api] Deleted ${isReply ? 'reply' : 'comment'} ${meetupCommentId} on event ${eventId}`);
}

function toComment(node, commentId, parentCommentId) {
  return {
    comment_id: commentId,
    meetup_comment_id: node.id,
    author_name: displayName(node.member?.name),
    author_id: node.member?.id || null,
    content: (node.text || '').trim(),
    posted_at: node.created,
    created: node.created,
    likes: node.likeCount || 0,
    is_reply: parentCommentId !== null,
    parent_comment_id: parentCommentId,
    is_pinned: !!node.isPinned,
  };
}

module.exports = {
  fetchEvents,
  fetchEventDetails,
  fetchRsvps,
  fetchComments,
  postComment,
  deleteComment,
  MAX_COMMENT_LENGTH,
  formatLocation,
  displayName,
  eventIdFromUrl,
  urlnameFromGroupUrl,
  ensureLoggedIn: client.ensureLoggedIn,
  getSelf: client.getSelf,
  clearSessionDead: client.clearSessionDead,
  isSessionDead: client.isSessionDead,
};
