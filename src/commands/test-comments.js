const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getBackend } = require('../services/backend');
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

    try {
      const backend = getBackend();
      const details = await backend.getEventDetails(eventUrl);

      // Get comments — treat ALL as new (don't check DB)
      const comments = await backend.getComments(eventUrl);

      const event = {
        event_id: eventUrl.match(/events\/(\d+)/)?.[1] || 'test',
        title: details.title || 'Test Event',
        url: eventUrl,
        date_time: details.date_time,
        location: details.location,
      };

      if (comments.length === 0) {
        await interaction.editReply({ content: `No comments found on "${event.title}"` });
        return;
      }

      // Post to the current channel (not the configured comments channel)
      await notifier.notifyNewComments(interaction.channel, event, comments, comments);

      await interaction.editReply({ content: `Posted ${comments.length} comment(s) from "${event.title}"` });
    } catch (err) {
      console.error('[test-comments] Error:', err.message);
      await interaction.editReply({ content: `Error: ${err.message}` });
    }
  },
};
