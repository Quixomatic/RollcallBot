Makes a member **read-only** across the server: they can still read every channel they could before, but can't post, react, start threads, join voice, use commands or create invites. Unlike Discord's Timeout, there's no countdown banner.

## One-time setup

1. Give the bot's role **Manage Roles** and every permission the silence role denies. Discord only lets a bot deny permissions it has itself:
   Send Messages, Send Messages in Threads, Create Public Threads, Create Private Threads, Send Text-to-Speech Messages, Send Voice Messages, Create Polls, Add Reactions, Attach Files, Embed Links, Use External Emoji, Use External Stickers, Mention @everyone/@here/All Roles, Use Application Commands, Use External Apps, Use Activities, Create Invite, Connect, Speak, Video, Use Soundboard, Use External Sounds, Request to Speak.
2. Run `/silence setup`. It creates the `rollcall-silenced` role and adds the restrictions to every category and channel. If something's missing, it lists exactly which permissions to grant.
3. Channels that remove permissions from everyone (e.g. read-only announcement channels) also need the bot's role given **Manage Permissions** on that channel, then run setup again. It's safe to re-run; channels already done are skipped.

New channels get the restriction automatically.

## Using it

- `/silence user member:@someone` adds the role. If another role they have explicitly allows posting somewhere, the reply lists those channels.
- `/silence remove member:@someone` lifts it.
- `/silence list` shows who's silenced.

Administrators can't be silenced (Discord ignores channel permissions for them). The member will still see "You do not have permission to send messages in this channel", and the role is visible on their profile.
