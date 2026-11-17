const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { queries } = require('../database');
const { postAsAdmin, formatComment, MAX_COMMENT_LENGTH } = require('../services/comment-poster');

function eventLabel(e, timezone) {
  const when = e.date_time
    ? new Date(e.date_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone })
    : 'TBD';
  return `${when} · ${e.title}`.slice(0, 100);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('comment')
    .setDescription('Post a comment on a Meetup event as the bot account, signed with your name')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt.setName('event').setDescription('Upcoming event').setRequired(true).setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt.setName('text').setDescription('What to say (your name is added in front)').setRequired(true).setMaxLength(MAX_COMMENT_LENGTH)
    ),

  async autocomplete(interaction) {
    const settings = queries.getGuildSettings().get(interaction.guildId);
    const timezone = settings?.timezone || 'America/New_York';
    const typed = interaction.options.getFocused().toLowerCase();
    const choices = queries.getUpcomingEventsForGuild().all(interaction.guildId)
      .map((e) => ({ name: eventLabel(e, timezone), value: e.event_id }))
      .filter((c) => !typed || c.name.toLowerCase().includes(typed) || c.value.includes(typed))
      .slice(0, 25);
    await interaction.respond(choices);
  },

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const eventId = interaction.options.getString('event');
    const text = interaction.options.getString('text');
    // Server nickname, else Discord display name, else username.
    const authorName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;

    try {
      const { event } = await postAsAdmin({
        guildId: interaction.guildId,
        eventId,
        authorName,
        text,
        source: `discord:${interaction.user.tag}`,
      });
      await interaction.editReply({
        content: `Posted on **[${event.title}](${event.url})** as the bot account:\n> ${formatComment(authorName, text).replace(/\n/g, '\n> ')}`,
      });
    } catch (err) {
      await interaction.editReply({ content: `Couldn't post the comment: ${err.message}` });
    }
  },
};
