---
title: What gets posted
order: 3
---

# What gets posted, and when

Every post goes to the channel set for its kind with `/config` (or on the dashboard's Settings page). If a channel isn't set, that kind of post is skipped.

## Polling cadence

| What | How often |
|---|---|
| **Full poll**: the group's events | Every `/config pollrate` minutes (default 10) |
| **Quick poll**: RSVPs and comments for the *next* event | Event within 24h: every 15 min · within 8h: every 5 min · within 2h: every 2 min · started, up to 3h: every 5 min |
| **Meetup API check** | 10 minutes after startup, then daily |

Only the next upcoming event is quick-polled. Events further out get their RSVPs and comments once they're the next one up and within 24 hours (or when you press **Rescan now** on the dashboard).

## Events channel

- **Event Updated**: the title, date/time or location changed. Shows old → new.
- **Event Cancelled**: posted **only when Meetup itself marks the event cancelled.** An event that disappears from the listing is looked up directly first: if it still exists (for example it moved outside the tracked window) it's kept; if it was deleted outright it's hidden quietly with no post.
- New events are **not** announced.

## RSVP channel

The **RSVP summary** lists Going (with guests, e.g. `+1 guest`), Waitlist (in queue order) and Not Going.

- Posted when RSVPs change, and the first time an event is checked.
- If the last summary was posted within the **edit window** (`/config rsvpthreshold`, default 15 minutes), it's **edited in place**; otherwise the old one is deleted and a new one posted, so the latest is at the bottom of the channel. `0` always reposts.
- People new to a list are marked `+ … 🆕`.
- **Changes** lists status moves since the last post, e.g. `⬆️ Alex: waitlist → going`.
- If the event has a capacity, the summary shows `Going (10/24)` and how many spots are left.

**Capacity alerts** (also in the RSVP channel), each posted once per change:

- **🚫 Event full**: going (including guests) reached capacity.
- **🎟️ Spot opened**: it was full and now isn't, so a waitlisted person can grab it.

The bot's own Meetup account (`/config botname`) is left out of all RSVP lists.

## Comments channel

- New comments are posted together in one message per poll, oldest first. Replies are shown as `↳ reply`, with the comment they answer quoted if it was posted earlier.
- `📌 Pinned` and `Likes: N` tags show next to comments.
- When an already-posted comment **gets pinned or liked later**, that same Discord message is **edited** to show it (Discord doesn't notify anyone about edits).
- An **edited** comment is not reposted.
- The first time the bot looks at an event, its existing comments are posted once.
- Comments admins post with `/comment` show up here too, like any other.

## Reminders channel

- **Day-before**: once the event is within 24 hours ("Today" or "Tomorrow"). Turn on/off with `/config reminders day_before`.
- **Hours-before**: one per number in `/config reminders hours_before`, e.g. `2,1` posts at 2 hours and 1 hour before.
- Each reminder shows the date, location and current RSVP count, and is only ever sent once.

## Alerts channel

For admins. Each alert is posted once when something changes, not every poll, and that state survives restarts:

- **🔑 Meetup session expired**: polling is paused until someone logs in again. See [Meetup session](meetup-session).
- **✅ Meetup session restored**: polling has resumed.
- **⚠️ Meetup API check failed**: the daily check found that something the bot depends on changed. Posted daily while it keeps failing, then **✅ passing again** once. See [Troubleshooting](troubleshooting).

Set `DASHBOARD_URL` so these alerts link straight to the right dashboard page.
