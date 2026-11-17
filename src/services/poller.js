const { queries } = require('../database');
const { getBackend } = require('./backend');
const { detectEventChanges } = require('./meetup-events');
const { detectRsvpChanges } = require('./meetup-rsvps');
const { detectNewComments } = require('./meetup-comments');
const notifier = require('./notifier');

let fullPollTimer = null;
let quickPollTimer = null;
let isPolling = false;

/**
 * Get the quick poll interval in minutes based on how close the next event is.
 */
function getQuickPollInterval(eventDateTime) {
  if (!eventDateTime) return null;

  const now = new Date();
  const eventDate = new Date(eventDateTime);
  const hoursUntil = (eventDate - now) / (1000 * 60 * 60);

  const GRACE_PERIOD_HOURS = 3;       // Keep polling for 3 hours after event start

  if (hoursUntil <= -GRACE_PERIOD_HOURS) return null; // Event ended (past grace period)
  if (hoursUntil <= 0) return 5;      // Event in progress — every 5 minutes
  if (hoursUntil <= 2) return 2;      // Every 2 minutes within 2 hours
  if (hoursUntil <= 8) return 5;      // Every 5 minutes within 8 hours
  if (hoursUntil <= 24) return 15;    // Every 15 minutes within 24 hours
  return null;                         // No quick polling needed
}

/**
 * Check and send reminders for upcoming events.
 */
async function checkReminders(client, guildId, settings) {
  const events = queries.getUpcomingEventsForGuild().all(guildId);
  const now = new Date();

  for (const event of events) {
    if (!event.date_time) continue;
    const eventDate = new Date(event.date_time);
    const hoursUntil = (eventDate - now) / (1000 * 60 * 60);

    // Day-before reminder
    if (settings.reminder_day_before && hoursUntil > 0 && hoursUntil <= 24) {
      const sent = queries.hasReminderBeenSent().get(event.event_id, guildId, 'day_before');
      if (!sent) {
        await notifier.notifyReminder(client, guildId, event, 'day_before');
        queries.markReminderSent().run(event.event_id, guildId, 'day_before');
      }
    }

    // Hours-before reminders
    if (settings.reminder_hours_before) {
      const hours = settings.reminder_hours_before.split(',').map((h) => parseFloat(h.trim())).filter((h) => !isNaN(h));
      for (const h of hours) {
        if (hoursUntil > 0 && hoursUntil <= h) {
          const reminderType = `${h}h_before`;
          const sent = queries.hasReminderBeenSent().get(event.event_id, guildId, reminderType);
          if (!sent) {
            await notifier.notifyReminder(client, guildId, event, `${h} hour(s)`);
            queries.markReminderSent().run(event.event_id, guildId, reminderType);
          }
        }
      }
    }
  }
}

/**
 * Check one event: details (changes, cancellation), RSVPs and comments, posting
 * any changes to Discord. Used by the quick poll for the next event, and by the
 * dashboard to rescan any event on demand. Returns a summary of what it found.
 */
async function pollEvent(client, guildId, settings, nextEvent) {
  const summary = { eventId: nextEvent.event_id, diffs: [], cancelled: false, rsvps: null, comments: null, errors: [] };
  const creds = queries.getMeetupCredentials().get(guildId);
  const startTime = Date.now();
  const backend = getBackend();

  try {
    await backend.ensureLoggedIn(creds?.email, creds?.password);

    // Check event details for changes (time, location, cancellation)
    try {
      console.log(`[poller] Checking event details for "${nextEvent.title}"...`);
      const details = await backend.getEventDetails(nextEvent.url);

      if (details.status === 'CANCELLED') {
        console.log(`[poller] Event "${nextEvent.title}" was cancelled on Meetup`);
        queries.cancelEvent().run(nextEvent.event_id);
        await notifier.notifyEventCancelled(client, guildId, nextEvent);
        summary.cancelled = true;
        return summary;
      }

      const diffs = [];
      if (details.title && details.title !== nextEvent.title) diffs.push({ field: 'title', old: nextEvent.title, new: details.title });
      if (details.location && details.location !== nextEvent.location) diffs.push({ field: 'location', old: nextEvent.location, new: details.location });
      if (details.date_time && details.date_time !== nextEvent.date_time) diffs.push({ field: 'date_time', old: nextEvent.date_time, new: details.date_time });

      if (diffs.length > 0) {
        console.log(`[poller] Event "${nextEvent.title}" changed:`, diffs.map((d) => `${d.field}: ${d.old} → ${d.new}`).join(', '));
        queries.upsertEvent().run(
          nextEvent.event_id, guildId, details.title || nextEvent.title, nextEvent.url,
          details.date_time || nextEvent.date_time, details.location || nextEvent.location,
          details.description || nextEvent.description,
          nextEvent.rsvp_count, nextEvent.waitlist_count
        );
        await notifier.notifyEventUpdate(client, guildId, { ...nextEvent, ...details }, diffs);
        // Refresh event data for RSVP/comment scraping
        Object.assign(nextEvent, details);
      }
      summary.diffs = diffs;
    } catch (err) {
      console.error(`[poller] Event detail check error for ${nextEvent.title}:`, err.message);
      summary.errors.push(`details: ${err.message}`);
    }

    // Scrape RSVPs
    try {
      console.log(`[poller] Scraping RSVPs for "${nextEvent.title}"...`);
      const rsvpStart = Date.now();
      let scrapedRsvps = await backend.getRsvps(nextEvent.url);
      if (settings.bot_meetup_name) {
        scrapedRsvps = scrapedRsvps.filter((r) => r.member_name !== settings.bot_meetup_name);
      }
      const rsvpChanges = detectRsvpChanges(nextEvent.event_id, scrapedRsvps);
      console.log(`[poller] RSVPs for "${nextEvent.title}": ${scrapedRsvps.length} total, ${rsvpChanges.added.length} added, ${rsvpChanges.removed.length} removed, ${rsvpChanges.changed.length} changed`);

      if (rsvpChanges.isFirstRun) {
        rsvpChanges.added = [];
        rsvpChanges.removed = [];
        rsvpChanges.changed = [];
      }
      const hasRsvpChanges = rsvpChanges.added.length > 0 || rsvpChanges.removed.length > 0 || rsvpChanges.changed.length > 0;
      if (hasRsvpChanges || rsvpChanges.isFirstRun) {
        const goingCount = scrapedRsvps.filter((r) => r.rsvp_status === 'going').length;
        const waitlistCount = scrapedRsvps.filter((r) => r.rsvp_status === 'waitlist').length;
        queries.upsertEvent().run(
          nextEvent.event_id, guildId, nextEvent.title, nextEvent.url,
          nextEvent.date_time, nextEvent.location, nextEvent.description,
          goingCount, waitlistCount
        );
        await notifier.notifyRsvpUpdate(client, guildId, nextEvent, rsvpChanges);
      }
      summary.rsvps = {
        total: scrapedRsvps.length,
        added: rsvpChanges.added.map((r) => r.member_name),
        removed: rsvpChanges.removed.map((r) => r.member_name),
        changed: rsvpChanges.changed.map((c) => c.member.member_name),
        posted: hasRsvpChanges || rsvpChanges.isFirstRun,
      };
      queries.insertScrapeLog().run(guildId, 'rsvps', 'success', null, Date.now() - rsvpStart);
    } catch (err) {
      console.error(`[poller] RSVP scrape error for ${nextEvent.title}:`, err.message);
      summary.errors.push(`rsvps: ${err.message}`);
      queries.insertScrapeLog().run(guildId, 'rsvps', 'error', err.message, Date.now() - startTime);
    }

    // Scrape comments
    try {
      console.log(`[poller] Scraping comments for "${nextEvent.title}"...`);
      const commentStart = Date.now();
      const scrapedComments = await backend.getComments(nextEvent.url);
      const newComments = detectNewComments(nextEvent.event_id, scrapedComments);
      if (newComments.length > 0) {
        const settings_ = queries.getGuildSettings().get(guildId);
        if (settings_?.comments_channel_id) {
          const commentsChannel = await client.channels.fetch(settings_.comments_channel_id).catch(() => null);
          await notifier.notifyNewComments(commentsChannel, nextEvent, newComments, scrapedComments);
        }
      }
      summary.comments = { total: scrapedComments.length, new: newComments.length };
      queries.insertScrapeLog().run(guildId, 'comments', 'success', null, Date.now() - commentStart);
    } catch (err) {
      console.error(`[poller] Comment scrape error for ${nextEvent.title}:`, err.message);
      summary.errors.push(`comments: ${err.message}`);
      queries.insertScrapeLog().run(guildId, 'comments', 'error', err.message, Date.now() - startTime);
    }
  } catch (err) {
    console.error(`[poller] Event poll error for "${nextEvent.title}":`, err.message);
    summary.errors.push(err.message);
  }
  summary.durationMs = Date.now() - startTime;
  return summary;
}

/**
 * Quick poll — only scrapes RSVPs and comments for the next imminent event per guild.
 * Runs on the adaptive interval (2-15 min depending on proximity).
 */
async function quickPollGuild(client, guildId, settings) {
  const creds = queries.getMeetupCredentials().get(guildId);
  if (!settings.enabled || !settings.meetup_group_url || !creds) return;

  const upcomingEvents = queries.getUpcomingEventsForGuild().all(guildId);
  if (upcomingEvents.length === 0) return;

  // Only check the next upcoming event
  const nextEvent = upcomingEvents[0];
  const interval = getQuickPollInterval(nextEvent.date_time);
  if (!interval) return; // Not close enough for quick polling

  console.log(`[poller] Quick poll for "${nextEvent.title}" (${interval}min interval)`);
  const summary = await pollEvent(client, guildId, settings, nextEvent);
  if (summary.errors.length && !summary.rsvps && !summary.comments) return; // logged in pollEvent

  // Check reminders
  await checkReminders(client, guildId, settings);
  console.log(`[poller] Quick poll complete in ${(summary.durationMs / 1000).toFixed(1)}s`);
}

/**
 * Full poll — scrapes the event listing page to detect new/changed/cancelled events.
 * Runs on the base interval (default 10 min).
 */
async function fullPollGuild(client, guildId, settings) {
  const startTime = Date.now();
  const creds = queries.getMeetupCredentials().get(guildId);

  if (!settings.enabled) {
    console.log(`[poller] Guild ${guildId}: polling disabled, skipping`);
    return;
  }
  if (!settings.meetup_group_url) {
    console.log(`[poller] Guild ${guildId}: no Meetup group URL configured, skipping`);
    return;
  }
  if (!creds) {
    console.log(`[poller] Guild ${guildId}: no Meetup credentials configured, skipping`);
    return;
  }

  console.log(`[poller] Full poll for guild ${guildId}: ${settings.meetup_group_url}`);
  const backend = getBackend();

  try {
    await backend.ensureLoggedIn(creds.email, creds.password);

    // Fetch event listing
    console.log(`[poller] Fetching events (${backend.name})...`);
    const scrapedEvents = await backend.getEvents(
      settings.meetup_group_url, guildId, { horizonDays: settings.event_horizon_days || 30 }
    );

    // With a backend that can look events up, absence from the listing is
    // never treated as cancellation. Each missing event is looked up directly
    // and only a status of CANCELLED from Meetup cancels it.
    if (backend.canLookupEvents) {
      const listedIds = new Set(scrapedEvents.map((e) => e.event_id));
      const missing = queries.getUpcomingEventsForGuild().all(guildId).filter((e) => !listedIds.has(e.event_id));
      for (const stored of missing) {
        try {
          const details = await backend.getEventDetails(stored.url);
          console.log(`[poller] "${stored.title}" not in listing; Meetup reports status ${details.status}`);
          scrapedEvents.push({ ...stored, ...details, guild_id: guildId, waitlist_count: stored.waitlist_count });
        } catch (err) {
          if (/^Event not found/.test(err.message)) {
            // Deleted outright, not cancelled: hide it without a notification.
            // upsertEvent un-hides it if it ever reappears.
            console.log(`[poller] "${stored.title}" no longer exists on Meetup — hiding it (no notification)`);
            queries.cancelEvent().run(stored.event_id);
          } else {
            // Can't tell (network, session) — keep it as-is
            console.log(`[poller] "${stored.title}" not in listing and lookup failed (${err.message}) — keeping as-is`);
          }
        }
      }
    }

    const eventChanges = detectEventChanges(scrapedEvents, guildId, { inferCancellations: !backend.canLookupEvents });
    console.log(`[poller] Events: ${scrapedEvents.length} found, ${eventChanges.newEvents.length} new, ${eventChanges.updatedEvents.length} updated, ${eventChanges.cancelledEvents.length} cancelled${eventChanges.isFirstRun ? ' (first run — seeding DB)' : ''}`);

    for (const { event, diffs } of eventChanges.updatedEvents) {
      await notifier.notifyEventUpdate(client, guildId, event, diffs);
    }
    for (const event of eventChanges.cancelledEvents) {
      await notifier.notifyEventCancelled(client, guildId, event);
    }

    queries.insertScrapeLog().run(guildId, 'events', 'success', null, Date.now() - startTime);

    // Cleanup old events
    queries.deleteOldEvents().run();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[poller] Full poll complete in ${elapsed}s`);
  } catch (err) {
    console.error(`[poller] Full poll error for guild ${guildId}:`, err.message);
    queries.insertScrapeLog().run(guildId, 'events', 'error', err.message, Date.now() - startTime);
  }
}

/**
 * Run a full poll + quick poll for all guilds (used on startup and /poll command).
 */
async function pollGuild(client, guildId, settings) {
  await fullPollGuild(client, guildId, settings);
  await quickPollGuild(client, guildId, settings);
}

// What the poller is doing and when it runs next (shown on the dashboard).
const status = {
  busy: null,
  busySince: null,
  lastFullPollAt: null,
  lastQuickPollAt: null,
  nextFullPollAt: null,
  nextQuickPollAt: null,
  fullIntervalMinutes: null,
  quickIntervalMinutes: null,
};

class PollerBusyError extends Error {}

/**
 * Run a polling task unless another one is in progress. Scheduled loops,
 * /poll and the dashboard all go through this, so they never overlap.
 */
async function runExclusive(task, fn) {
  if (isPolling) throw new PollerBusyError(`Already running: ${status.busy}`);
  isPolling = true;
  status.busy = task;
  status.busySince = new Date().toISOString();
  try {
    return await fn();
  } finally {
    isPolling = false;
    status.busy = null;
    status.busySince = null;
  }
}

/**
 * Run full polls for all guilds.
 */
async function fullPollAll(client) {
  if (isPolling) {
    console.log(`[poller] Previous poll still running (${status.busy}), skipping`);
    return;
  }
  await runExclusive('scheduled full poll', async () => {
    const allSettings = queries.getAllGuildSettings().all();
    console.log(`[poller] Full poll starting — ${allSettings.length} guild(s)`);
    for (const settings of allSettings) {
      await fullPollGuild(client, settings.guild_id, settings);
    }
    console.log('[poller] Full poll finished');
    status.lastFullPollAt = new Date().toISOString();
  });
}

/**
 * Run quick polls for all guilds.
 */
async function quickPollAll(client) {
  if (isPolling) return; // Don't overlap with full poll
  await runExclusive('scheduled quick poll', async () => {
    const allSettings = queries.getAllGuildSettings().all();
    for (const settings of allSettings) {
      await quickPollGuild(client, settings.guild_id, settings);
    }
    status.lastQuickPollAt = new Date().toISOString();
  });
}

/** Full + quick poll one guild now (/poll command, dashboard). Throws PollerBusyError if busy. */
function pollGuildNow(client, guildId, task = 'manual poll') {
  return runExclusive(task, async () => {
    const settings = queries.getGuildSettings().get(guildId);
    if (!settings) throw new Error('Guild is not configured');
    await pollGuild(client, guildId, settings);
    status.lastFullPollAt = new Date().toISOString();
    status.lastQuickPollAt = status.lastFullPollAt;
  });
}

/** Rescan one stored event now (dashboard). Returns pollEvent's summary. */
function pollEventNow(client, guildId, eventId) {
  return runExclusive(`rescan event ${eventId}`, async () => {
    const settings = queries.getGuildSettings().get(guildId);
    const event = queries.getEventForGuild().get(eventId, guildId);
    if (!settings || !event) throw new Error('Event not found for this guild');
    return pollEvent(client, guildId, settings, event);
  });
}

function getStatus() {
  return { ...status };
}

/**
 * Determine the fastest quick poll interval needed across all guilds.
 */
function getShortestQuickInterval() {
  const allSettings = queries.getAllGuildSettings().all();
  let shortest = null;

  for (const settings of allSettings) {
    if (!settings.enabled) continue;
    const events = queries.getUpcomingEventsForGuild().all(settings.guild_id);
    if (events.length === 0) continue;
    const interval = getQuickPollInterval(events[0].date_time);
    if (interval && (!shortest || interval < shortest)) {
      shortest = interval;
    }
  }

  return shortest;
}

/**
 * Start the polling loops.
 */
async function startPolling(client) {
  console.log('[poller] Starting polling loops');

  // Run first full poll + quick poll immediately (enabled guilds only)
  const allSettings = queries.getAllGuildSettings().all().filter((s) => s.enabled);
  if (allSettings.length === 0) {
    console.log('[poller] No enabled guilds configured yet. Use /config to set up.');
  }
  await runExclusive('startup poll', async () => {
    for (const settings of allSettings) {
      await pollGuild(client, settings.guild_id, settings);
    }
    status.lastFullPollAt = new Date().toISOString();
    status.lastQuickPollAt = status.lastFullPollAt;
  });

  // Start both polling loops with dynamic intervals
  scheduleFullPoll(client);
  scheduleQuickPoll(client);
}

/**
 * Schedule the next full poll, re-reading interval from DB each time.
 */
function scheduleFullPoll(client) {
  if (fullPollTimer) clearTimeout(fullPollTimer);

  const allSettings = queries.getAllGuildSettings().all().filter((s) => s.enabled);
  const defaultInterval = parseInt(process.env.DEFAULT_POLL_INTERVAL_MINUTES, 10) || 10;
  const baseInterval = allSettings.length > 0
    ? Math.min(...allSettings.map((s) => s.poll_interval_minutes || defaultInterval))
    : defaultInterval;
  console.log(`[poller] Full poll every ${baseInterval} minute(s)`);
  status.fullIntervalMinutes = baseInterval;
  status.nextFullPollAt = new Date(Date.now() + baseInterval * 60 * 1000).toISOString();

  fullPollTimer = setTimeout(async () => {
    await fullPollAll(client);
    scheduleFullPoll(client); // Reschedule with potentially updated interval
  }, baseInterval * 60 * 1000);
}

/**
 * Schedule the next quick poll based on the closest upcoming event.
 */
function scheduleQuickPoll(client) {
  if (quickPollTimer) clearTimeout(quickPollTimer);

  const interval = getShortestQuickInterval();
  if (!interval) {
    console.log('[poller] No imminent events — quick polling idle');
    status.quickIntervalMinutes = null;
    status.nextQuickPollAt = null;
    // Check again in 15 minutes
    quickPollTimer = setTimeout(() => scheduleQuickPoll(client), 15 * 60 * 1000);
    return;
  }

  console.log(`[poller] Quick poll every ${interval} minute(s)`);
  status.quickIntervalMinutes = interval;
  status.nextQuickPollAt = new Date(Date.now() + interval * 60 * 1000).toISOString();
  quickPollTimer = setTimeout(async () => {
    await quickPollAll(client);
    scheduleQuickPoll(client); // Reschedule (interval may have changed)
  }, interval * 60 * 1000);
}

/**
 * Stop all polling loops.
 */
function stopPolling() {
  if (fullPollTimer) {
    clearInterval(fullPollTimer);
    fullPollTimer = null;
  }
  if (quickPollTimer) {
    clearTimeout(quickPollTimer);
    quickPollTimer = null;
  }
  console.log('[poller] Polling stopped');
}

module.exports = {
  startPolling,
  stopPolling,
  pollGuild,
  pollGuildNow,
  pollEventNow,
  getStatus,
  getQuickPollInterval,
  PollerBusyError,
};
