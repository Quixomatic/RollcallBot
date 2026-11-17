---
title: Using the dashboard
order: 4
---

# Using the dashboard

The dashboard runs inside the bot (port 3000) when `DASHBOARD_PASSWORD` is set. Simply viewing it never sends anything to Meetup; only buttons you press do (Poll now, Rescan now, Live from Meetup, Run checks, posting comments, remote login).

## Overview

- **Meetup session**: who the bot is logged in as, and when that was last confirmed.
- **Backend** and **Poller**: what's running now and when the next full and quick polls are due.
- **Next event** for each Discord server, with going / waitlist / not going / comments, and **Poll now**.
- **Monitors**: Uptime Kuma-style bars, one tick per check (event listing, RSVPs, comments), newest on the right. Hover a tick for its time, duration and any error. The percentages are the success rates over 24 hours and 7 days.

## Events

Every tracked event, with RSVP counts (and capacity, e.g. `10/24`) and a status badge: **Live** (quick-polled, with its interval), **Full**, **Past** or **Cancelled**. Click one to open it:

- **Rescan now** checks this event on Meetup immediately and posts any changes to Discord, exactly like a quick poll. The result card shows what changed.
- **Post RSVP summary** (re)posts the summary to the RSVP channel from what's stored.
- **RSVPs**: the three lists as stored, with guests and when each person first appeared.
- **Comments**: the stored threads, a box to **post a comment** on Meetup as the bot account (signed with your name, up to 700 characters including it), and **Reply** on each thread.
- **Live from Meetup**: a read-only look at Meetup right now, highlighting anything not stored yet. The bot account's own comments can be **deleted** here; nobody else's can.
- **Details**: IDs, timestamps, reminders sent and the description.

## API health

- The **Monitors** board, with 90 checks per row.
- The **daily automatic check**: when it last ran and whether it passed (failures also go to the alerts channel).
- **Run checks**: the same checks on demand, optionally for a specific event and including a token refresh. Each failure names the exact Meetup operation and field.
- **Scrape history**: every check for the last 30 days.

## Meetup session

Status, **Remote login**, **Upload a new session**, **Refresh token now** and **Re-read session & resume**. See [Meetup session](meetup-session).

## Logs

Live output from the bot (the last 2,000 lines), with filters for warnings and errors and a search box. Useful right after pressing a button to see exactly what happened.

## Settings

Everything `/config` sets, with channel pickers. **Save** only sends what you changed and validates it the same way `/config` does.

## Docs

These pages, the [Discord command reference](/docs/commands) (generated from the running bot, so always current), and the [Meetup API reference](/docs/api).

## Discord outbox (local dry run only)

`pnpm run dev` runs the bot locally against a stand-in Discord. The outbox shows what would have been posted, rendered like Discord. In the dry run, posting comments to Meetup is blocked unless `DEV_ALLOW_MEETUP_WRITES=1` is set.
