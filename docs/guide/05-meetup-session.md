---
title: Meetup session
order: 5
---

# Meetup session

The bot reads Meetup as a logged-in account (ideally a dedicated one, e.g. *Eventer*). Its login is stored in `data/browser-state/state.json`.

## How long a session lasts

About a month in practice. Meetup's access token claims to expire after an hour, but Meetup doesn't enforce that, so there's nothing to renew on a timer. A session ends when Meetup ends it on their side. Then:

- polling **pauses**, and the overview shows **Needs login**;
- the alerts channel gets **🔑 Meetup session expired** (once);
- once you log in again, polling resumes and the alerts channel gets **✅ Meetup session restored**.

## Logging in again: Remote login (recommended)

Dashboard → **Meetup session** → **Remote login** → **Start remote login**.

1. A real Google Chrome starts next to the bot with a fresh, private profile, and its screen appears in the page.
2. Click into the screen and log in with the bot's Meetup account. **Type email** and **Type password** fill in the credentials saved with `/config credentials` (click the field first). **Paste** (or Ctrl+V) pastes your clipboard.
3. Solve the captcha if Meetup shows one.
4. Press **Save session**. The cookies are checked against Meetup and installed; the old session is backed up. Chrome closes.

Chrome only runs while you're doing this: it closes after saving, on **Stop**, or after 15 minutes without input. It isn't reachable from the network; it's only visible through the dashboard, behind its login.

Why this works where the old noVNC login didn't: Chrome is started normally, like on your own computer, not by an automation tool, and the dashboard only sends it screen and input commands. That's what Meetup's captcha checks for.

## Logging in from your own computer (fallback)

1. Start Chrome with a separate profile and remote debugging:
   `chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\meetup-login https://www.meetup.com/login/`
2. Log in with the bot's account.
3. In the Rollcall repo, run `node src/export-session.js`. It writes `data/browser-state/state.json` and refuses unless the three login cookies are present.
4. On the dashboard's **Meetup session** page, drop that file on **Upload a new session**. It's verified against Meetup before it replaces anything.
5. Close that Chrome window **without logging out**; logging out would end the session you just exported.

## Buttons on the session page

- **Refresh token now**: asks Meetup for a new access token. Usually Meetup returns the same one, which is fine.
- **Re-read session & resume**: re-reads `state.json` from disk and clears a "session expired" pause. Use it if you replaced the file by hand.

## Good practice

- Use a dedicated Meetup account for the bot and set `/config botname` to its display name so it's hidden from RSVP lists.
- Don't log that account out on other devices while the bot uses it.
- For local testing, log in separately rather than copying the bot's `state.json` around.
