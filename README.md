# Rollcall

A Discord bot that monitors Meetup.com groups and posts updates to Discord when events change, RSVPs change, or new comments are posted. Uses Playwright with stealth to scrape Meetup as a logged-in user.

## Features

- **Event monitoring** — detects event changes (time, location) and cancellations
- **RSVP tracking** — delete-and-repost RSVP summaries with going/waitlist/not going columns, guest counts, and change markers
- **Comment tracking** — posts new comments on upcoming events as individual embeds
- **Adaptive polling** — polls RSVPs and comments more frequently as events approach
- **Configurable reminders** — day-before and hours-before event reminders with RSVP counts
- **Per-channel routing** — send events, RSVPs, comments, and reminders to different Discord channels
- **Session persistence** — browser session saved and refreshed automatically
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

The session is saved to `data/browser-state/state.json` and refreshed automatically on every scrape cycle.

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

### Docker

```bash
docker compose up -d
```

#### Remote Login for Docker

When running in Docker, use the remote login helper to establish the Meetup session:

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
    volumes:
      - /mnt/Main/Main/docker/data/rollcall/data:/app/data
```

## Slash Commands

| Command | Permission | Description |
|---------|-----------|-------------|
| `/config` | Administrator | Configure bot settings |
| `/events` | Everyone | List upcoming events |
| `/rsvps <event>` | Everyone | Show RSVP list for an event |
| `/status` | Moderate Members | Bot health and scrape status |
| `/poll` | Administrator | Manually trigger a scrape cycle |
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

Meetup's DOM can change. All selectors are centralized in `src/utils/selectors.js`. Use the codegen command to discover updated selectors.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Bot token | *required* |
| `CLIENT_ID` | Application ID | *required* |
| `HEADLESS` | Run browser in headless mode | `true` |
| `DEFAULT_POLL_INTERVAL_MINUTES` | Default polling interval | `10` |
| `EVENT_HORIZON_DAYS` | Days out to track events | `30` |

## License

MIT
