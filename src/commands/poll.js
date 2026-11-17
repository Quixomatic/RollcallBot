const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { pollGuildNow, PollerBusyError } = require('../services/poller');
const { getBackend } = require('../services/backend');
const { queries } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Manually trigger a scrape cycle now')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    const settings = queries.getGuildSettings().get(guildId);

    if (!settings?.meetup_group_url) {
      await interaction.editReply({ content: 'Not configured yet. Use `/config meetup` first.' });
      return;
    }

    await interaction.editReply({ content: 'Polling now...' });

    try {
      getBackend().clearSessionDead(); // Reset session flag (and re-read state.json) in case it was marked dead
      await pollGuildNow(client, guildId, 'manual poll (/poll)');
      await interaction.editReply({ content: 'Poll cycle complete.' });
    } catch (err) {
      const msg = err instanceof PollerBusyError ? `${err.message} — try again in a moment.` : `Poll error: ${err.message}`;
      await interaction.editReply({ content: msg });
    }
  },
};
