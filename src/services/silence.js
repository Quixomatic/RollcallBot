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

// Discord only lets the bot deny permissions it holds itself, so it needs all
// of DENIED plus ManageRoles to write the overwrite.
const REQUIRED = ['ManageRoles', ...DENIED];

// Names as they appear in Server Settings → Roles → Permissions.
const LABELS = {
  ManageRoles: 'Manage Roles',
  SendMessages: 'Send Messages',
  SendMessagesInThreads: 'Send Messages in Threads',
  CreatePublicThreads: 'Create Public Threads',
  CreatePrivateThreads: 'Create Private Threads',
  SendTTSMessages: 'Send Text-to-Speech Messages',
  SendVoiceMessages: 'Send Voice Messages',
  SendPolls: 'Create Polls',
  AddReactions: 'Add Reactions',
  AttachFiles: 'Attach Files',
  EmbedLinks: 'Embed Links',
  UseExternalEmojis: 'Use External Emoji',
  UseExternalStickers: 'Use External Stickers',
  MentionEveryone: 'Mention @everyone, @here, and All Roles',
  UseApplicationCommands: 'Use Application Commands',
  UseExternalApps: 'Use External Apps',
  UseEmbeddedActivities: 'Use Activities',
  CreateInstantInvite: 'Create Invite',
  Connect: 'Connect',
  Speak: 'Speak',
  Stream: 'Video',
  UseSoundboard: 'Use Soundboard',
  UseExternalSounds: 'Use External Sounds',
  RequestToSpeak: 'Request to Speak',
};

/** Permissions the bot lacks (server-wide, or in a channel) to write the deny overwrite. */
function missingBotPermissions(guild, channel = null) {
  const perms = channel ? channel.permissionsFor(guild.members.me) : guild.members.me.permissions;
  return perms.missing(REQUIRED).map((name) => LABELS[name] || name);
}

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
  // Every overwrite would fail with a bare "Missing Permissions", so stop and
  // say exactly what to grant instead.
  const missing = missingBotPermissions(guild);
  if (missing.length) return { missing };

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
      // A channel overwrite can take away a permission the bot has server-wide.
      const lacking = missingBotPermissions(guild, channel);
      const error = lacking.length ? `${err.message} (bot lacks here: ${lacking.join(', ')})` : err.message;
      failed.push({ channel, error });
    }
  }

  return { missing: [], role, created, updated, unchanged, failed };
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
