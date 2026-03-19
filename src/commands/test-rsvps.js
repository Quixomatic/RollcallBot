const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { queries } = require('../database');
const { scrapeRsvps, detectRsvpChanges } = require('../services/meetup-rsvps');
const { extractEventDetails, dismissMeetupPlusPopup } = require('../utils/selectors');
const { getPage } = require('../services/scraper');
const notifier = require('../services/notifier');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test-rsvps')
    .setDescription('Test: scrape RSVPs from an event URL and post the embed')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt.setName('url').setDescription('Meetup event URL').setRequired(true)
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const eventUrl = interaction.options.getString('url');
    const guildId = interaction.guildId;
    const settings = queries.getGuildSettings().get(guildId);

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

      const eventId = eventUrl.match(/events\/(\d+)/)?.[1] || 'test';

      // Clear existing RSVPs for this event so they all appear
      try { queries.deleteRsvpsForEvent().run(eventId); } catch {}

      const rsvpChanges = detectRsvpChanges(eventId, rsvps);
      // Clean summary — no change markers
      rsvpChanges.added = [];
      rsvpChanges.removed = [];
      rsvpChanges.changed = [];

      const event = {
        event_id: eventId,
        title: details.title || 'Test Event',
        url: eventUrl,
        date_time: details.date_time,
        location: details.location,
      };

      await notifier.notifyRsvpUpdate(client, guildId, event, rsvpChanges);
      await interaction.editReply({ content: `Posted RSVP summary for "${event.title}" (${rsvps.length} attendees)` });
    } catch (err) {
      console.error('[test-rsvps] Error:', err.message);
      await interaction.editReply({ content: `Error: ${err.message}` });
    }
  },
};
