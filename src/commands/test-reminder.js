const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const { queries } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test-reminder')
    .setDescription('Test: post a reminder for the next upcoming event into this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    const settings = queries.getGuildSettings().get(guildId);
    const timezone = settings?.timezone || 'America/New_York';

    const events = queries.getUpcomingEventsForGuild().all(guildId);
    if (events.length === 0) {
      await interaction.editReply({ content: 'No upcoming events found.' });
      return;
    }

    const event = events[0];

    function formatDate(dateStr) {
      if (!dateStr) return 'TBD';
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
          timeZone: timezone,
        });
      } catch {
        return dateStr;
      }
    }

    function getRsvpSummary(eventId) {
      const rsvps = queries.getRsvpsForEvent().all(eventId);
      const going = rsvps.filter((r) => r.rsvp_status === 'going');
      const total = going.reduce((sum, r) => sum + 1 + (r.guests || 0), 0);
      const waitlist = rsvps.filter((r) => r.rsvp_status === 'waitlist');
      let summary = `${total} going`;
      if (waitlist.length > 0) summary += ` · ${waitlist.length} waitlisted`;
      return summary;
    }

    const now = new Date();
    const eventDate = new Date(event.date_time);
    const isToday = now.toDateString() === eventDate.toDateString();
    const label = isToday ? 'Today' : 'Tomorrow';

    const embed = new EmbedBuilder()
      .setTitle(`Reminder: ${event.title}`)
      .setURL(event.url)
      .setDescription(`**${label}**`)
      .addFields(
        { name: 'Date', value: formatDate(event.date_time), inline: true },
        { name: 'Location', value: event.location || 'TBD', inline: true },
        { name: 'RSVPs', value: getRsvpSummary(event.event_id), inline: true },
      )
      .setColor(0xFFD700)
      .setTimestamp();

    // Post to the current channel, not the configured reminders channel
    await interaction.channel.send({ embeds: [embed] });
    await interaction.editReply({ content: `Test reminder posted for "${event.title}"` });
  },
};
