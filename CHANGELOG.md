# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.2] - 2026-11-17

### Added
- **Post comments to Meetup from Discord.** `/comment <event> <text>` (Administrator) posts a comment on an upcoming event as the bot's Meetup account, signed with the admin's server nickname (`James: see you at Lake Fairfax`). The event option autocompletes from tracked upcoming events. The comment then appears in the comments channel on the next poll like any other.
- **Comment from the dashboard.** Each event page has a comment box (sign with any name; it's remembered in your browser) with a live preview of exactly how it will read on Meetup and a character counter, a **Reply** button on each comment thread, and **Delete** on the bot account's own comments in the Live tab. The dashboard refuses to delete anyone else's comments.
- The local dry run (`pnpm run dev`) blocks posting or deleting Meetup comments, since its Meetup calls are real, unless `DEV_ALLOW_MEETUP_WRITES=1` is set.
- Comment mutations (`addComment`, `addCommentReply`, `deleteComment`, `deleteCommentReply`) documented in `docs/meetup-api/README.md`, including their input shapes and the 700-character limit. Verified live on a past event.

## [2.0.1] - 2026-11-17

### Added
- Uptime Kuma-style **monitors** on the dashboard's Overview and API health pages: one row of heartbeat ticks per check type (event listing, RSVPs, comments), green or red, newest on the right, with a tooltip per tick (time, duration, error), 24-hour and 7-day success rates, and average response time.

### Fixed
- The dashboard showed a working Meetup session as "Expired". Meetup's access token claims a 1-hour lifetime but Meetup doesn't enforce it (the production session's token was three weeks past its `exp` and still worked), so the dashboard now shows whether the session actually works, verified live against Meetup, and when it was logged in.
- Having the dashboard open no longer sends anything to Meetup. The session badge used to re-check the logged-in account against Meetup up to once a minute; it now shows the result of the poller's own session check from its last scheduled poll.
- Stopped calling `/refresh-token` every 5 minutes. Since Meetup returns the same token anyway, the client now only refreshes when Meetup actually reports `access_token_expired`, like meetup.com's own client.

## [2.0.0] - 2026-11-17

### Added
- **Web dashboard** (Vite + React + TypeScript, TanStack Router and Query, shadcn/ui on Tailwind v4), served by the bot on port 3000 when `DASHBOARD_PASSWORD` is set. Single admin password with a signed httpOnly cookie and login rate limiting.
  - **Overview:** Meetup session and token, active backend, poller state with next full/quick poll times, the next event per server, recent scrape errors, and a Poll now button.
  - **Events:** every tracked event with going (incl. guests) / waitlist / not-going / comment counts and live-polling status. Each event has its own page with the RSVP lists, comment threads, a read-only **Live from Meetup** tab that highlights anything not yet stored, event details and reminders sent, and **Rescan now** / **Post RSVP summary** actions that report exactly what changed.
  - **API health:** runs the `api-check` suite from the browser, plus the scrape history.
  - **Meetup session:** logged-in account, token status, manual refresh, and **upload of a new `state.json`**. Uploads are verified live against Meetup (renewing an expired access token with the uploaded refresh token if needed) before replacing anything; the previous session is backed up and polling resumes. Re-login is now: export locally, drop the file on the dashboard.
  - **Logs:** live tail of the bot's output with level filter and search.
  - **Settings:** everything `/config` sets, with Discord channel pickers and the same validation.
- `pnpm run dev`: local dry run of the real poller, backend and dashboard with a stand-in Discord client that records posts instead of sending them (shown on a **Discord outbox** page with embeds rendered Discord-style) and a separate `data/dev.db`.
- The Docker image builds the dashboard in a separate stage and exposes port 3000.
- **GraphQL backend (now the default).** Rollcall reads events, RSVPs and comments from Meetup's GraphQL API (`/gql2`, the API meetup.com's own web app uses) over plain HTTP, instead of loading and scraping pages in a headless browser. A full poll takes well under a second and polling no longer launches a browser at all. Playwright is still used to log in.
- `MEETUP_BACKEND` setting: `graphql` (default) or `browser`. The original Playwright scraper is kept intact as a fallback. Both backends share the session file, produce the same stored keys (event IDs, RSVP member names, comment hashes) and the same location strings, so switching in either direction never re-posts comments or reports false changes.
- Automatic token refresh. Meetup's access token lasts 1 hour; the client renews it with the 1-year refresh token through `/refresh-token` (the same flow meetup.com uses), proactively before expiry and on an `access_token_expired` error, and writes the new tokens back to `state.json`. An `access_token_invalid` response pauses polling with a clear re-login message, as before.
- `pnpm run api-check` (`node src/api-check.js`): runs every query the bot uses against the live API and names the exact operation, field path or enum value that changed if Meetup alters something. Compares RSVP lists against Meetup's own counters. `--refresh` tests token renewal, `--parity <event>` diffs the browser and GraphQL backends on one event, `--report` writes an HTML page of everything returned.
- `docs/meetup-api/`: endpoints, auth and refresh flow, error classifications, every operation and field Rollcall uses with its mapping, and a snapshot of all 346 GraphQL operations and fragments meetup.com's frontend ships (`site-queries/`), indexed with the persisted-query hashes and variables observed live.
- `tools/meetup-capture/`: records meetup.com's network traffic while running the scrape flows, and regenerates the `site-queries` snapshot so `git diff` shows exactly what Meetup changed.
- RSVPs store Meetup member IDs (`rsvps.member_id`) and comments store Meetup comment IDs (`comments.meetup_comment_id`). Both are additive columns; existing data is untouched.
- Pinned comments are fetched explicitly and merged in, and show a `📌 Pinned` tag in the Discord comment post, next to the like count (GraphQL backend).
- `/status` shows which backend is active.

### Changed
- Scheduled polls, `/poll` and dashboard actions share one lock, so a manual poll can no longer overlap a scheduled one (`/poll` reports "already running" instead).
- The database falls back to Node's built-in `node:sqlite` when the native `better-sqlite3` module can't load (local development on a different Node version). Docker always uses `better-sqlite3`.
- With the GraphQL backend an event is only ever reported cancelled when Meetup itself returns `status: CANCELLED` for it. Every stored event that drops out of the listing is looked up by ID: still active → kept (date/venue changes reported as updates), cancelled → announced once, deleted outright → hidden without a post, lookup failed → left alone. The browser backend keeps inferring cancellation from absence, since it has no way to look an event up.
- The event listing (GraphQL backend) now honours `/config horizon`, fetching exactly the window from 3 hours ago to the horizon.
- RSVP lists keep Meetup's order for each tab, including the waitlist's queue order.
- An edited comment is no longer re-posted as new (matched by Meetup comment ID).

### Fixed
- RSVP lists are exact. A parity check against the browser scraper found it listing the bot account's own header avatar on every attendee tab and missing people on long tabs when lazy loading stopped early. GraphQL lists match Meetup's own yes/waitlist/no counters, guests included.
- The pinned comment is no longer read twice.
- Member names with stray whitespace in Meetup's data are trimmed.
- `export-session.js` and the README pointed at the wrong NAS data folder (`rollcall/data` instead of `rollcallbot/data`).
- `/silence setup` now checks the bot's own permissions before touching any channel and lists exactly which ones to grant, using the names shown in Discord's role settings. Previously it tried every channel and reported a bare "Missing Permissions" on each. Per-channel failures also name the permissions a channel overwrite takes away from the bot.

## [1.0.30] - 2026-09-30

### Added
- `/silence` command to make a member read-only without a visible timeout. `/silence setup` creates a `rollcall-silenced` role and denies it every send, react, thread, voice, invite and app permission on every category and channel, leaving View Channel and Read Message History untouched. It is safe to re-run and reports any channels it could not update. `/silence user`, `/silence remove` and `/silence list` assign, remove and list the role. After silencing, the bot reports any channel where another role's allow overwrite still lets the member post, react or join voice, and it refuses to silence administrators, since they bypass channel permissions.
- New channels automatically get the silence role's deny overwrite when created.
- README section on refreshing an expired Meetup session with `src/export-session.js`.

### Notes
- `/silence` needs the bot to have **Manage Roles** plus every permission it denies, because Discord only lets a bot deny permissions it holds itself. See the README for the full list.

## [1.0.29] - 2026-08-19

### Fixed
- Events wrongly marked cancelled can now recover. `upsertEvent` clears `is_cancelled` when an event reappears in a scrape. Previously the flag was permanent: an event only reaches the upsert because it was present in the scrape, but nothing ever reset the flag, so a wrongly cancelled event stayed hidden from every query forever and the only recovery was wiping the database.
- A scrape that returns zero events no longer cancels the entire events table. `detectEventChanges` treats an empty result as a failed scrape (selector miss, popup over the listing, half-expired session that still passes `isLoggedIn()`) and skips cancellation detection instead of flagging every stored event at once.

### Changed
- Cancellation detection now logs what it flagged and why, including the scrape count it based the decision on, so a mass cancellation is visible in the logs instead of silent.

## [1.0.28] - 2026-08-18

### Added
- `src/export-session.js` — export a Playwright `storageState` from a real, human-driven Chrome window over the DevTools protocol. The Meetup auth cookies are `httpOnly` and therefore invisible to `document.cookie`, so CDP is the only way to capture them from a normal browser. Log in with real Chrome (where the captcha behaves), dump the session, copy the file to the host. Validates that the required auth cookies are present before writing, and leaves the Chrome window open on exit.

### Fixed
- `login-server.js` no longer restores the existing `state.json` before logging in. Meetup uses hCaptcha, and the saved state carries its reputation cookies (`hmt_id`, `__cf_bm`) along with `MEETUP_BROWSER_ID`. Once that browser identity was flagged, restoring it replayed the flag into every retry, so the captcha failed consistently rather than intermittently. Login now starts from a clean context, backing up any existing session first.
- `login-server.js` no longer overwrites a working `state.json` when the login fails. It verifies `MEETUP_SESSION`, `__meetup_auth_access_token` and `__meetup_auth_refresh_token` are present before saving, and exits non-zero otherwise.

### Changed
- Removed the hardcoded `Chrome/131.0.0.0` user agent from `login-server.js`. The image ships Chromium 145, so the pinned string contradicted the `Sec-CH-UA` client hints on every request. The stealth plugin's `user-agent-override` evasion now owns the UA, platform and client hints, keeping them consistent and masking Linux as Windows.

## [1.0.27] - 2026-03-20

### Fixed
- `/test-rsvps` now posts to the current channel instead of the configured RSVP channel

## [1.0.26] - 2026-03-20

### Added
- Footer on RSVP embeds: "📋 RSVP on Meetup.com"
- Footer on comment embeds: "💬 Reply on Meetup.com"

## [1.0.25] - 2026-03-20

### Fixed
- Comments now display in chronological order (oldest first)

## [1.0.24] - 2026-03-20

### Changed
- Comment likes display: `Likes: N` tag with spacing instead of heart emoji

## [1.0.23] - 2026-03-20

### Changed
- Add spacing between comment groups in the comments embed

## [1.0.22] - 2026-03-20

### Fixed
- Fix comment scraping hanging: scope comment selectors to the Comments section instead of matching page-wide
- Handle events with no comments gracefully (returns immediately)

## [1.0.21] - 2026-03-20

### Added
- Per-guild timezone config (`/config timezone`) — defaults to America/New_York
- All date formatting now uses the guild's configured timezone
- Combined comment notifications — multiple new comments posted as one embed
- Nested reply support — replies shown indented with `↳`, parent context for replies to older comments
- Like counts scraped and displayed (❤️ N) on comments
- "More comments" button auto-clicked to load full comment history
- `/test-reminder` command — posts reminder for next event to the current channel
- `/test-comments` now posts to current channel instead of configured channel
- DB migrations for timezone, likes, and parent_comment_id columns (no reset needed)

## [1.0.20] - 2026-03-20

### Fixed
- Fix false cancellation alerts: past events naturally disappearing from the listing page are no longer flagged as cancelled

## [1.0.19] - 2026-03-19

### Added
- RSVP edit-vs-repost: edit message in place if within threshold, delete and repost if past it (`/config rsvpthreshold`)
- 🆕 emoji badge on newly added RSVP members
- DB migration for `rsvp_edit_threshold_minutes` column (no DB reset needed)

## [1.0.18] - 2026-03-19

### Fixed
- Fix poll interval: reduce() initial value of 10 was always winning over configured value

## [1.0.17] - 2026-03-19

### Fixed
- Fix poll interval: filter out disabled guilds when calculating interval (disabled guild's default 10min was overriding configured 30min)

## [1.0.16] - 2026-03-19

### Fixed
- Full poll interval now re-reads from DB each cycle — `/config pollrate` takes effect without restart

## [1.0.15] - 2026-03-19

### Added
- Log all `/config` commands to terminal with guild name and setting values

## [1.0.14] - 2026-03-19

### Added
- Graceful session expiry handling: stops polling with clear error message instead of retrying every cycle
- `/poll` command clears session dead flag so polling resumes after re-login

## [1.0.13] - 2026-03-19

### Fixed
- Fix reminder label: show "Today" or "Tomorrow" based on actual event date instead of always "Tomorrow"

## [1.0.12] - 2026-03-19

### Added
- 3-hour grace period: keep quick polling during in-progress events (every 5 min after start time)

### Fixed
- Fix duplicate comment notifications: exclude relative timestamp from comment hash (was changing every scrape)

## [1.0.11] - 2026-03-19

### Changed
- Two-tier polling: full event listing scrape on base interval, quick poll (RSVPs, comments, event changes) only for the next imminent event
- Adaptive quick poll intervals: 15min within 24h, 5min within 8h, 2min within 2h
- Quick poll checks event detail page for time/location/title changes

## [1.0.10] - 2026-03-19

### Added
- `/config enable` and `/config disable` commands to toggle polling per server

### Fixed
- Fix events table primary key to support multiple guilds monitoring the same Meetup group

## [1.0.9] - 2026-03-19

### Added
- `/poll` command to manually trigger a scrape cycle on demand (Administrator)

## [1.0.8] - 2026-03-19

### Fixed
- Fix Docker: stop purging build tools (apt removes nodejs as a dependency)

## [1.0.7] - 2026-03-19

### Fixed
- Fix Docker: use absolute node path in CMD, explicit ENV PATH, remove autoremove, add node version check

## [1.0.6] - 2026-03-19

### Fixed
- Fix Docker: prevent apt-get autoremove from removing nodejs when purging build tools

## [1.0.5] - 2026-03-19

### Fixed
- Fix Docker: symlink node binary to /usr/local/bin for custom UID user PATH access

## [1.0.4] - 2026-03-19

### Fixed
- Fix Docker build: install build tools for better-sqlite3 native compilation on Node 24

## [1.0.3] - 2026-03-19

### Fixed
- Fix Docker build: pin pnpm version and relax lockfile check for cross-platform compatibility

## [1.0.2] - 2026-03-19

### Fixed
- Update Playwright Docker base image to v1.58.2 to match npm package version

## [1.0.1] - 2026-03-19

### Added
- noVNC-based remote login for Docker — access a headed browser at `http://<host>:6080` to solve CAPTCHAs
- Xvfb + x11vnc + noVNC installed in Docker image for web-accessible browser sessions

### Fixed
- Dockerfile: replaced corepack with `npm install -g pnpm` (corepack fails in Playwright image)
- Dockerfile: default UID/GID set to 1000:1000 for NAS volume compatibility

## [1.0.0] - 2026-03-19

### Added
- Core bot with Discord.js v14, scaffolded from NameplateBot template
- Meetup.com scraping with Playwright + stealth plugin
- JSON-LD structured data extraction for reliable event details (title, date, location)
- Adaptive polling — scrapes RSVPs/comments more frequently as events approach
- RSVP tracking with delete-and-repost summary embeds showing going/waitlist/not going
- Guest count tracking per attendee (`+1 guest` badges)
- Bot Meetup account filtering via `/config botname`
- Comment tracking — posts individual embeds for new comments on upcoming events
- Configurable event reminders (day-before + hours-before)
- Slash commands: `/config`, `/events`, `/rsvps`, `/status`
- Test commands: `/test-rsvps`, `/test-comments` for previewing embeds with any event URL
- Per-guild Meetup credentials and group URL configuration
- Per-notification-type Discord channel configuration (events, RSVPs, comments, reminders)
- SQLite database for events, RSVPs, comments, RSVP message tracking, scrape health, and sent reminders
- Session persistence — browser state saved/restored between scrapes, auto-refreshed
- Remote login helper (`login-server.js`) for Docker environments via Chrome DevTools Protocol
- Meetup+ popup auto-dismissal during scraping
- Lazy-load handling — scrolls to load all events, attendees, and comments
- Handles both upcoming and past event attendee tab layouts
- First-run detection — seeds database silently without flooding Discord
- Data reset script (`pnpm run reset-data`) preserving config/credentials
- Playwright codegen integration for selector development
- Test scraper utility with login, events, rsvps, comments, debug, and codegen modes
- Docker setup using Playwright base image with browser state persistence
- GitHub Actions workflow for tag-based Docker image publishing to GHCR
- ASCII art startup banner
