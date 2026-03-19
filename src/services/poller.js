const { queries } = require('../database');
const { ensureLoggedIn } = require('./scraper');
const { scrapeEvents, detectEventChanges } = require('./meetup-events');
const { scrapeRsvps, detectRsvpChanges } = require('./meetup-rsvps');
const { scrapeComments, detectNewComments } = require('./meetup-comments');
const notifier = require('./notifier');

let pollTimer = null;
let isPolling = false;

/**
 * Determine how often to poll based on how close an event is.
 * Returns a multiplier: 1 = normal, 0.5 = double speed, 0.25 = 4x speed.
 */
function getPollingUrgency(eventDateTime) {
  if (!eventDateTime) return 1;

  const now = new Date();
  const eventDate = new Date(eventDateTime);
  const hoursUntil = (eventDate - now) / (1000 * 60 * 60);

  if (hoursUntil <= 2) return 0.25;  // 4x faster within 2 hours
  if (hoursUntil <= 24) return 0.5;  // 2x faster within 24 hours
  return 1;
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
 * Run one scrape cycle for a single guild.
 */
async function pollGuild(client, guildId, settings) {
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

  console.log(`[poller] Guild ${guildId}: starting poll cycle for ${settings.meetup_group_url}`);

  try {
    // Ensure we're logged in
    console.log('[poller] Checking login session...');
    await ensureLoggedIn(creds.email, creds.password);

    // 1. Scrape events
    console.log('[poller] Scraping events...');
    const scrapedEvents = await scrapeEvents(settings.meetup_group_url, guildId);
    const eventChanges = detectEventChanges(scrapedEvents, guildId);
    console.log(`[poller] Events: ${scrapedEvents.length} found, ${eventChanges.newEvents.length} new, ${eventChanges.updatedEvents.length} updated, ${eventChanges.cancelledEvents.length} cancelled${eventChanges.isFirstRun ? ' (first run — seeding DB, no notifications)' : ''}`);

    // Only notify on updates and cancellations — not new events
    // (recurring events constantly create new entries, which is just noise)
    for (const { event, diffs } of eventChanges.updatedEvents) {
      await notifier.notifyEventUpdate(client, guildId, event, diffs);
    }
    for (const event of eventChanges.cancelledEvents) {
      await notifier.notifyEventCancelled(client, guildId, event);
    }

    queries.insertScrapeLog().run(guildId, 'events', 'success', null, Date.now() - startTime);

    // 2. Scrape RSVPs for upcoming events (with urgency-based filtering)
    const upcomingEvents = queries.getUpcomingEventsForGuild().all(guildId);
    console.log(`[poller] ${upcomingEvents.length} upcoming event(s) to check for RSVPs`);
    for (const event of upcomingEvents) {
      const urgency = getPollingUrgency(event.date_time);
      // Skip RSVP scraping for distant events
      if (urgency >= 1) {
        console.log(`[poller] Skipping RSVP check for "${event.title}" (low urgency)`);
        continue;
      }

      try {
        console.log(`[poller] Scraping RSVPs for "${event.title}"...`);
        const rsvpStart = Date.now();
        let scrapedRsvps = await scrapeRsvps(event.url);
        // Filter out the bot's Meetup account
        if (settings.bot_meetup_name) {
          scrapedRsvps = scrapedRsvps.filter((r) => r.member_name !== settings.bot_meetup_name);
        }
        const rsvpChanges = detectRsvpChanges(event.event_id, scrapedRsvps);
        console.log(`[poller] RSVPs for "${event.title}": ${scrapedRsvps.length} total, ${rsvpChanges.added.length} added, ${rsvpChanges.removed.length} removed, ${rsvpChanges.changed.length} changed`);

        if (rsvpChanges.isFirstRun) {
          // First time seeing this event's RSVPs — post a clean summary without change lines
          rsvpChanges.added = [];
          rsvpChanges.removed = [];
          rsvpChanges.changed = [];
        }
        const hasRsvpChanges = rsvpChanges.added.length > 0 || rsvpChanges.removed.length > 0 || rsvpChanges.changed.length > 0;
        if (hasRsvpChanges || rsvpChanges.isFirstRun) {
          // Update event RSVP counts
          const goingCount = scrapedRsvps.filter((r) => r.rsvp_status === 'going').length;
          const waitlistCount = scrapedRsvps.filter((r) => r.rsvp_status === 'waitlist').length;
          queries.upsertEvent().run(
            event.event_id, guildId, event.title, event.url,
            event.date_time, event.location, event.description,
            goingCount, waitlistCount
          );

          await notifier.notifyRsvpUpdate(client, guildId, event, rsvpChanges);
        }

        queries.insertScrapeLog().run(guildId, 'rsvps', 'success', null, Date.now() - rsvpStart);
      } catch (err) {
        console.error(`[poller] RSVP scrape error for ${event.title}:`, err.message);
        queries.insertScrapeLog().run(guildId, 'rsvps', 'error', err.message, Date.now() - startTime);
      }
    }

    // 3. Scrape comments (less frequently, only for near events)
    for (const event of upcomingEvents) {
      const urgency = getPollingUrgency(event.date_time);
      if (urgency >= 1) {
        console.log(`[poller] Skipping comments for "${event.title}" (low urgency)`);
        continue;
      }

      try {
        console.log(`[poller] Scraping comments for "${event.title}"...`);
        const commentStart = Date.now();
        const scrapedComments = await scrapeComments(event.url);
        const newComments = detectNewComments(event.event_id, scrapedComments);

        for (const comment of newComments) {
          await notifier.notifyNewComment(client, guildId, event, comment);
        }

        queries.insertScrapeLog().run(guildId, 'comments', 'success', null, Date.now() - commentStart);
      } catch (err) {
        console.error(`[poller] Comment scrape error for ${event.title}:`, err.message);
        queries.insertScrapeLog().run(guildId, 'comments', 'error', err.message, Date.now() - startTime);
      }
    }

    // 4. Check reminders (after RSVPs so counts are populated)
    await checkReminders(client, guildId, settings);

    // 5. Cleanup old events
    queries.deleteOldEvents().run();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[poller] Guild ${guildId}: poll cycle complete in ${elapsed}s`);

  } catch (err) {
    console.error(`[poller] Poll error for guild ${guildId}:`, err.message);
    queries.insertScrapeLog().run(guildId, 'events', 'error', err.message, Date.now() - startTime);
  }
}

/**
 * Run one full poll cycle across all configured guilds.
 */
async function pollAll(client) {
  if (isPolling) {
    console.log('[poller] Previous poll still running, skipping');
    return;
  }

  isPolling = true;
  try {
    const allSettings = queries.getAllGuildSettings().all();
    console.log(`[poller] Poll cycle starting — ${allSettings.length} guild(s) configured`);
    if (allSettings.length === 0) {
      console.log('[poller] No guilds configured yet. Use /config to set up.');
    }
    for (const settings of allSettings) {
      await pollGuild(client, settings.guild_id, settings);
    }
    console.log('[poller] Poll cycle finished');
  } finally {
    isPolling = false;
  }
}

/**
 * Start the polling loop.
 */
async function startPolling(client) {
  console.log('[poller] Starting polling loop');

  // Run first poll immediately
  await pollAll(client);

  // Then poll on interval — use the shortest configured interval across guilds
  const allSettings = queries.getAllGuildSettings().all();
  const minInterval = allSettings.reduce(
    (min, s) => Math.min(min, s.poll_interval_minutes || 10),
    parseInt(process.env.DEFAULT_POLL_INTERVAL_MINUTES, 10) || 10
  );

  const intervalMs = minInterval * 60 * 1000;
  console.log(`[poller] Polling every ${minInterval} minute(s)`);

  pollTimer = setInterval(() => pollAll(client), intervalMs);
}

/**
 * Stop the polling loop.
 */
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[poller] Polling stopped');
  }
}

module.exports = { startPolling, stopPolling, pollAll, pollGuild };
