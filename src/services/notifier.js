const { EmbedBuilder } = require('discord.js');
const { queries } = require('../database');

/**
 * Format an ISO date string into a human-readable format in the given timezone.
 */
function formatDate(dateStr, timezone) {
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
      timeZone: timezone || 'America/New_York',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get the timezone for a guild from settings.
 */
function getTimezone(guildId) {
  const settings = queries.getGuildSettings().get(guildId);
  return settings?.timezone || 'America/New_York';
}

/**
 * Get a short RSVP summary string from the database for an event.
 */
function getRsvpSummary(eventId) {
  const rsvps = queries.getRsvpsForEvent().all(eventId);
  const going = rsvps.filter((r) => r.rsvp_status === 'going');
  const total = going.reduce((sum, r) => sum + 1 + (r.guests || 0), 0);
  const waitlist = rsvps.filter((r) => r.rsvp_status === 'waitlist');
  let summary = `${total} going`;
  if (waitlist.length > 0) summary += ` · ${waitlist.length} waitlisted`;
  return summary;
}

/**
 * Post a new event notification.
 */
async function notifyNewEvent(client, guildId, event) {
  const settings = queries.getGuildSettings().get(guildId);
  if (!settings?.events_channel_id) return;

  const channel = await client.channels.fetch(settings.events_channel_id).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`New Event: ${event.title}`)
    .setURL(event.url)
    .addFields(
      { name: 'Date', value: formatDate(event.date_time, getTimezone(guildId)), inline: true },
      { name: 'Location', value: event.location || 'TBD', inline: true },
      { name: 'RSVPs', value: `${event.rsvp_count} going${event.waitlist_count > 0 ? ` · ${event.waitlist_count} waitlisted` : ''}`, inline: true },
    )
    .setColor(0x00AE86)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  console.log(`[notifier] Posted new event: ${event.title}`);
}

/**
 * Post an event update notification (changed fields).
 */
async function notifyEventUpdate(client, guildId, event, diffs) {
  const settings = queries.getGuildSettings().get(guildId);
  if (!settings?.events_channel_id) return;

  const channel = await client.channels.fetch(settings.events_channel_id).catch(() => null);
  if (!channel) return;

  const changeLines = diffs.map((d) => {
    const label = d.field === 'date_time' ? 'Date/Time' : d.field.charAt(0).toUpperCase() + d.field.slice(1);
    return `**${label}:** ${d.old || 'N/A'} → ${d.new}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`Event Updated: ${event.title}`)
    .setURL(event.url)
    .setDescription(changeLines.join('\n'))
    .setColor(0xFFA500)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  console.log(`[notifier] Posted event update: ${event.title}`);
}

/**
 * Post an event cancellation notification.
 */
async function notifyEventCancelled(client, guildId, event) {
  const settings = queries.getGuildSettings().get(guildId);
  if (!settings?.events_channel_id) return;

  const channel = await client.channels.fetch(settings.events_channel_id).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`Event Cancelled: ${event.title}`)
    .setURL(event.url)
    .setDescription('This event has been removed or cancelled.')
    .setColor(0xFF6B6B)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  console.log(`[notifier] Posted event cancellation: ${event.title}`);
}

/**
 * Post, edit, or repost the RSVP summary for an event.
 * If the previous message was posted within the edit threshold, edits it in place.
 * Otherwise, deletes the old message and posts a new one.
 */
async function notifyRsvpUpdate(client, guildId, event, rsvpChanges) {
  const settings = queries.getGuildSettings().get(guildId);
  if (!settings?.rsvp_channel_id) return;

  const channel = await client.channels.fetch(settings.rsvp_channel_id).catch(() => null);
  if (!channel) return;

  const threshold = settings.rsvp_edit_threshold_minutes || 15;

  // Check if we should edit or repost
  const prevMsg = queries.getRsvpMessage().get(event.event_id, guildId);
  let shouldEdit = false;
  let existingMsg = null;

  if (prevMsg) {
    const lastUpdate = new Date(prevMsg.updated_at + 'Z'); // SQLite stores UTC without Z
    const minutesAgo = (Date.now() - lastUpdate.getTime()) / (1000 * 60);
    shouldEdit = threshold > 0 && minutesAgo < threshold;

    if (shouldEdit) {
      try {
        existingMsg = await channel.messages.fetch(prevMsg.message_id);
      } catch {
        shouldEdit = false; // Message was deleted, repost instead
      }
    } else {
      // Delete the old message for repost
      try {
        const oldMsg = await channel.messages.fetch(prevMsg.message_id);
        await oldMsg.delete();
      } catch {
        // Already deleted
      }
    }
  }

  // Build sets of names that are new to each list
  const newToList = new Set([
    ...rsvpChanges.added.map((r) => r.member_name),
    ...rsvpChanges.changed.map((r) => r.member.member_name),
  ]);

  // Build full RSVP lists
  const going = rsvpChanges.all.filter((r) => r.rsvp_status === 'going');
  const waitlist = rsvpChanges.all.filter((r) => r.rsvp_status === 'waitlist');
  const notGoing = rsvpChanges.all.filter((r) => r.rsvp_status === 'not_going');

  const formatList = (list) => {
    if (list.length === 0) return '*None*';
    return list.map((r) => {
      const guestNote = r.guests > 0 ? `  \`+${r.guests} guest${r.guests > 1 ? 's' : ''}\`` : '';
      const isNew = newToList.has(r.member_name);
      const prefix = isNew ? '+' : '•';
      const newBadge = isNew ? ' 🆕' : '';
      return `${prefix} ${r.member_name}${guestNote}${newBadge}`;
    }).join('\n');
  };

  const goingTotal = going.reduce((sum, r) => sum + 1 + (r.guests || 0), 0);
  const waitlistTotal = waitlist.reduce((sum, r) => sum + 1 + (r.guests || 0), 0);

  const embed = new EmbedBuilder()
    .setTitle(`RSVPs: ${event.title}`)
    .setURL(event.url)
    .setDescription(formatDate(event.date_time, getTimezone(guildId)))
    .setFooter({ text: '📋 RSVP on Meetup.com' })
    .setColor(0x00AE86)
    .setTimestamp();

  embed.addFields({
    name: `✅ Going (${goingTotal})`,
    value: formatList(going),
    inline: true,
  });

  if (waitlist.length > 0) {
    embed.addFields({
      name: `⏳ Waitlist (${waitlistTotal})`,
      value: formatList(waitlist),
      inline: true,
    });
  }

  if (notGoing.length > 0) {
    embed.addFields({
      name: `❌ Not Going (${notGoing.length})`,
      value: formatList(notGoing),
      inline: true,
    });
  }

  if (shouldEdit && existingMsg) {
    await existingMsg.edit({ embeds: [embed] });
    queries.upsertRsvpMessage().run(event.event_id, channel.id, existingMsg.id, guildId);
    console.log(`[notifier] Edited RSVP summary for: ${event.title}`);
  } else {
    const msg = await channel.send({ embeds: [embed] });
    queries.upsertRsvpMessage().run(event.event_id, channel.id, msg.id, guildId);
    console.log(`[notifier] Posted RSVP summary for: ${event.title}`);
  }
}

/**
 * Post a combined comment notification for multiple new comments.
 * Top-level comments show as: **Author** — content
 * Replies show indented as: ↳ **Author** — content
 * If a reply's parent is not in this batch, shows parent content as context.
 * Shows like count if > 0.
 *
 * @param {Channel} channel - The Discord channel to post to
 * @param {object} event - Event object with title and url
 * @param {Array} comments - Array of new comments with parent_comment_id, likes, etc.
 * @param {Array} [allComments] - Optional full list of all comments (for parent context lookup)
 */
async function notifyNewComments(channel, event, comments, allComments) {
  if (!channel || comments.length === 0) return;

  // Build a set of comment_ids in this batch for quick lookup
  const batchIds = new Set(comments.map((c) => c.comment_id));

  // Build a map of all known comments for parent context lookup
  const allCommentsMap = {};
  if (allComments) {
    for (const c of allComments) {
      allCommentsMap[c.comment_id] = c;
    }
  }
  // Also add current batch to the map
  for (const c of comments) {
    allCommentsMap[c.comment_id] = c;
  }

  const lines = [];
  let isFirstTopLevel = true;
  for (const comment of comments) {
    let line = '';
    const likeSuffix = comment.likes > 0 ? `\u00A0\u00A0\u00A0 \`Likes: ${comment.likes}\`` : '';

    if (comment.is_reply || comment.parent_comment_id) {
      // It's a reply — check if parent is in this batch
      if (comment.parent_comment_id && !batchIds.has(comment.parent_comment_id)) {
        // Parent was posted earlier — show parent content as context
        const parent = allCommentsMap[comment.parent_comment_id];
        if (parent) {
          lines.push(`> ${parent.content}`);
        }
      }
      line = `↳ **${comment.author_name}** — ${comment.content}${likeSuffix}`;
    } else {
      // Top-level comment — add blank line before it (except the first)
      if (!isFirstTopLevel) {
        lines.push('');
      }
      isFirstTopLevel = false;
      line = `**${comment.author_name}** — ${comment.content}${likeSuffix}`;
    }
    lines.push(line);
  }

  const embed = new EmbedBuilder()
    .setTitle(`Comments: ${event.title}`)
    .setURL(event.url)
    .setDescription(lines.join('\n'))
    .setFooter({ text: '💬 Reply on Meetup.com' })
    .setColor(0x7289DA)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  console.log(`[notifier] Posted ${comments.length} new comment(s) on ${event.title}`);
}

/**
 * Post an event reminder.
 */
async function notifyReminder(client, guildId, event, reminderType) {
  const settings = queries.getGuildSettings().get(guildId);
  if (!settings?.reminders_channel_id) return;

  const channel = await client.channels.fetch(settings.reminders_channel_id).catch(() => null);
  if (!channel) return;

  let label;
  if (reminderType === 'day_before') {
    // Check if event is actually today or tomorrow
    const now = new Date();
    const eventDate = new Date(event.date_time);
    const isToday = now.toDateString() === eventDate.toDateString();
    label = isToday ? 'Today' : 'Tomorrow';
  } else {
    label = `Starting in ${reminderType}`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Reminder: ${event.title}`)
    .setURL(event.url)
    .setDescription(`**${label}**`)
    .addFields(
      { name: 'Date', value: formatDate(event.date_time, getTimezone(guildId)), inline: true },
      { name: 'Location', value: event.location || 'TBD', inline: true },
      { name: 'RSVPs', value: getRsvpSummary(event.event_id), inline: true },
    )
    .setColor(0xFFD700)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  console.log(`[notifier] Posted reminder (${reminderType}) for: ${event.title}`);
}

module.exports = {
  notifyNewEvent,
  notifyEventUpdate,
  notifyEventCancelled,
  notifyRsvpUpdate,
  notifyNewComments,
  notifyReminder,
};
