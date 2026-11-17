/**
 * GraphQL documents sent to https://www.meetup.com/gql2.
 *
 * These are our own queries, trimmed to the fields Rollcall reads. They are
 * modelled on the operations meetup.com's own frontend uses (snapshot in
 * docs/meetup-api/site-queries/), so the argument shapes are known to work.
 * Every field here is documented in docs/meetup-api/README.md and verified by
 * `pnpm run api-check` — when Meetup changes something, that check names the
 * exact operation and field that broke.
 */

// Lightweight auth probe. `self` is null (or errors) when not logged in.
const SELF = `
  query rollcallSelf {
    self {
      id
      name
    }
  }
`;

// Events for a group inside a date window. Mirrors the site's
// getUpcomingGroupEvents, minus PAST so we only page through what we track.
const GROUP_EVENTS = `
  query rollcallGroupEvents(
    $urlname: String!
    $afterDateTime: DateTime
    $beforeDateTime: DateTime
    $first: Int
    $after: String
  ) {
    groupByUrlname(urlname: $urlname) {
      id
      urlname
      events(
        filter: { status: [ACTIVE, CANCELLED], afterDateTime: $afterDateTime, beforeDateTime: $beforeDateTime }
        sort: ASC
        first: $first
        after: $after
      ) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            ...RollcallEvent
          }
        }
      }
    }
  }
`;

// A single event's details (quick poll, /test-* commands).
const EVENT = `
  query rollcallEvent($eventId: ID!) {
    event(id: $eventId) {
      ...RollcallEvent
    }
  }
`;

const EVENT_FRAGMENT = `
  fragment RollcallEvent on Event {
    id
    title
    eventUrl
    description
    dateTime
    endTime
    status
    maxTickets
    venue {
      id
      name
      address
      city
      state
    }
    going {
      totalCount
    }
  }
`;

// RSVPs for an event, paged. Called once per attendee tab with the same
// filter and sort the site's attendees page uses, so list order matches what
// people see on Meetup (waitlist in queue order). Note: with no filter at all
// it returns only the "going" RSVPs, not every status.
const EVENT_RSVPS = `
  query rollcallEventRsvps($eventId: ID!, $first: Int, $after: String, $filter: RsvpFilter, $sort: RsvpSort) {
    event(id: $eventId) {
      id
      rsvps(first: $first, after: $after, filter: $filter, sort: $sort) {
        totalCount
        yesCount
        noCount
        waitlistCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            status
            guestsCount
            updated
            member {
              id
              name
            }
          }
        }
      }
    }
  }
`;

const COMMENT_FIELDS = `
  id
  text
  created
  likeCount
  isPinned
  inReplyTo
  member {
    id
    name
  }
`;

// Comments, oldest first, with replies inline (the site asks for up to 1000
// replies per comment, so they are effectively never paged).
const EVENT_COMMENTS = `
  query rollcallEventComments($eventId: ID!, $first: Int, $after: String) {
    event(id: $eventId) {
      id
      comments(first: $first, after: $after, sortOrder: ASC) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            ${COMMENT_FIELDS}
            replies(first: 1000) {
              totalCount
              edges {
                node {
                  ${COMMENT_FIELDS}
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Pinned comments are a separate list on the site and may not appear in
// `comments`, so they are fetched and merged.
const EVENT_PINNED_COMMENTS = `
  query rollcallEventPinnedComments($eventId: ID!) {
    event(id: $eventId) {
      id
      pinnedComments {
        ${COMMENT_FIELDS}
        replies(first: 1000) {
          totalCount
          edges {
            node {
              ${COMMENT_FIELDS}
            }
          }
        }
      }
    }
  }
`;

// Token refresh. Sent to https://www.meetup.com/refresh-token (not /gql2),
// exactly as the site's Apollo error link does on `access_token_expired`.
const REFRESH_TOKENS = `
  mutation refreshTokensMutation {
    refreshTokens {
      session {
        accessToken
        refreshToken
      }
      error {
        code
        message
      }
    }
  }
`;

module.exports = {
  SELF,
  GROUP_EVENTS: GROUP_EVENTS + EVENT_FRAGMENT,
  EVENT: EVENT + EVENT_FRAGMENT,
  EVENT_RSVPS,
  EVENT_COMMENTS,
  EVENT_PINNED_COMMENTS,
  REFRESH_TOKENS,
};
