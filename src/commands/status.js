const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { queries } = require('../database');
const { version } = require('../../package.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Bot health — last scrape, errors, uptime')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const settings = queries.getGuildSettings().get(guildId);
    const recentScrapes = queries.getRecentScrapes().all(guildId);
    const uptime = process.uptime();

    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const uptimeStr = `${hours}h ${minutes}m`;

    const lastScrape = recentScrapes[0];
    const errors = recentScrapes.filter((s) => s.status === 'error');

    const embed = new EmbedBuilder()
      .setTitle('Rollcall Status')
      .addFields(
        { name: 'Version', value: `v${version}`, inline: true },
        { name: 'Uptime', value: uptimeStr, inline: true },
        { name: 'Meetup Group', value: settings?.meetup_group_url || 'Not configured', inline: false },
        {
          name: 'Last Scrape',
          value: lastScrape
            ? `${lastScrape.scrape_type} — ${lastScrape.status} (${lastScrape.duration_ms}ms) at ${lastScrape.scraped_at}`
            : 'No scrapes yet',
          inline: false,
        },
        {
          name: 'Recent Errors',
          value: errors.length > 0
            ? errors.slice(0, 3).map((e) => `${e.scrape_type}: ${e.error_message}`).join('\n')
            : 'None',
          inline: false,
        },
      )
      .setColor(errors.length > 0 ? 0xFF6B6B : 0x00AE86);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
