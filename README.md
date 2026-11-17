# Rollcall

A Discord bot that monitors Meetup.com groups and posts updates to Discord when events change, RSVPs change, or new comments are posted. It reads Meetup's GraphQL API as a logged-in user (the same API meetup.com's web app uses). Playwright is only needed to log in, or as the fallback `browser` backend that scrapes the rendered pages.

## Features

- **Web dashboard** — browse events, RSVPs and comments, rescan or repost on demand, run API health checks, tail logs, edit settings, and upload a new Meetup session (password-protected, see [Web Dashboard](#web-dashboard))
- **Two backends** — `graphql` (default: fast, structured, no browser while polling) or `browser` (the original page scraper), switchable with `MEETUP_BACKEND` without losing or re-posting anything. See [docs/meetup-api](docs/meetup-api/README.md)
- **Event monitoring** — detects event changes (time, location) and cancellations. With the GraphQL backend, events are only reported cancelled when Meetup itself says so
- **RSVP tracking** — delete-and-repost RSVP summaries with going/waitlist/not going columns, guest counts, and change markers
- **Comment tracking** — posts new comments on upcoming events as individual embeds
- **Adaptive polling** — polls RSVPs and comments more frequently as events approach
- **Configurable reminders** — day-before and hours-before event reminders with RSVP counts
- **Per-channel routing** — send events, RSVPs, comments, and reminders to different Discord channels
- **Session persistence** — session saved to disk; the GraphQL backend renews the 1-hour access token itself using the 1-year refresh token
- **Bot account filtering** — filter the dedicated Meetup account from RSVP lists

## Setup

### Prerequisites

- Node.js 20+
- pnpm
- A Discord bot token and application ID
- A dedicated Meetup.com account (email/password, no 2FA)

### Discord Developer Portal Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** and enable:
   - Server Members Intent
4. Copy the bot token
5. Go to **Installation** and set up Guild Install with scopes `bot` + `applications.commands` and permissions integer `93184` (View Channels, Send Messages, Manage Messages, Embed Links, Read Message History)
6. Use the generated install link to invite the bot to your server
7. *(Optional, for `/silence`)* In **Server Settings → Roles → the bot's role → Permissions**, also grant **Manage Roles** and every permission the silence role denies. Discord only lets a bot deny permissions it holds itself: Send Messages, Send Messages in Threads, Create Public Threads, Create Private Threads, Send Text-to-Speech Messages, Send Voice Messages, Create Polls, Add Reactions, Attach Files, Embed Links, Use External Emoji, Use External Stickers, Mention @everyone/@here/All Roles, Use Application Commands, Use External Apps, Use Activities, Create Invite, Connect, Speak, Video, Use Soundboard, Use External Sounds, Request to Speak. The bot also needs View Channel on any private channel the silence should cover.

### Installation

```bash
git clone git@github.com:Quixomatic/RollcallBot.git
cd RollcallBot
cp .env.example .env
# Edit .env with your Discord token and client ID
pnpm install
```

### Meetup Login

The bot needs a saved browser session to scrape Meetup. Run the login script once (headed mode, so you can solve any CAPTCHA):

```bash
node src/test-scraper.js login your@email.com yourpassword
```

The session is saved to `data/browser-state/state.json` and kept fresh automatically by whichever backend is running.

### Refreshing an Expired Session

When the session dies (the bot stops polling and logs a session-expired error), log in again with real Chrome on a dev machine, where the hCaptcha behaves, and export the session with `src/export-session.js`.

1. Launch Chrome with a throwaway profile and remote debugging. The separate `--user-data-dir` keeps it isolated from your normal Chrome, like an incognito window, and your normal Chrome can stay open:

   ```powershell
   Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=$env:TEMP\meetup-login", "--no-first-run", "https://www.meetup.com/login/"
   ```

2. Log in to Meetup with the bot's account in that window and solve the CAPTCHA.
3. Back up the local session and export the new one:

   ```powershell
   Copy-Item data\browser-state\state.json data\browser-state\state.json.bak
   node src/export-session.js
   ```

   The script refuses to succeed unless `MEETUP_SESSION`, `__meetup_auth_access_token` and `__meetup_auth_refresh_token` are all present.
4. Open the dashboard's **Meetup session** page and drop `data/browser-state/state.json` onto the upload box. It is checked live against Meetup, the old session is backed up, and polling resumes. (Without the dashboard: copy the file to the host at `/mnt/Main/Main/docker/data/rollcallbot/data/browser-state/state.json` and run `/poll` in Discord, or restart the container.)
5. Close the Chrome window. **Do not log out**, which would invalidate the exported session.

### Discord Bot Configuration

Use the `/config` slash command in your Discord server:

1. `/config credentials <email> <password>` — set Meetup login credentials
2. `/config meetup <url>` — set the Meetup group URL to monitor
3. `/config botname <name>` — set the Meetup display name of the bot account (filtered from RSVPs)
4. `/config eventschannel <#channel>` — where to post event updates
5. `/config rsvpchannel <#channel>` — where to post RSVP changes
6. `/config commentschannel <#channel>` — where to post new comments
7. `/config reminderschannel <#channel>` — where to post reminders
8. `/config pollrate <minutes>` — base full poll interval (min 5, default 10)
9. `/config horizon <days>` — how far out to track events (default 30)
10. `/config reminders` — configure day-before and hours-before reminders
11. `/config rsvpthreshold <minutes>` — minutes before RSVP message is reposted vs edited in place (default 15, 0 = always repost)
12. `/config timezone <tz>` — IANA timezone for date formatting (default America/New_York)
13. `/config enable` / `/config disable` — toggle polling for this server
14. `/config view` — view current configuration

### Running

```bash
# Development
pnpm start

# Deploy slash commands only
pnpm run deploy-commands

# Reset scraped data (keeps config and credentials)
pnpm run reset-data
```

### Web Dashboard

Set `DASHBOARD_PASSWORD` and the bot serves a dashboard on port 3000 (`DASHBOARD_PORT`):

- **Overview** — Meetup session, backend, poller state and next polls, the next event per server, recent errors
- **Events** — every tracked event; click one for its RSVP lists (with guests), comments (pinned, likes), a live read-only comparison against Meetup, and buttons to **Rescan now** or **Post RSVP summary**. You can also **post comments and replies** on Meetup as the bot account (signed with a name you choose) and delete the bot's own comments
- **API health** — runs the same checks as `pnpm run api-check`, plus the scrape history
- **Meetup session** — who the bot is logged in as, token status, manual refresh, and **upload a new `state.json`** (verified against Meetup before it's installed)
- **Logs** — live tail of the bot's output
- **Settings** — everything `/config` does, with channel pickers

It uses a single admin password and a signed, httpOnly cookie. It's plain HTTP: keep it on your LAN or put it behind a reverse proxy / VPN rather than exposing the port to the internet.

#### Developing the dashboard locally

`pnpm run dev` runs the real poller, Meetup backend and dashboard in a **dry run**: a stand-in Discord client records every post (see the dashboard's **Discord outbox** page) instead of sending it, and it uses `data/dev.db` instead of the bot's database. It reads the Meetup session from `data/browser-state/state.json`.

```bash
pnpm --dir dashboard install
pnpm --dir dashboard build   # the bot serves dashboard/dist
pnpm run dev                 # http://localhost:3000, password "rollcall" (or DASHBOARD_PASSWORD)

# optional hot-reloading UI on http://localhost:5173 (proxies /api to :3000)
pnpm --dir dashboard dev
```

The UI is Vite + React + TypeScript with TanStack Router (file routes in `dashboard/src/routes/`), TanStack Query, and shadcn/ui on Tailwind v4. The API it talks to is `src/dashboard/api.js`.

### Docker

```bash
docker compose up -d
```

#### Remote Login for Docker

The easiest way to give a container a new session is the dashboard upload (see [Refreshing an Expired Session](#refreshing-an-expired-session)). Alternatively, log in through a browser running inside the container:

1. Expose port 6080 in your docker-compose
2. Run: `docker exec -it rollcall node src/login-server.js email password`
3. Open `http://<NAS-IP>:6080/vnc_lite.html` in your browser
4. Solve the CAPTCHA in the remote browser, then press Enter in the terminal to save the session
5. Remove the port mapping and restart the container

### Running with GHCR Image

After pushing a version tag, the image is published to GitHub Container Registry:

```yaml
services:
  rollcall:
    image: ghcr.io/quixomatic/rollcallbot:latest
    container_name: rollcall
    restart: unless-stopped
    environment:
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - CLIENT_ID=${CLIENT_ID}
      - MEETUP_BACKEND=${MEETUP_BACKEND}           # graphql (default) or browser
      - DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}   # enables the web dashboard
    ports:
      - 3000:3000   # dashboard
      - 6080:6080   # noVNC, only needed for login-server.js
    volumes:
      - /mnt/Main/Main/docker/data/rollcallbot/data:/app/data
```

## Slash Commands

| Command | Permission | Description |
|---------|-----------|-------------|
| `/config` | Administrator | Configure bot settings |
| `/events` | Everyone | List upcoming events |
| `/rsvps <event>` | Everyone | Show RSVP list for an event |
| `/status` | Moderate Members | Bot health and scrape status |
| `/poll` | Administrator | Manually trigger a scrape cycle |
| `/comment <event> <text>` | Administrator | Post a comment on an upcoming Meetup event as the bot account, signed with your server nickname (`James: see you there`). GraphQL backend only |
| `/silence setup` | Administrator | Create the `rollcall-silenced` role and deny it everything but reading on every channel (re-runnable) |
| `/silence user <member>` | Administrator | Make a member read-only; reports channels where another role still lets them act |
| `/silence remove <member>` | Administrator | Unsilence a member |
| `/silence list` | Administrator | List silenced members |
| `/test-rsvps <url>` | Administrator | Test: scrape and post RSVP embed to current channel |
| `/test-comments <url>` | Administrator | Test: scrape and post comments embed to current channel |
| `/test-reminder` | Administrator | Test: post reminder for next event to current channel |

## Development

### Testing Scrapers Locally

The test scraper utility runs Playwright in headed mode for development:

```bash
# Log in and save session
node src/test-scraper.js login your@email.com yourpassword

# Scrape events
node src/test-scraper.js events https://www.meetup.com/your-group/

# Scrape RSVPs for a specific event
node src/test-scraper.js rsvps https://www.meetup.com/your-group/events/12345/

# Scrape comments on an event
node src/test-scraper.js comments https://www.meetup.com/your-group/events/12345/

# Launch Playwright codegen to record interactions
node src/test-scraper.js codegen https://www.meetup.com/your-group/

# Launch codegen with saved session (logged in)
node src/test-scraper.js codegen-auth https://www.meetup.com/your-group/

# Open a page for inspection, save HTML on Enter
node src/test-scraper.js debug https://www.meetup.com/your-group/events/12345/
```

### Updating Selectors

Meetup's DOM can change. All selectors are centralized in `src/utils/selectors.js`. Use the codegen command to discover updated selectors. (Browser backend only.)

### Checking the Meetup API

`pnpm run api-check` (or `docker exec rollcall node src/api-check.js`) runs every GraphQL query the bot uses and reports exactly which operation, field or value changed if Meetup alters its API.

```bash
pnpm run api-check                                  # session, events, RSVPs, comments
pnpm run api-check -- --refresh                     # also renew the access token
pnpm run api-check -- --event <event-url> --report  # HTML page of everything returned (data/api-report.html)
pnpm run api-check -- --parity <event-url>          # diff browser vs GraphQL on one event
```

Everything known about the API (endpoints, auth and token refresh, every field used, and a snapshot of all of meetup.com's own operations for diffing) is in [docs/meetup-api](docs/meetup-api/README.md). `tools/meetup-capture/` records the site's network traffic and regenerates that snapshot.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Bot token | *required* |
| `CLIENT_ID` | Application ID | *required* |
| `MEETUP_BACKEND` | `graphql` or `browser` | `graphql` |
| `DASHBOARD_PASSWORD` | Enables the web dashboard and sets its login password | *(dashboard off)* |
| `DASHBOARD_PORT` | Dashboard port | `3000` |
| `DASHBOARD_SESSION_SECRET` | Key for signing login cookies (defaults to one derived from the password; changing the password logs everyone out) | *(derived)* |
| `HEADLESS` | Run browser in headless mode (browser backend and login tools) | `true` |
| `DEFAULT_POLL_INTERVAL_MINUTES` | Default polling interval | `10` |
| `EVENT_HORIZON_DAYS` | Days out to track events | `30` |

## License

MIT
