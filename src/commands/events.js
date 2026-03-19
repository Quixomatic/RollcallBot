const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { queries } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('events')
    .setDescription('List upcoming Meetup events'),

  async execute(interaction) {
    const events = queries.getUpcomingEventsForGuild().all(interaction.guildId);

    if (events.length === 0) {
      await interaction.reply({ content: 'No upcoming events found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embeds = events.slice(0, 10).map((event) => {
      const date = event.date_time ? new Date(event.date_time) : null;
      const dateStr = date
        ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'TBD';

      return new EmbedBuilder()
        .setTitle(event.title)
        .setURL(event.url)
        .addFields(
          { name: 'Date', value: dateStr, inline: true },
          { name: 'Location', value: event.location || 'TBD', inline: true },
          { name: 'RSVPs', value: `${event.rsvp_count} going${event.waitlist_count > 0 ? ` · ${event.waitlist_count} waitlisted` : ''}`, inline: true },
        )
        .setColor(0x00AE86);
    });

    await interaction.reply({ embeds, ephemeral: false });
  },
};
