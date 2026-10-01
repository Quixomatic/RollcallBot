const { PermissionFlagsBits, ChannelType } = require('discord.js');

const SILENCED_ROLE_NAME = 'rollcall-silenced';

// Everything a silenced member loses, applied as a deny overwrite on every
// category and channel. ViewChannel and ReadMessageHistory are deliberately
// left alone so they can still read whatever they could read before.
const DENIED = [
  'SendMessages',
  'SendMessagesInThreads',
  'CreatePublicThreads',
  'CreatePrivateThreads',
  'SendTTSMessages',
  'SendVoiceMessages',
  'SendPolls',
  'AddReactions',
  'AttachFiles',
  'EmbedLinks',
  'UseExternalEmojis',
  'UseExternalStickers',
  'MentionEveryone',
  'UseApplicationCommands',
  'UseExternalApps',
  'UseEmbeddedActivities',
  'CreateInstantInvite',
  'Connect',
  'Speak',
  'Stream',
  'UseSoundboard',
  'UseExternalSounds',
  'RequestToSpeak',
];

const DENY_OVERWRITE = Object.fromEntries(DENIED.map((name) => [name, false]));

// Permissions checked after silencing someone to catch channels where another
// role's allow overwrite beats our deny.
const LEAK_CHECK = ['SendMessages', 'SendMessagesInThreads', 'AddReactions', 'Connect'];

function findSilencedRole(guild) {
  return guild.roles.cache.find((r) => r.name === SILENCED_ROLE_NAME) || null;
}

/** Channels that can carry permission overwrites (threads inherit from their parent). */
function overwritableChannels(guild) {
  return guild.channels.cache.filter((ch) => !ch.isThread() && ch.permissionOverwrites);
}

/** True if the channel already denies every permission in DENIED for the role. */
function hasFullDeny(channel, role) {
  const ow = channel.permissionOverwrites.cache.get(role.id);
  return !!ow && DENIED.every((name) => ow.deny.has(PermissionFlagsBits[name]));
}

async function applyOverwrite(channel, role) {
  if (hasFullDeny(channel, role)) return false;
  await channel.permissionOverwrites.edit(role, DENY_OVERWRITE, { reason: 'Rollcall silence role' });
  return true;
}

/**
 * Create the silenced role if missing, then deny DENIED on every category and
 * channel. Safe to re-run: channels that already have the full deny are skipped.
 */
async function setupSilencedRole(guild) {
  let role = findSilencedRole(guild);
  let created = false;
  if (!role) {
    role = await guild.roles.create({
      name: SILENCED_ROLE_NAME,
      permissions: [],
      hoist: false,
      mentionable: false,
      reason: 'Rollcall silence role',
    });
    created = true;
  }

  // Categories first so channels created later under them inherit the deny.
  const channels = [...overwritableChannels(guild).values()].sort(
    (a, b) => (b.type === ChannelType.GuildCategory) - (a.type === ChannelType.GuildCategory)
  );

  let updated = 0;
  let unchanged = 0;
  const failed = [];
  for (const channel of channels) {
    try {
      if (await applyOverwrite(channel, role)) updated++;
      else unchanged++;
    } catch (err) {
      failed.push({ channel, error: err.message });
    }
  }

  return { role, created, updated, unchanged, failed };
}

/**
 * Channels where the member can see the channel but still has one of the
 * LEAK_CHECK permissions, typically because another role they hold has an
 * allow overwrite there.
 */
function findLeaks(member) {
  const leaks = [];
  for (const channel of overwritableChannels(member.guild).values()) {
    if (channel.type === ChannelType.GuildCategory) continue;
    const perms = member.permissionsIn(channel);
    if (!perms.has(PermissionFlagsBits.ViewChannel)) continue;
    const still = LEAK_CHECK.filter((name) => perms.has(PermissionFlagsBits[name]));
    if (still.length) leaks.push({ channel, still });
  }
  return leaks;
}

module.exports = {
  SILENCED_ROLE_NAME,
  findSilencedRole,
  applyOverwrite,
  setupSilencedRole,
  findLeaks,
};
