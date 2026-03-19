const { queries } = require('../database');
const { ensureLoggedIn } = require('./scraper');
const { scrapeEvents, detectEventChanges } = require('./meetup-events');
const { scrapeRsvps, detectRsvpChanges } = require('./meetup-rsvps');
const { scrapeComments, detectNewComments } = require('./meetup-comments');
const { getPage, saveSession } = require('./scraper');
const { extractEventDetails, dismissMeetupPlusPopup } = require('../utils/selectors');
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

  if (hoursUntil <= 0) return null;   // Event has passed
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

  const startTime = Date.now();
  console.log(`[poller] Quick poll for "${nextEvent.title}" (${interval}min interval)`);

  try {
    await ensureLoggedIn(creds.email, creds.password);

    // Check event details for changes (time, location, cancellation)
    try {
      console.log(`[poller] Checking event details for "${nextEvent.title}"...`);
      const page = await getPage();
      await page.goto(nextEvent.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await dismissMeetupPlusPopup(page);
      const details = await extractEventDetails(page);
      await page.close();
      await saveSession();

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
    } catch (err) {
      console.error(`[poller] Event detail check error for ${nextEvent.title}:`, err.message);
    }

    // Scrape RSVPs
    try {
      console.log(`[poller] Scraping RSVPs for "${nextEvent.title}"...`);
      const rsvpStart = Date.now();
      let scrapedRsvps = await scrapeRsvps(nextEvent.url);
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
      queries.insertScrapeLog().run(guildId, 'rsvps', 'success', null, Date.now() - rsvpStart);
    } catch (err) {
      console.error(`[poller] RSVP scrape error for ${nextEvent.title}:`, err.message);
      queries.insertScrapeLog().run(guildId, 'rsvps', 'error', err.message, Date.now() - startTime);
    }

    // Scrape comments
    try {
      console.log(`[poller] Scraping comments for "${nextEvent.title}"...`);
      const commentStart = Date.now();
      const scrapedComments = await scrapeComments(nextEvent.url);
      const newComments = detectNewComments(nextEvent.event_id, scrapedComments);
      for (const comment of newComments) {
        await notifier.notifyNewComment(client, guildId, nextEvent, comment);
      }
      queries.insertScrapeLog().run(guildId, 'comments', 'success', null, Date.now() - commentStart);
    } catch (err) {
      console.error(`[poller] Comment scrape error for ${nextEvent.title}:`, err.message);
      queries.insertScrapeLog().run(guildId, 'comments', 'error', err.message, Date.now() - startTime);
    }

    // Check reminders
    await checkReminders(client, guildId, settings);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[poller] Quick poll complete in ${elapsed}s`);
  } catch (err) {
    console.error(`[poller] Quick poll error for guild ${guildId}:`, err.message);
  }
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

  try {
    await ensureLoggedIn(creds.email, creds.password);

    // Scrape event listing
    console.log('[poller] Scraping events...');
    const scrapedEvents = await scrapeEvents(settings.meetup_group_url, guildId);
    const eventChanges = detectEventChanges(scrapedEvents, guildId);
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

/**
 * Run full polls for all guilds.
 */
async function fullPollAll(client) {
  if (isPolling) {
    console.log('[poller] Previous poll still running, skipping');
    return;
  }
  isPolling = true;
  try {
    const allSettings = queries.getAllGuildSettings().all();
    console.log(`[poller] Full poll starting — ${allSettings.length} guild(s)`);
    for (const settings of allSettings) {
      await fullPollGuild(client, settings.guild_id, settings);
    }
    console.log('[poller] Full poll finished');
  } finally {
    isPolling = false;
  }
}

/**
 * Run quick polls for all guilds.
 */
async function quickPollAll(client) {
  if (isPolling) return; // Don't overlap with full poll
  isPolling = true;
  try {
    const allSettings = queries.getAllGuildSettings().all();
    for (const settings of allSettings) {
      await quickPollGuild(client, settings.guild_id, settings);
    }
  } finally {
    isPolling = false;
  }
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

  // Run first full poll + quick poll immediately
  const allSettings = queries.getAllGuildSettings().all();
  if (allSettings.length === 0) {
    console.log('[poller] No guilds configured yet. Use /config to set up.');
  }
  for (const settings of allSettings) {
    await pollGuild(client, settings.guild_id, settings);
  }

  // Full poll on base interval (checks for new/changed events)
  const baseInterval = allSettings.reduce(
    (min, s) => Math.min(min, s.poll_interval_minutes || 10),
    parseInt(process.env.DEFAULT_POLL_INTERVAL_MINUTES, 10) || 10
  );
  console.log(`[poller] Full poll every ${baseInterval} minute(s)`);
  fullPollTimer = setInterval(() => fullPollAll(client), baseInterval * 60 * 1000);

  // Quick poll on adaptive interval (RSVPs + comments for imminent events)
  scheduleQuickPoll(client);
}

/**
 * Schedule the next quick poll based on the closest upcoming event.
 */
function scheduleQuickPoll(client) {
  if (quickPollTimer) clearTimeout(quickPollTimer);

  const interval = getShortestQuickInterval();
  if (!interval) {
    console.log('[poller] No imminent events — quick polling idle');
    // Check again in 15 minutes
    quickPollTimer = setTimeout(() => scheduleQuickPoll(client), 15 * 60 * 1000);
    return;
  }

  console.log(`[poller] Quick poll every ${interval} minute(s)`);
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

module.exports = { startPolling, stopPolling, pollGuild };
