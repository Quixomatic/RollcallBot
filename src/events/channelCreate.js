const { Events } = require('discord.js');
const { findSilencedRole, applyOverwrite } = require('../services/silence');

// Keep new channels covered by the silence role. Channels created inside a
// category usually copy its deny already; this catches the rest.
module.exports = {
  name: Events.ChannelCreate,
  async execute(channel) {
    if (!channel.guild || channel.isThread() || !channel.permissionOverwrites) return;
    const role = findSilencedRole(channel.guild);
    if (!role) return;

    try {
      if (await applyOverwrite(channel, role)) {
        console.log(`[silence] ${channel.guild.name}: applied silence role to new channel #${channel.name}`);
      }
    } catch (err) {
      console.error(`[silence] ${channel.guild.name}: could not apply silence role to #${channel.name}: ${err.message}`);
    }
  },
};
