---
title: Getting started
order: 1
---

# Getting started

Rollcall watches a Meetup group as a logged-in Meetup account and keeps a Discord server up to date:

- **Event changes**: time, place or title changes, and cancellations.
- **RSVPs**: a summary of who's going, waitlisted and not going, kept current as people RSVP, with capacity ("10/24") and waitlist promotions.
- **Comments**: new comments on upcoming events, threaded, with likes and pins.
- **Reminders**: the day before and/or a few hours before each event.
- **Alerts**: tells admins when something needs attention, like the Meetup session expiring.

Admins can also **post comments to Meetup from Discord** (`/comment`) and manage everything from this **dashboard**.

## How it works in one minute

1. The bot logs in to Meetup as a dedicated account (for example *Eventer*) and reads the group through Meetup's own GraphQL API: the same API meetup.com uses. No browser runs while polling.
2. A **full poll** reads the group's events every few minutes (default 10, set with `/config pollrate`).
3. When an event is **within 24 hours**, a **quick poll** also checks its RSVPs and comments, speeding up as the event gets closer (every 15 → 5 → 2 minutes, then every 5 minutes while it's happening).
4. Changes are posted to the Discord channels you choose. Nothing is posted twice: everything the bot has seen is stored in its database.

## First-time setup

1. Invite the bot and give its role the permissions in [Setup](setup).
2. In Discord, point it at your group and channels:
   - `/config meetup https://www.meetup.com/your-group/`
   - `/config credentials <email> <password>` (the bot's Meetup account)
   - `/config botname <name>` (hides the bot's own RSVP from lists)
   - `/config eventschannel`, `/config rsvpchannel`, `/config commentschannel`, `/config reminderschannel`, `/config alertschannel`
3. Log the bot in to Meetup: dashboard → **Meetup session** → **Remote login**. See [Meetup session](meetup-session).
4. Run `/poll` (or press **Poll now** on the dashboard) to fetch everything right away.

The first poll **seeds** the database quietly: existing events aren't announced as new, so turning the bot on doesn't flood your channels.

## Where to go next

- [All Discord commands](/docs/commands)
- [What gets posted, and when](notifications)
- [Using the dashboard](dashboard)
- [When the Meetup session expires](meetup-session)
- [Troubleshooting](troubleshooting)
