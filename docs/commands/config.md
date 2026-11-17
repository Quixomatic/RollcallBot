Sets up Rollcall for this Discord server. Every setting can also be changed on the dashboard's **Settings** page. All replies are private (only you see them).

## Getting started

```
/config meetup url:https://www.meetup.com/your-group/
/config credentials email:bot@example.com password:••••••
/config botname name:Eventer
/config eventschannel channel:#meetup-events
/config rsvpchannel channel:#rsvps
/config commentschannel channel:#meetup-comments
/config reminderschannel channel:#announcements
/config alertschannel channel:#bot-logs
```

## Subcommands

| Subcommand | What it sets |
|---|---|
| `meetup` | The Meetup group to monitor. |
| `credentials` | The bot's Meetup login. Required before polling starts, and used by **Type email / Type password** in remote login. |
| `botname` | The bot account's Meetup display name, hidden from RSVP lists. |
| `eventschannel` | Where event changes and cancellations go. |
| `rsvpchannel` | Where RSVP summaries and capacity alerts go. |
| `commentschannel` | Where new Meetup comments go. |
| `reminderschannel` | Where reminders go. |
| `alertschannel` | Where bot alerts go: session expired/restored, daily API check failures. |
| `pollrate` | Minutes between full polls (5–60, default 10). |
| `horizon` | How many days ahead to track events (7–90, default 30). |
| `reminders` | `day_before` (on/off) and `hours_before` (e.g. `2,1`). Omitted options are left as they are. |
| `rsvpthreshold` | Minutes during which the RSVP summary is edited in place rather than reposted (0–60, default 15; 0 = always repost). |
| `timezone` | IANA timezone for dates in posts, e.g. `America/Chicago` (default `America/New_York`). |
| `enable` / `disable` | Turn polling on or off for this server. |
| `view` | Show the current settings. |

Changes take effect on the next poll; no restart needed.
