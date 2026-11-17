/**
 * A stand-in for the discord.js Client, used by the local dry run
 * (`pnpm run dev`) and the test suite. It has one server with a few text
 * channels; everything "sent" to them is recorded in `outbox` instead.
 */

const { ChannelType } = require('discord.js');

function toJSON(embeds = []) {
  return embeds.map((e) => (e.toJSON ? e.toJSON() : e));
}

function createFakeClient({ guildId = 'dev-guild', guildName = 'Dry Run Server', outbox = [], log = true } = {}) {
  const messages = new Map();
  const channels = new Map();
  let nextId = 1;
  const guild = { id: guildId, name: guildName, iconURL: () => null, channels: { cache: channels } };

  const makeChannel = (id, name, position) => {
    const channel = {
      id,
      name,
      type: ChannelType.GuildText,
      rawPosition: position,
      parent: { name: 'Rollcall (dry run)' },
      guild,
      async send(payload) {
        const msg = {
          id: String(nextId++),
          channelId: id,
          embeds: toJSON(payload.embeds),
          content: payload.content || null,
          async edit(p) {
            this.embeds = toJSON(p.embeds);
            outbox.push({ at: new Date().toISOString(), action: 'edit', channel: name, messageId: this.id, embeds: this.embeds });
            if (log) console.log(`[dry-run] Edited message ${this.id} in #${name}`);
            return this;
          },
          async delete() {
            messages.delete(this.id);
            outbox.push({ at: new Date().toISOString(), action: 'delete', channel: name, messageId: this.id, embeds: [] });
            if (log) console.log(`[dry-run] Deleted message ${this.id} in #${name}`);
          },
        };
        messages.set(msg.id, msg);
        outbox.push({ at: new Date().toISOString(), action: 'send', channel: name, messageId: msg.id, embeds: msg.embeds, content: msg.content });
        if (log) console.log(`[dry-run] Would post to #${name}: ${msg.embeds.map((e) => e.title).join(', ') || msg.content}`);
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
  makeChannel('104', 'alerts', 5);

  return {
    user: { tag: 'Rollcall (dry run)' },
    outbox,
    guilds: { cache: new Map([[guildId, guild]]) },
    channels: {
      fetch: async (id) => {
        const c = channels.get(id);
        if (!c) throw new Error(`Unknown channel ${id}`);
        return c;
      },
    },
  };
}

module.exports = { createFakeClient };
