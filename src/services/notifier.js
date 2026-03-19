const { EmbedBuilder } = require('discord.js');
const { queries } = require('../database');

/**
 * Format an ISO date string or date-like string into a human-readable format.
 */
function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return dateStr;
  }
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
      { name: 'Date', value: formatDate(event.date_time), inline: true },
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
 * Post or update the RSVP summary for an event.
 * Deletes the old summary message and posts a new one.
 */
async function notifyRsvpUpdate(client, guildId, event, rsvpChanges) {
  const settings = queries.getGuildSettings().get(guildId);
  if (!settings?.rsvp_channel_id) return;

  const channel = await client.channels.fetch(settings.rsvp_channel_id).catch(() => null);
  if (!channel) return;

  // Delete the previous RSVP summary message
  const prevMsg = queries.getRsvpMessage().get(event.event_id, guildId);
  if (prevMsg) {
    try {
      const oldMsg = await channel.messages.fetch(prevMsg.message_id);
      await oldMsg.delete();
    } catch {
      // Message may already be deleted
    }
  }

  // Build sets of names that are new to each list
  // "added" = brand new RSVPs, "changed" = moved between lists
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
      const prefix = newToList.has(r.member_name) ? '+' : '•';
      return `${prefix} ${r.member_name}${guestNote}`;
    }).join('\n');
  };

  const goingTotal = going.reduce((sum, r) => sum + 1 + (r.guests || 0), 0);
  const waitlistTotal = waitlist.reduce((sum, r) => sum + 1 + (r.guests || 0), 0);

  const embed = new EmbedBuilder()
    .setTitle(`RSVPs: ${event.title}`)
    .setURL(event.url)
    .setDescription(formatDate(event.date_time))
    .setColor(0x00AE86)
    .setTimestamp();

  // Use inline fields for column layout
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

  const msg = await channel.send({ embeds: [embed] });

  // Save the message ID for future delete-and-repost
  queries.upsertRsvpMessage().run(event.event_id, channel.id, msg.id, guildId);
  console.log(`[notifier] Posted RSVP summary for: ${event.title}`);
}

/**
 * Post a new comment notification.
 */
async function notifyNewComment(client, guildId, event, comment) {
  const settings = queries.getGuildSettings().get(guildId);
  if (!settings?.comments_channel_id) return;

  const channel = await client.channels.fetch(settings.comments_channel_id).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`New Comment on: ${event.title}`)
    .setURL(event.url)
    .addFields(
      { name: comment.author_name, value: comment.content },
    )
    .setFooter({ text: comment.posted_at || '' })
    .setColor(0x7289DA)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  console.log(`[notifier] Posted new comment by ${comment.author_name} on ${event.title}`);
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
      { name: 'Date', value: formatDate(event.date_time), inline: true },
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
  notifyNewComment,
  notifyReminder,
};
