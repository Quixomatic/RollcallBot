const { getPage, saveSession } = require('./scraper');
const { queries } = require('../database');
const { dismissMeetupPlusPopup, extractAttendees } = require('../utils/selectors');

/**
 * Scrape the RSVP/attendee list for a specific event.
 * Navigates to event page, clicks "See all" to open attendee list, then extracts names.
 */
async function scrapeRsvps(eventUrl) {
  const page = await getPage();
  const rsvps = [];

  try {
    const baseUrl = eventUrl.replace(/\/?(\?.*)?$/, '').replace(/\/attendees\/?$/, '');
    const attendeesUrl = baseUrl + '/attendees/';
    console.log(`[meetup-rsvps] Scraping: ${attendeesUrl}`);
    await page.goto(attendeesUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await dismissMeetupPlusPopup(page);

    const attendees = await extractAttendees(page);
    rsvps.push(...attendees);

    console.log(`[meetup-rsvps] Found ${rsvps.length} attendee(s)`);
    await saveSession();
  } catch (err) {
    console.error('[meetup-rsvps] Scrape error:', err.message);
    throw err;
  } finally {
    await page.close();
  }

  return rsvps;
}

/**
 * Compare scraped RSVPs against stored state.
 * Returns { added, removed, changed, all }
 */
function detectRsvpChanges(eventId, scrapedRsvps) {
  const changes = { added: [], removed: [], changed: [], all: scrapedRsvps, isFirstRun: false };
  const storedRsvps = queries.getRsvpsForEvent().all(eventId);
  if (storedRsvps.length === 0) {
    changes.isFirstRun = true;
  }
  const storedMap = new Map(storedRsvps.map((r) => [r.member_name, r]));
  const scrapedMap = new Map(scrapedRsvps.map((r) => [r.member_name, r]));

  for (const scraped of scrapedRsvps) {
    const stored = storedMap.get(scraped.member_name);
    if (!stored) {
      changes.added.push(scraped);
    } else if (stored.rsvp_status !== scraped.rsvp_status) {
      changes.changed.push({ member: scraped, old_status: stored.rsvp_status });
    }

    // Upsert
    queries.upsertRsvp().run(eventId, scraped.member_name, scraped.member_url || null, scraped.rsvp_status, scraped.guests || 0);
  }

  // Detect removed RSVPs
  for (const stored of storedRsvps) {
    if (!scrapedMap.has(stored.member_name)) {
      changes.removed.push(stored);
      queries.deleteRsvp().run(eventId, stored.member_name);
    }
  }

  return changes;
}

module.exports = { scrapeRsvps, detectRsvpChanges };
