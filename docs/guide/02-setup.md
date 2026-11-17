---
title: Setup & deployment
order: 2
---

# Setup & deployment

## Discord bot

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application and a bot. Under **Bot**, enable the **Server Members Intent**.
2. Invite it with the `bot` and `applications.commands` scopes and these permissions: View Channels, Send Messages, Manage Messages, Embed Links, Read Message History (permissions integer `93184`).
3. Slash commands register themselves every time the bot starts. If a new command doesn't show up, restart your Discord client.

**For `/silence` only:** the bot's role also needs **Manage Roles** plus every permission the silence role takes away. See [/silence](/docs/commands/silence).

## Docker (Dockge)

```yaml
services:
  rollcall:
    image: ghcr.io/quixomatic/rollcallbot:latest
    container_name: rollcall
    restart: unless-stopped
    environment:
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - CLIENT_ID=${CLIENT_ID}
      - MEETUP_BACKEND=${MEETUP_BACKEND}
      - DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
      - DASHBOARD_URL=${DASHBOARD_URL}
    ports:
      - 3000:3000
    volumes:
      - /mnt/Main/Main/docker/data/rollcallbot/data:/app/data
    labels:
      - com.centurylinklabs.watchtower.enable=true
```

Everything the bot keeps (database, Meetup session) lives in the mounted `/app/data` folder, so updates and restarts lose nothing. With the Watchtower label, new releases deploy themselves; in Dockge, **Update** pulls the latest image immediately.

## Environment variables

| Variable | What it does | Default |
|---|---|---|
| `DISCORD_TOKEN` | Bot token | *required* |
| `CLIENT_ID` | Application ID | *required* |
| `MEETUP_BACKEND` | `graphql` (Meetup's API) or `browser` (the old page scraper, kept as a fallback). See [Backends](backends) | `graphql` |
| `DASHBOARD_PASSWORD` | Turns the dashboard on and sets its password | *(dashboard off)* |
| `DASHBOARD_PORT` | Dashboard port | `3000` |
| `DASHBOARD_URL` | How you open the dashboard (e.g. `http://192.168.1.10:3000`); used for links in alerts | *(no links)* |
| `DASHBOARD_SESSION_SECRET` | Key for login cookies. Defaults to one derived from the password, so changing the password signs everyone out | *(derived)* |
| `DEFAULT_POLL_INTERVAL_MINUTES` | Full-poll interval when a server hasn't set `/config pollrate` | `10` |
| `HEADLESS` | Browser backend only | `true` |
| `CHROME_PATH` | Browser for remote login, if it isn't found automatically | *(auto)* |

Per-server settings made with `/config` (or the dashboard's Settings page) take priority over the defaults here.

## Security

- The dashboard has one admin password and signs you in with an httpOnly cookie for 30 days. Ten wrong passwords from one address lock that address out for 15 minutes.
- It's plain HTTP. Keep port 3000 on your LAN, or put it behind a reverse proxy with HTTPS or a VPN such as Tailscale. Don't expose it to the internet directly.
- The Meetup session file (`data/browser-state/state.json`) is a working login for the bot's Meetup account. Treat it like a password.
