const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { SILENCED_ROLE_NAME, findSilencedRole, setupSilencedRole, findLeaks } = require('../services/silence');

const MAX_LISTED = 15;

function listLines(items, format) {
  const lines = items.slice(0, MAX_LISTED).map(format);
  if (items.length > MAX_LISTED) lines.push(`…and ${items.length - MAX_LISTED} more`);
  return lines;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('silence')
    .setDescription('Make a member read-only across the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription(`Create the ${SILENCED_ROLE_NAME} role and apply it to every channel (safe to re-run)`)
    )
    .addSubcommand((sub) =>
      sub
        .setName('user')
        .setDescription('Silence a member')
        .addUserOption((opt) => opt.setName('member').setDescription('Member to silence').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Unsilence a member')
        .addUserOption((opt) => opt.setName('member').setDescription('Member to unsilence').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('List silenced members')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const guildName = guild?.name || interaction.guildId;

    switch (sub) {
      case 'setup': {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { role, created, updated, unchanged, failed } = await setupSilencedRole(guild);
        console.log(`[silence] ${guildName}: setup — role ${created ? 'created' : 'exists'}, ${updated} channels updated, ${unchanged} unchanged, ${failed.length} failed`);

        const lines = [
          `${role} ${created ? 'created' : 'already exists'}.`,
          `Channels updated: ${updated}, already correct: ${unchanged}.`,
        ];
        if (failed.length) {
          lines.push('', `**Failed on ${failed.length} channel(s)** — the bot likely can't see them or lacks the permission it is trying to deny:`);
          lines.push(...listLines(failed, (f) => `- ${f.channel}: ${f.error}`));
        }
        await interaction.editReply({ content: lines.join('\n') });
        break;
      }

      case 'user': {
        const role = findSilencedRole(guild);
        if (!role) {
          await interaction.reply({ content: 'Silence role not set up yet. Run `/silence setup` first.', flags: MessageFlags.Ephemeral });
          return;
        }
        const member = interaction.options.getMember('member');
        if (!member) {
          await interaction.reply({ content: 'That user is not a member of this server.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.reply({ content: `${member} has Administrator, which ignores channel permissions. Silencing them would do nothing.`, flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const updated = await member.roles.add(role, `Silenced by ${interaction.user.tag}`);
        console.log(`[silence] ${guildName}: ${member.user.tag} silenced by ${interaction.user.tag}`);

        const leaks = findLeaks(updated);
        const lines = [`${member} is silenced.`];
        if (leaks.length) {
          lines.push('', `**They can still act in ${leaks.length} channel(s)**, because another role they have allows it there:`);
          lines.push(...listLines(leaks, (l) => `- ${l.channel}: ${l.still.join(', ')}`));
        }
        await interaction.editReply({ content: lines.join('\n') });
        break;
      }

      case 'remove': {
        const role = findSilencedRole(guild);
        const member = interaction.options.getMember('member');
        if (!role || !member || !member.roles.cache.has(role.id)) {
          await interaction.reply({ content: 'That member is not silenced.', flags: MessageFlags.Ephemeral });
          return;
        }
        await member.roles.remove(role, `Unsilenced by ${interaction.user.tag}`);
        console.log(`[silence] ${guildName}: ${member.user.tag} unsilenced by ${interaction.user.tag}`);
        await interaction.reply({ content: `${member} is no longer silenced.`, flags: MessageFlags.Ephemeral });
        break;
      }

      case 'list': {
        const role = findSilencedRole(guild);
        if (!role) {
          await interaction.reply({ content: 'Silence role not set up yet. Run `/silence setup` first.', flags: MessageFlags.Ephemeral });
          return;
        }
        await guild.members.fetch();
        const members = [...role.members.values()];
        const content = members.length
          ? [`**Silenced (${members.length}):**`, ...listLines(members, (m) => `- ${m} (${m.user.tag})`)].join('\n')
          : 'Nobody is silenced.';
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        break;
      }
    }
  },
};
