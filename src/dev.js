/**
 * Local dry run: the real poller, Meetup backend and dashboard, but with a
 * stand-in Discord client that records posts instead of sending them, and a
 * separate database. Nothing reaches your Discord server, and the bot's real
 * data/rollcall.db is never touched.
 *
 *   pnpm run dev                       # API + dashboard on http://localhost:3000
 *   pnpm --dir dashboard dev           # optional: hot-reloading UI on :5173
 *
 * Env (all optional): DASHBOARD_PASSWORD (default "rollcall"), DEV_GROUP_URL,
 * ROLLCALL_DB_PATH (default data/dev.db), MEETUP_BACKEND, MEETUP_STATE_FILE.
 * Uses the Meetup session in data/browser-state/state.json like the bot does.
 */

const path = require('path');
require('dotenv').config();
process.env.ROLLCALL_DB_PATH = process.env.ROLLCALL_DB_PATH || path.join(__dirname, '..', 'data', 'dev.db');
process.env.DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'rollcall';
require('./services/log-buffer').install();

const { queries } = require('./database');
const { startDashboard } = require('./dashboard/server');
const { startPolling } = require('./services/poller');
const { ChannelType } = require('discord.js');

const GUILD_ID = 'dev-guild';
const GROUP_URL = process.env.DEV_GROUP_URL || 'https://www.meetup.com/reston-pickup-soccer-rps/';
const outbox = [];

/** A Discord client stand-in with one fake server and a few text channels. */
function createFakeClient() {
  const messages = new Map();
  let nextId = 1;
  const channels = new Map();
  const guild = {
    id: GUILD_ID,
    name: 'Dry Run Server',
    iconURL: () => null,
    channels: { cache: channels },
  };

  const makeChannel = (id, name, position) => {
    const channel = {
      id, name, type: ChannelType.GuildText, rawPosition: position, parent: { name: 'Rollcall (dry run)' }, guild,
      async send(payload) {
        const msg = {
          id: String(nextId++),
          channelId: id,
          embeds: (payload.embeds || []).map((e) => (e.toJSON ? e.toJSON() : e)),
          content: payload.content || null,
          async edit(p) {
            this.embeds = (p.embeds || []).map((e) => (e.toJSON ? e.toJSON() : e));
            outbox.push({ at: new Date().toISOString(), action: 'edit', channel: name, messageId: this.id, embeds: this.embeds });
            console.log(`[dry-run] Edited message ${this.id} in #${name}`);
            return this;
          },
          async delete() {
            messages.delete(this.id);
            outbox.push({ at: new Date().toISOString(), action: 'delete', channel: name, messageId: this.id, embeds: [] });
            console.log(`[dry-run] Deleted message ${this.id} in #${name}`);
          },
        };
        messages.set(msg.id, msg);
        outbox.push({ at: new Date().toISOString(), action: 'send', channel: name, messageId: msg.id, embeds: msg.embeds, content: msg.content });
        console.log(`[dry-run] Would post to #${name}: ${msg.embeds.map((e) => e.title).join(', ') || msg.content}`);
        return msg;
      },
      messages: {
        fetch: async (msgId) => {
          const m = messages.get(msgId);
          if (!m) throw new Error('Unknown Message');
          return m;
        },
      },
    };
    channels.set(id, channel);
    return channel;
  };

  makeChannel('100', 'events', 1);
  makeChannel('101', 'rsvps', 2);
  makeChannel('102', 'comments', 3);
  makeChannel('103', 'reminders', 4);

  return {
    user: { tag: 'Rollcall (dry run)' },
    guilds: { cache: new Map([[GUILD_ID, guild]]) },
    channels: {
      fetch: async (id) => {
        const c = channels.get(id);
        if (!c) throw new Error(`Unknown channel ${id}`);
        return c;
      },
    },
  };
}

async function main() {
  console.log('[dev] Dry run — Discord posts are recorded, not sent');
  console.log(`[dev] Database: ${process.env.ROLLCALL_DB_PATH}`);

  if (!queries.getGuildSettings().get(GUILD_ID)) {
    console.log(`[dev] Seeding dev guild for ${GROUP_URL}`);
    queries.setMeetupGroupUrl().run(GUILD_ID, GROUP_URL);
    queries.setMeetupCredentials().run(GUILD_ID, 'dry-run@example.com', 'unused');
    queries.setEventsChannel().run(GUILD_ID, '100');
    queries.setRsvpChannel().run(GUILD_ID, '101');
    queries.setCommentsChannel().run(GUILD_ID, '102');
    queries.setRemindersChannel().run(GUILD_ID, '103');
    queries.setBotMeetupName().run(GUILD_ID, 'Eventer');
  }

  const client = createFakeClient();
  startDashboard(client, { outbox });
  console.log(`[dev] Dashboard password: ${process.env.DASHBOARD_PASSWORD}`);
  await startPolling(client);
}

main().catch((err) => {
  console.error('[dev] Fatal:', err);
  process.exit(1);
});
