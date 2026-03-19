const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { queries } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rsvps')
    .setDescription('Show RSVPs for an upcoming event')
    .addStringOption((opt) =>
      opt.setName('event').setDescription('Event title (partial match)').setRequired(true)
    ),

  async execute(interaction) {
    const search = interaction.options.getString('event').toLowerCase();
    const events = queries.getUpcomingEventsForGuild().all(interaction.guildId);
    const match = events.find((e) => e.title.toLowerCase().includes(search));

    if (!match) {
      await interaction.reply({ content: `No upcoming event matching "${search}".`, flags: MessageFlags.Ephemeral });
      return;
    }

    const rsvps = queries.getRsvpsForEvent().all(match.event_id);
    const going = rsvps.filter((r) => r.rsvp_status === 'going');
    const waitlist = rsvps.filter((r) => r.rsvp_status === 'waitlist');
    const notGoing = rsvps.filter((r) => r.rsvp_status === 'not_going');

    const formatMember = (r) => r.guests > 0 ? `${r.member_name} (+${r.guests})` : r.member_name;
    const formatList = (list) => list.length > 0 ? list.map(formatMember).join(', ') : 'None';

    const embed = new EmbedBuilder()
      .setTitle(`RSVPs: ${match.title}`)
      .setURL(match.url)
      .addFields(
        { name: `Going (${going.length})`, value: formatList(going) },
        { name: `Waitlist (${waitlist.length})`, value: formatList(waitlist) },
        { name: `Not Going (${notGoing.length})`, value: formatList(notGoing) },
      )
      .setColor(0x00AE86);

    await interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
