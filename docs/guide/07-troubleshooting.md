---
title: Troubleshooting
order: 7
---

# Troubleshooting

Start with the dashboard: **Logs** shows what the bot just did, and **API health → Run checks** tests every Meetup query it relies on.

### Nothing is being posted

- `/config view`: is the Meetup group set, are the channels set, and is polling **enabled**?
- The bot needs credentials saved (`/config credentials`) before it will poll, even though logins happen through the session.
- Overview → is the Meetup session **Needs login**? Then see [Meetup session](meetup-session).
- RSVPs and comments are only checked for the next event once it's within 24 hours. Press **Rescan now** on an event to check it immediately.

### "Meetup session expired"

Log in again: dashboard → **Meetup session** → **Remote login**. Polling resumes on its own afterwards.

### The daily Meetup API check failed

Something Meetup changed affects a query the bot uses. The alert (and **API health → Run checks**) names the operation and field, for example `event 123: missing/null venue.name` or Meetup's own error about a field that no longer exists.

- To keep the bot running meanwhile, set `MEETUP_BACKEND=browser` and restart.
- The fix is usually a small change to the bot's query. The [Meetup API](/docs/api) reference explains how to recapture what meetup.com does now and compare.

### A slash command is missing in Discord

Commands register when the bot starts. Restart your Discord client (it caches the command list). Admin-only commands only appear to members with the required permission; see [commands](/docs/commands).

### `/silence setup` says "Missing Permissions"

The bot can only deny permissions it has itself. Grant its role the permissions listed on [/silence](/docs/commands/silence), and give it **Manage Permissions** on any channel that overrides them (for example read-only announcement channels).

### The RSVP summary keeps moving to the bottom of the channel

That's the edit window: summaries older than `/config rsvpthreshold` minutes (default 15) are reposted instead of edited. Raise it to keep editing in place for longer.

### Remote login shows a black screen or won't start

- The first frame can take a few seconds.
- "No Chrome or Chromium is installed": the image includes Chrome on amd64; on other architectures it uses Playwright's Chromium. Set `CHROME_PATH` if you installed a browser elsewhere.
- Press **Stop** and start again. Anything not saved is discarded.
