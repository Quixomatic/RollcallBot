const { getPage, saveSession } = require('./scraper');
const { queries } = require('../database');
const { waitForEventsPage, getEventLinks, extractEventDetails, dismissMeetupPlusPopup } = require('../utils/selectors');

/**
 * Scrape the event listing page for a Meetup group.
 * First gets all event links from the listing, then visits each to get details.
 * Returns an array of event objects.
 */
async function scrapeEvents(groupUrl, guildId) {
  const page = await getPage();
  const events = [];

  try {
    const eventsUrl = groupUrl.replace(/\/$/, '') + '/events/';
    console.log(`[meetup-events] Scraping: ${eventsUrl}`);
    await page.goto(eventsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForEventsPage(page);

    // Extract group slug from URL for filtering (e.g., "reston-pickup-soccer-rps")
    const groupSlug = groupUrl.replace(/\/$/, '').split('/').pop();
    const eventLinks = await getEventLinks(page, groupSlug);
    console.log(`[meetup-events] Found ${eventLinks.length} event link(s)`);

    // Visit each event page to get details
    for (const link of eventLinks) {
      try {
        const eventId = link.href.match(/events\/(\d+)/)?.[1];
        if (!eventId) continue;

        console.log(`[meetup-events] Scraping event: ${link.href}`);
        await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await dismissMeetupPlusPopup(page);

        const details = await extractEventDetails(page);

        events.push({
          event_id: eventId,
          guild_id: guildId,
          title: details.title,
          url: link.href,
          date_time: details.date_time,
          location: details.location,
          description: details.description,
          rsvp_count: details.rsvp_count,
          waitlist_count: 0,
        });
      } catch (err) {
        console.error(`[meetup-events] Error scraping event ${link.href}:`, err.message);
      }
    }

    await saveSession();
  } catch (err) {
    console.error('[meetup-events] Scrape error:', err.message);
    throw err;
  } finally {
    await page.close();
  }

  return events;
}

/**
 * Compare scraped events against stored state, detect changes.
 * Returns { newEvents, updatedEvents, cancelledEvents }
 *
 * Options:
 *   inferCancellations — treat a stored event missing from the scrape as
 *     cancelled. The browser backend needs this (it has no other signal).
 *     The GraphQL backend passes false: there an event is only ever cancelled
 *     when Meetup itself reports status 'CANCELLED' for it, which the poller
 *     confirms by looking up every event that drops out of the listing.
 */
function detectEventChanges(scrapedEvents, guildId, { inferCancellations = true } = {}) {
  const changes = { newEvents: [], updatedEvents: [], cancelledEvents: [], isFirstRun: false };
  const storedEvents = queries.getEventsForGuild().all(guildId);
  const storedMap = new Map(storedEvents.map((e) => [e.event_id, e]));

  // If there are no stored events, this is the first run — seed the DB but don't notify
  if (storedEvents.length === 0) {
    changes.isFirstRun = true;
  }
  const scrapedIds = new Set(scrapedEvents.map((e) => e.event_id));

  for (const scraped of scrapedEvents) {
    const stored = storedMap.get(scraped.event_id);

    if (scraped.status === 'CANCELLED') {
      // Never upsert a cancelled event: upsertEvent clears is_cancelled.
      if (stored) {
        changes.cancelledEvents.push(stored);
        queries.cancelEvent().run(stored.event_id);
      }
      continue;
    }

    if (!stored) {
      changes.newEvents.push(scraped);
    } else {
      // Check for meaningful changes
      const diffs = [];
      if (stored.title !== scraped.title) diffs.push({ field: 'title', old: stored.title, new: scraped.title });
      if (stored.location !== scraped.location && scraped.location) diffs.push({ field: 'location', old: stored.location, new: scraped.location });
      if (stored.date_time !== scraped.date_time && scraped.date_time) diffs.push({ field: 'date_time', old: stored.date_time, new: scraped.date_time });
      if (diffs.length > 0) {
        changes.updatedEvents.push({ event: scraped, diffs });
      }
    }

    // Upsert into database
    queries.upsertEvent().run(
      scraped.event_id, scraped.guild_id, scraped.title, scraped.url,
      scraped.date_time, scraped.location, scraped.description || null,
      scraped.rsvp_count, scraped.waitlist_count
    );
  }

  // A scrape that returns nothing is almost always a broken scrape — a selector
  // miss, a popup covering the listing, or a session that is half-expired but
  // still passes isLoggedIn(). Treating it as "every event was cancelled" flags
  // the entire table in one pass, so bail out instead and let the next poll
  // decide. A genuinely empty group is indistinguishable here, but it costs
  // nothing to wait for a scrape that actually returned data.
  if (!inferCancellations) return changes;

  if (scrapedEvents.length === 0 && storedEvents.length > 0) {
    console.warn(
      `[meetup-events] Scrape returned 0 events but ${storedEvents.length} are stored — ` +
      'skipping cancellation detection (likely a failed scrape, not mass cancellation)'
    );
    return changes;
  }

  // Detect cancelled/removed events (in DB but not on page)
  // Only flag as cancelled if the event hasn't started yet — past events
  // naturally disappear from the listing page and aren't cancelled
  const now = new Date();
  for (const stored of storedEvents) {
    if (!scrapedIds.has(stored.event_id) && !stored.is_cancelled) {
      const eventDate = stored.date_time ? new Date(stored.date_time) : null;
      if (eventDate && eventDate < now) {
        // Event already started/passed — just clean it up silently
        continue;
      }
      changes.cancelledEvents.push(stored);
      queries.cancelEvent().run(stored.event_id);
    }
  }

  if (changes.cancelledEvents.length > 0) {
    console.warn(
      `[meetup-events] Flagged ${changes.cancelledEvents.length} of ${storedEvents.length} ` +
      `stored event(s) as cancelled (scrape returned ${scrapedEvents.length}): ` +
      changes.cancelledEvents.map((e) => `${e.event_id} "${e.title}"`).join(', ')
    );
  }

  return changes;
}

module.exports = { scrapeEvents, detectEventChanges };
