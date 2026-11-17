# Meetup GraphQL API — how Rollcall uses it

Rollcall 2.x reads Meetup data from the same GraphQL API that meetup.com's own
web app uses, instead of scraping rendered pages. This is an **undocumented,
internal API**: Meetup can change it at any time. This document records
everything we know about it so that when something breaks, the cause is easy
to find.

- **Our queries:** [`src/services/meetup-api/queries.js`](../../src/services/meetup-api/queries.js)
- **Client (auth, refresh, errors):** [`src/services/meetup-api/client.js`](../../src/services/meetup-api/client.js)
- **Mapping to Rollcall's data:** [`src/services/meetup-api/index.js`](../../src/services/meetup-api/index.js)
- **Health check:** `pnpm run api-check` ([`src/api-check.js`](../../src/api-check.js))
- **Snapshot of every operation the site uses:** [`site-queries/INDEX.md`](site-queries/INDEX.md)

The original browser scraper is still there. Set `MEETUP_BACKEND=browser` to
use it (see [Switching backends](#switching-backends)).

## When something breaks

1. Run the health check from wherever the bot runs:

   ```sh
   docker exec rollcall node src/api-check.js            # Docker
   pnpm run api-check                                     # local
   pnpm run api-check -- --refresh                        # also test token refresh
   ```

   Each failure names the exact operation and field path (`event 123: missing/null venue.name`),
   an unknown enum value (`unknown RSVP status value(s): MAYBE`), or quotes Meetup's own
   GraphQL error, which names any field or argument that no longer exists.
2. If a field or operation changed, recapture what the site does now and diff it:

   ```sh
   node src/export-session.js data/capture-session.json     # separate login, see below
   MEETUP_STATE_FILE=data/capture-session.json node tools/meetup-capture/capture.js https://www.meetup.com/<group>/
   node tools/meetup-capture/extract-site-queries.js data/capture/<timestamp>
   git diff docs/meetup-api/site-queries
   ```

   The diff shows exactly which site operations or fragments changed. Update the matching
   query in `queries.js` and the field table below.
3. Meanwhile, switch to the browser backend (`MEETUP_BACKEND=browser`) to keep the bot running.

## Endpoints

| Endpoint | Method | Used for |
|---|---|---|
| `https://www.meetup.com/gql2` | POST | Every query |
| `https://www.meetup.com/refresh-token` | POST | `refreshTokensMutation` only |

Request: `content-type: application/json`, body `{ operationName, variables, query }`.
Headers that matter: `cookie` (the session), `origin: https://www.meetup.com`,
`apollographql-client-name: nextjs-web`.

- The site itself sends **persisted queries** (only a SHA-256 hash, no query text). Those hashes
  change whenever Meetup deploys. Rollcall does **not** use hashes: `/gql2` accepts full query
  text, so we send our own queries and only break if a field we actually use changes.
- No Cloudflare challenge on `/gql2` as of Nov 2026: plain Node `fetch` works with only the cookies.
- Page sizes up to at least 100 are accepted (`first: 100`).

## Authentication

Cookie-based, shared with the browser backend through the Playwright storageState file
`data/browser-state/state.json`, produced by `src/export-session.js` (log in with real Chrome)
or `src/login-server.js`.

| Cookie | What | Lifetime |
|---|---|---|
| `__meetup_auth_access_token` | JWT, sent with every request; the one that authenticates | JWT `exp` says **1 hour**, but **not enforced** (see below) |
| `__meetup_auth_refresh_token` | JWT, exchanged for a new access token | JWT `exp` 1 year |
| `MEETUP_SESSION` | Session cookie | 1 year |

**In practice a session lasts until Meetup ends it server-side** (about a month between forced
re-logins in Sep–Nov 2026), regardless of the access token's `exp`.

### Token refresh

Taken from meetup.com's Apollo client (`_app` bundle, the `access_token_expired` handler):

1. A request with an expired access token fails with a GraphQL error whose
   `extensions.classification` is **`access_token_expired`**.
2. The site POSTs [`refreshTokensMutation`](site-queries/refreshTokensMutation.graphql) to
   **`https://www.meetup.com/refresh-token`** with its cookies, then retries the original request.
3. `extensions.classification` **`access_token_invalid`** means the session is gone: the site
   redirects to login. Rollcall pauses polling and logs that a re-login is needed.

Verified behaviour of `/refresh-token`:

- Returns the tokens **both** as `Set-Cookie` headers (`__meetup_auth_access_token`,
  `__meetup_auth_refresh_token`) **and** in the body at `data.refreshTokens.session`.
  Rollcall applies both and writes them back to `state.json`.
- Can be called at any time. While the access token is still valid it returns the **same** token.
- `data.refreshTokens.error { code message }` is set when the refresh token itself is rejected.

Observed 2026-11-17:

- The access token is what authenticates: a request with *only* `__meetup_auth_access_token`
  is logged in; the same cookies *without* it are treated as logged out.
- **Meetup does not enforce the JWT's `exp`.** A fresh session was still accepted every
  10 minutes after its `exp`, and the production session — whose access token was issued at a
  login three weeks earlier and never replaced — kept working throughout. No
  `access_token_expired` error was ever returned.
- `/refresh-token` returns the **same** token, before and after `exp`.

So Rollcall does **not** refresh on a timer. It refreshes (and retries once) only when Meetup
actually answers `access_token_expired`, exactly as meetup.com's own client does, so it keeps
working if Meetup starts enforcing expiry. Concurrent requests share a single refresh. A session
ends when Meetup returns `access_token_invalid` (or `self` comes back null): polling pauses and
the dashboard's **Meetup session** page asks for a new upload.

## Operations Rollcall uses

All are our own trimmed versions of site operations (the site operation is linked).

### `rollcallSelf`: session check

Modelled on [`getSelf`](site-queries/getSelf.graphql). `self { id name }`. Null `self` (or an
auth error) means not logged in.

### `rollcallGroupEvents`: event listing

Modelled on [`getUpcomingGroupEvents`](site-queries/getUpcomingGroupEvents.graphql).

```graphql
groupByUrlname(urlname: $urlname) {
  events(filter: { status: [ACTIVE, CANCELLED], afterDateTime, beforeDateTime }, sort: ASC, first, after)
}
```

- Window: from 3 hours ago (in-progress events) to `event_horizon_days` (`/config horizon`, default 30).
- `filter.status` values seen in the site's queries: `ACTIVE`, `PAST`, `CANCELLED`.
- Paged with `pageInfo { hasNextPage endCursor }`.

### `rollcallEvent`: one event

Modelled on the `event(id:)` lookups the event page makes. Used by quick polls, the `/test-*`
commands, and to check any event that drops out of the listing (see [Cancellations](#cancellations)).

**Event fields** (`RollcallEvent` fragment, based on [`CoreGroupHomeEvent`](site-queries/CoreGroupHomeEvent.graphql)):

| Field | Rollcall field | Notes |
|---|---|---|
| `id` | `event_id` | |
| `title` | `title` | |
| `eventUrl` | `url` | |
| `description` | `description` | Markdown-ish plain text |
| `dateTime` | `date_time` | ISO with offset, e.g. `2026-11-17T19:00:00-05:00`; identical to the page's JSON-LD `startDate` |
| `endTime` | `end_time` | |
| `status` | `status` | `ACTIVE`, `CANCELLED`, `PAST` seen |
| `venue { name address city state }` | `location` | Built as `"<name> — <address>, <city>, <state>"`, identical to the browser backend's JSON-LD string |
| `going.totalCount` | `rsvp_count` | Includes guests |
| `maxTickets` | | Capacity (not stored yet) |

### `rollcallEventRsvps`: attendees

Modelled on [`getEventByIdForAttendees`](site-queries/getEventByIdForAttendees.graphql) /
[`AttendeesRsvp`](site-queries/AttendeesRsvp.graphql). Called **once per attendee tab** with the
same filter and sort the site's attendees page uses:

| Tab | `filter.rsvpStatus` | `sort` | Rollcall status |
|---|---|---|---|
| Going | `YES, ATTENDED, NO_SHOW, EXCUSED_ABSENCE` | `RELEVANCE DESC, hostsFirst` | `going` |
| Waitlist | `WAITLIST` | `LOCAL_TIME ASC` (queue order) | `waitlist` |
| Not going | `NO` | `RELEVANCE DESC, hostsFirst` | `not_going` |

- **No filter returns only "going"**, not every status.
- `ATTENDED`, `NO_SHOW` and `EXCUSED_ABSENCE` appear on past events once check-in is used.

| Field | Rollcall field | Notes |
|---|---|---|
| `member.name` | `member_name` | **Trimmed**: some names have trailing spaces in Meetup's data |
| `member.id` | `member_id` | Stable across renames |
| `guestsCount` | `guests` | |
| `status` | see table above | |
| `rsvps.yesCount` / `waitlistCount` / `noCount` | | Meetup's counters. `yesCount` **includes guests**. `api-check` compares our lists against them |

### `rollcallEventComments` + `rollcallEventPinnedComments`: comments

Modelled on [`eventByIdComments`](site-queries/eventByIdComments.graphql),
[`eventByIdPinnedComments`](site-queries/eventByIdPinnedComments.graphql) and
[`EventCommentEdge`](site-queries/EventCommentEdge.graphql).

- `comments(first, after, sortOrder: ASC)`, paged; `replies(first: 1000)` inline (the site uses 1000 too).
- Pinned comments come from `pinnedComments` and are merged in by ID. They also appear in the
  regular list; the browser scraper saw them twice.

| Field | Rollcall field | Notes |
|---|---|---|
| `id` | `meetup_comment_id` | Stable across edits |
| `text` | `content` | Trimmed |
| `member.name` | `author_name` | Shown as on the site: first name + last initial (`Chip Finan` → `Chip F.`) |
| `created` | `posted_at` | ISO timestamp (the browser backend stored "3 days ago") |
| `likeCount` | `likes` | |
| `isPinned` | `is_pinned` | |
| `replies.edges[].node` | rows with `is_reply`, `parent_comment_id` | |

**Comment key:** `comment_id = md5("<author as displayed>:<text>")`, the same in both backends,
so switching backends never re-posts comments. On top of that, the GraphQL backend matches
on `meetup_comment_id` (an edited comment isn't re-posted) and records silently any comment
created before the last one already stored for the event.

## Writing: comments

The only write operations Rollcall uses. Verbatim site mutations
([`addComment`](site-queries/addComment.graphql), [`addCommentReply`](site-queries/addCommentReply.graphql),
[`deleteComment`](site-queries/deleteComment.graphql), [`deleteCommentReply`](site-queries/deleteCommentReply.graphql));
the input shapes come from how meetup.com's bundles call them:

| Mutation | Input | Notes |
|---|---|---|
| `addComment` | `{ eventId, text, isPrivate? }` | |
| `addCommentReply` | `{ eventId, text, commentId }` | `commentId` = the top-level comment |
| `deleteComment` | `{ eventId, commentId }` | |
| `deleteCommentReply` | `{ eventId, replyId }` | note: `replyId`, not `commentId` |

- Text is limited to **700 characters** (the site's limit for both). Rollcall prefixes the
  admin's name (`James: …`), and the limit includes it.
- They return only `errors { code message field }`, **not the new comment's ID**; Rollcall finds
  it by re-reading the comments (newest by the bot account with that exact text).
- Verified live 2026-11-17 on a past event: comment and reply posted, threaded correctly, then
  both deleted.
- The dashboard only deletes comments whose author is the bot account (checked against Meetup
  first), even though an organizer account could delete members' comments.

## Cancellations

With the GraphQL backend an event is **only** marked cancelled when Meetup itself reports
`status: CANCELLED` for it, either in the listing or from a direct `rollcallEvent` lookup.
Every stored upcoming event missing from the listing is looked up individually:

| Lookup result | What Rollcall does |
|---|---|
| `ACTIVE` (e.g. moved outside the window) | Keeps it; date/venue changes are reported as updates |
| `CANCELLED` | Marks it cancelled and posts the cancellation |
| Not found (deleted outright) | Hides it silently (no post); it comes back if it reappears |
| Request failed (network/session) | Leaves it alone |

The browser backend has no lookup, so it keeps the v1 behaviour of inferring cancellation from
absence (with the empty-scrape guard).

## Switching backends

`MEETUP_BACKEND=graphql` (default) or `MEETUP_BACKEND=browser`. Both:

- read and write the same `data/browser-state/state.json`;
- produce the same stored keys (event IDs, RSVP member names, comment hashes) and the same
  location strings;
- leave the new columns (`rsvps.member_id`, `comments.meetup_comment_id`) as extras that
  the browser backend leaves empty.

Before switching on a live server you can diff the two on one event:

```sh
node src/api-check.js --parity https://www.meetup.com/<group>/events/<id>/
```

Known browser-scraper differences found this way (Nov 2026): it lists the logged-in account's
own avatar on every attendee tab (hidden by `/config botname`); it can miss people on long
attendee tabs when lazy loading stops early; and it reads the pinned comment twice.
