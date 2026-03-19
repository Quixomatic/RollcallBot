const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { pollGuild } = require('../services/poller');
const { clearSessionDead } = require('../services/scraper');
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
      clearSessionDead(); // Reset session flag in case it was marked dead
      await pollGuild(client, guildId, settings);
      await interaction.editReply({ content: 'Poll cycle complete.' });
    } catch (err) {
      await interaction.editReply({ content: `Poll error: ${err.message}` });
    }
  },
};
