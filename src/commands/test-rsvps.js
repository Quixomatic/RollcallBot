const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const { queries } = require('../database');
const { scrapeRsvps, detectRsvpChanges } = require('../services/meetup-rsvps');
const { extractEventDetails, dismissMeetupPlusPopup } = require('../utils/selectors');
const { getPage } = require('../services/scraper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test-rsvps')
    .setDescription('Test: scrape RSVPs from an event URL and post the embed')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt.setName('url').setDescription('Meetup event URL').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const eventUrl = interaction.options.getString('url');
    const guildId = interaction.guildId;
    const settings = queries.getGuildSettings().get(guildId);
    const timezone = settings?.timezone || 'America/New_York';

    try {
      // Get event details
      const page = await getPage();
      await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await dismissMeetupPlusPopup(page);
      const details = await extractEventDetails(page);
      await page.close();

      // Get RSVPs
      let rsvps = await scrapeRsvps(eventUrl);
      if (settings?.bot_meetup_name) {
        rsvps = rsvps.filter((r) => r.member_name !== settings.bot_meetup_name);
      }

      const going = rsvps.filter((r) => r.rsvp_status === 'going');
      const waitlist = rsvps.filter((r) => r.rsvp_status === 'waitlist');
      const notGoing = rsvps.filter((r) => r.rsvp_status === 'not_going');

      const formatList = (list) => {
        if (list.length === 0) return '*None*';
        return list.map((r) => {
          const guestNote = r.guests > 0 ? `  \`+${r.guests} guest${r.guests > 1 ? 's' : ''}\`` : '';
          return `• ${r.member_name}${guestNote}`;
        }).join('\n');
      };

      const goingTotal = going.reduce((sum, r) => sum + 1 + (r.guests || 0), 0);
      const waitlistTotal = waitlist.reduce((sum, r) => sum + 1 + (r.guests || 0), 0);

      function formatDate(dateStr) {
        if (!dateStr) return 'TBD';
        try {
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return dateStr;
          return date.toLocaleString('en-US', {
            weekday: 'long', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
            timeZone: timezone,
          });
        } catch { return dateStr; }
      }

      const embed = new EmbedBuilder()
        .setTitle(`RSVPs: ${details.title || 'Test Event'}`)
        .setURL(eventUrl)
        .setDescription(formatDate(details.date_time))
        .setFooter({ text: '📋 RSVP on Meetup.com' })
        .setColor(0x00AE86)
        .setTimestamp();

      embed.addFields({ name: `✅ Going (${goingTotal})`, value: formatList(going), inline: true });
      if (waitlist.length > 0) {
        embed.addFields({ name: `⏳ Waitlist (${waitlistTotal})`, value: formatList(waitlist), inline: true });
      }
      if (notGoing.length > 0) {
        embed.addFields({ name: `❌ Not Going (${notGoing.length})`, value: formatList(notGoing), inline: true });
      }

      // Post to current channel
      await interaction.channel.send({ embeds: [embed] });
      await interaction.editReply({ content: `Posted RSVP summary for "${details.title}" (${rsvps.length} attendees)` });
    } catch (err) {
      console.error('[test-rsvps] Error:', err.message);
      await interaction.editReply({ content: `Error: ${err.message}` });
    }
  },
};
