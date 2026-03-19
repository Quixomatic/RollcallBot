const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { queries } = require('../database');
const { scrapeComments, detectNewComments } = require('../services/meetup-comments');
const { extractEventDetails, dismissMeetupPlusPopup } = require('../utils/selectors');
const { getPage } = require('../services/scraper');
const notifier = require('../services/notifier');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test-comments')
    .setDescription('Test: scrape comments from an event URL and post them')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt.setName('url').setDescription('Meetup event URL').setRequired(true)
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const eventUrl = interaction.options.getString('url');
    const guildId = interaction.guildId;

    try {
      // Get event details
      const page = await getPage();
      await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await dismissMeetupPlusPopup(page);
      const details = await extractEventDetails(page);
      await page.close();

      // Get comments
      const comments = await scrapeComments(eventUrl);
      const eventId = eventUrl.match(/events\/(\d+)/)?.[1] || 'test';
      const newComments = detectNewComments(eventId, comments);

      const event = {
        event_id: eventId,
        title: details.title || 'Test Event',
        url: eventUrl,
        date_time: details.date_time,
        location: details.location,
      };

      if (newComments.length === 0) {
        await interaction.editReply({ content: `No comments found on "${event.title}"` });
        return;
      }

      for (const comment of newComments) {
        await notifier.notifyNewComment(client, guildId, event, comment);
      }

      await interaction.editReply({ content: `Posted ${newComments.length} comment(s) from "${event.title}"` });
    } catch (err) {
      console.error('[test-comments] Error:', err.message);
      await interaction.editReply({ content: `Error: ${err.message}` });
    }
  },
};
