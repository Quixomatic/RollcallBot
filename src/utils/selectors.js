/**
 * Centralized DOM selectors and locator helpers for Meetup.com scraping.
 *
 * Based on Playwright codegen recordings against live Meetup pages.
 * Uses Playwright's role-based locators where possible for stability.
 */

/**
 * Dismiss the Meetup+ upgrade popup if it appears.
 */
async function dismissMeetupPlusPopup(page) {
  try {
    const btn = page.getByRole('button', { name: 'continue with free plan' });
    await btn.click({ timeout: 2000 });
    console.log('[selectors] Dismissed Meetup+ popup');
  } catch {
    // Popup didn't appear, that's fine
  }
}

/**
 * Wait for the events page to load dynamic content (lazy-loaded event cards).
 */
async function waitForEventsPage(page) {
  // Wait for the Upcoming button/tab to be visible
  await page.getByRole('button', { name: 'Upcoming' }).waitFor({ timeout: 15000 }).catch(() => {});
  await dismissMeetupPlusPopup(page);

  // Wait for event links to lazy-load in
  try {
    await page.locator('a[href*="/events/"]').first().waitFor({ timeout: 15000 });
    console.log('[selectors] Event links loaded');
  } catch {
    console.log('[selectors] Timed out waiting for event links to load');
  }

  // Scroll down to trigger more lazy loads, then wait for settle
  let previousCount = 0;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    const currentCount = await page.locator('a[href*="/events/"]').count();
    if (currentCount === previousCount) break;
    previousCount = currentCount;
    console.log(`[selectors] Scrolled, now ${currentCount} event link(s)`);
  }

  await dismissMeetupPlusPopup(page);
}

/**
 * Get all event links from the events listing page.
 * @param {Page} page
 * @param {string} groupSlug - The group's URL slug (e.g., "reston-pickup-soccer-rps")
 *                              Used to filter out "similar events" from other groups.
 * Returns array of { href, text } from the event links.
 */
async function getEventLinks(page, groupSlug) {
  // Event links on the listing page contain info like "8 seats left Thursday RPS..."
  // They're <a> tags that link to /events/<id>/
  const links = await page.locator('a[href*="/events/"]').all();
  const events = [];

  for (const link of links) {
    try {
      const href = await link.getAttribute('href');
      const text = await link.textContent();

      // Only include links that:
      // 1. Go to specific event pages (have an event ID)
      // 2. Belong to THIS group (not "similar events" from other groups)
      if (href && href.match(/\/events\/\d+/) && href.includes(groupSlug)) {
        events.push({
          href: href.startsWith('http') ? href : `https://www.meetup.com${href}`,
          text: text?.trim() || '',
        });
      }
    } catch {
      continue;
    }
  }

  // Deduplicate by event ID (strip query params)
  const seen = new Set();
  return events.filter((e) => {
    const eventId = e.href.match(/events\/(\d+)/)?.[1];
    if (!eventId || seen.has(eventId)) return false;
    seen.add(eventId);
    return true;
  });
}

/**
 * Extract event details from an event detail page.
 * Uses JSON-LD structured data for location (most reliable), DOM for the rest.
 */
async function extractEventDetails(page) {
  await dismissMeetupPlusPopup(page);
  await page.waitForTimeout(2000);

  // Title — first h1 on the page
  const title = await page.locator('h1').first().textContent().catch(() => null);

  // Date/time — from the time element
  const dateTime = await page.locator('time').first().textContent().catch(() => null);

  // Extract JSON-LD structured data — contains location, dates, description, etc.
  // There are multiple JSON-LD blocks; we need the one with an Event type
  let jsonLdEvent = null;
  try {
    const scripts = await page.locator('script[type="application/ld+json"]').all();
    for (const script of scripts) {
      const text = await script.textContent().catch(() => null);
      if (!text) continue;
      try {
        const data = JSON.parse(text);
        if (data['@type'] && data['@type'].includes('Event')) {
          jsonLdEvent = data;
          break;
        }
      } catch { continue; }
    }
  } catch { /* no JSON-LD */ }

  // Location from JSON-LD
  let location = null;
  if (jsonLdEvent?.location) {
    const venue = jsonLdEvent.location.name || '';
    const addr = jsonLdEvent.location.address?.streetAddress || '';
    location = [venue, addr].filter(Boolean).join(' — ');
  }

  // Use JSON-LD startDate if available (ISO format, much better for DB)
  let parsedDateTime = dateTime?.trim() || null;
  if (jsonLdEvent?.startDate) {
    parsedDateTime = jsonLdEvent.startDate;
  }

  // Description — prefer JSON-LD (cleaner), fall back to DOM
  let description = jsonLdEvent?.description || null;
  if (!description) {
    description = await page.locator('[data-testid="event-description"], .break-words').first().textContent().catch(() => null);
  }

  // Attendee count — the badge span right after the <h2>Attendees</h2>
  // HTML structure: <h2>Attendees</h2> ... <span class="truncate px-ds2-2">14</span>
  let rsvpCount = 0;
  try {
    const attendeeHeading = page.getByRole('heading', { name: 'Attendees' });
    await attendeeHeading.waitFor({ timeout: 5000 });
    // The count badge is a sibling span in the parent container
    const badgeText = await attendeeHeading.locator('xpath=../..').locator('span.truncate').first().textContent().catch(() => null);
    if (badgeText) {
      const num = parseInt(badgeText.trim(), 10);
      if (!isNaN(num)) rsvpCount = num;
    }
  } catch {
    // Attendees section not found
  }

  return {
    title: title?.trim() || null,
    date_time: parsedDateTime,
    location,
    description: description?.trim() || null,
    rsvp_count: rsvpCount,
  };
}

/**
 * Extract attendees from the "See all" attendees modal/page.
 * Call this after clicking "See all" on the event detail page.
 * Scrolls to load all lazy-loaded attendees.
 */
async function extractAttendees(page) {
  await dismissMeetupPlusPopup(page);

  const ATTENDEE_SELECTOR = 'img[aria-label^="Photo of the user"]';
  const attendees = [];
  const seen = new Set();

  // The attendees page may have toggle buttons for "Going", "Waitlist", "Not going"
  // These only appear if there are waitlisted or declined members.
  // If no buttons, it's just showing the "going" list.

  // Tab data-event-label values differ between upcoming and past events:
  //   Upcoming: "attendee-going", "attendee-waitlist", "attendee-not-going"
  //   Past:     "attendee-attendees", "attendee-checked-in", "attendee-not-checked-in",
  //             "attendee-absent", "attendee-waitlist", "attendee-not-going"
  const goingLabels = ['attendee-going', 'attendee-attendees'];
  const waitlistLabels = ['attendee-waitlist'];
  const notGoingLabels = ['attendee-not-going'];

  const tabs = [
    { status: 'going', dataLabels: goingLabels },
    { status: 'waitlist', dataLabels: waitlistLabels },
    { status: 'not_going', dataLabels: notGoingLabels },
  ];

  const tabContainer = page.locator('[data-testid="attendees-tab-container"]');
  const hasTabs = await tabContainer.count() > 0;

  if (hasTabs) {
    for (const tab of tabs) {
      let clicked = false;
      for (const label of tab.dataLabels) {
        try {
          const btn = page.locator(`button[data-event-label="${label}"]`);
          if (await btn.count() === 0) continue;

          // Check if this tab is already selected (aria-pressed="true")
          const isPressed = await btn.getAttribute('aria-pressed');
          if (isPressed === 'true') {
            // Already showing this list — just scrape it
            clicked = true;
            break;
          }

          await btn.click();
          await page.waitForTimeout(2000);
          await dismissMeetupPlusPopup(page);
          clicked = true;
          break;
        } catch { continue; }
      }

      if (!clicked) continue;

      const tabSeen = new Set();
      await scrollToLoadAll(page, ATTENDEE_SELECTOR);
      await scrapeVisibleAttendees(page, ATTENDEE_SELECTOR, tab.status, attendees, tabSeen);
    }
  } else {
    // No tabs — just scrape the default list (all going)
    await scrollToLoadAll(page, ATTENDEE_SELECTOR);
    await scrapeVisibleAttendees(page, ATTENDEE_SELECTOR, 'going', attendees, seen);
  }

  return attendees;
}

/**
 * Scrape all visible attendees on the page, including guest counts.
 * Each attendee's <img> is inside a container that may have a "N guest(s)" badge.
 */
async function scrapeVisibleAttendees(page, selector, status, attendees, seen) {
  const memberImages = await page.locator(selector).all();

  for (const img of memberImages) {
    try {
      const label = await img.getAttribute('aria-label');
      const name = label?.replace('Photo of the user ', '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);

      // Check for guest badge — walk up to the attendee's row container
      // and look for a span containing "guest"
      let guests = 0;
      try {
        // Go up several levels to the attendee row, then find the guest badge
        const row = img.locator('xpath=ancestor::div[contains(@class, "flex")][position() >= 4]').last();
        const guestBadge = row.locator('span.truncate:has-text("guest")');
        if (await guestBadge.count() > 0) {
          const guestText = await guestBadge.first().textContent();
          const match = guestText.match(/(\d+)\s*guest/);
          if (match) guests = parseInt(match[1], 10);
        }
      } catch { /* no guest badge */ }

      attendees.push({ member_name: name, rsvp_status: status, guests });
    } catch { continue; }
  }
}

/**
 * Helper: scroll to bottom repeatedly to load all lazy-loaded items.
 */
async function scrollToLoadAll(page, selector) {
  let previousCount = 0;
  for (let i = 0; i < 20; i++) {
    const currentCount = await page.locator(selector).count();
    if (currentCount === previousCount && i > 0) break;
    previousCount = currentCount;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
  }
}

/**
 * Extract comments from the event detail page.
 * Clicks "More comments" to load all, then extracts top-level comments and replies.
 *
 * Comment DOM structure:
 *   div.flex.flex-col.gap-ds2-24 (comment wrapper, has absolute div for vertical line)
 *     div.flex.gap-ds2-12 (comment content)
 *       a[data-testid="avatar-link-wrapper"] (avatar)
 *       div.flex.flex-1.flex-col (body)
 *         a (author name)
 *         p.ds2-r14 (timestamp)
 *         p.mb-ds2-10 (content text)
 *         [data-testid="likeButton"] (like button with text "Like" or "Like · N")
 *         [data-testid="replyButton"] (reply button)
 *     div.pl-ds2-60 (replies container)
 *       div.flex.flex-col.gap-ds2-24 (reply wrapper)
 *         ... same structure as top-level comment
 *
 * Returns flat array of { author_name, content, posted_at, likes, is_reply, parent_index }
 */
async function extractComments(page) {
  await dismissMeetupPlusPopup(page);

  // Scroll to the comments section to trigger lazy load
  const commentBox = page.getByRole('textbox', { name: 'Leave a comment...' });
  try {
    await commentBox.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
  } catch {
    // Comment section might not exist
  }

  // Click "More comments" button until it disappears to load all comments
  for (let i = 0; i < 50; i++) {
    const moreBtn = page.locator('[data-testid="showMoreCommentsButton"]');
    if (await moreBtn.count() === 0) break;
    try {
      await moreBtn.click();
      await page.waitForTimeout(1500);
      await dismissMeetupPlusPopup(page);
    } catch {
      break;
    }
  }

  // Scroll down to ensure all comments are rendered
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await dismissMeetupPlusPopup(page);
  }

  /**
   * Extract a single comment's data from a comment block element.
   */
  async function parseComment(block) {
    try {
      const contentDiv = block.locator(':scope > div.flex.gap-ds2-12').first();
      const bodyDiv = contentDiv.locator('div.flex.flex-1.flex-col').first();

      const authorLink = bodyDiv.locator('a').first();
      const author = await authorLink.textContent().catch(() => null);

      const time = await bodyDiv.locator('p.ds2-r14').first().textContent().catch(() => null);
      const content = await bodyDiv.locator('p.mb-ds2-10').first().textContent().catch(() => null);

      // Extract like count from the like button text ("Like" = 0, "Like · 3" = 3)
      let likes = 0;
      try {
        const likeBtn = bodyDiv.locator('[data-testid="likeButton"]').first();
        if (await likeBtn.count() > 0) {
          const likeText = await likeBtn.textContent();
          const likeMatch = likeText.match(/Like\s*·\s*(\d+)/);
          if (likeMatch) likes = parseInt(likeMatch[1], 10);
        }
      } catch { /* no like button */ }

      if (author && content) {
        return {
          author_name: author.trim(),
          content: content.trim(),
          posted_at: time?.trim() || null,
          likes,
        };
      }
    } catch { /* skip */ }
    return null;
  }

  const comments = [];

  // Find top-level comment wrappers: div.flex.flex-col.gap-ds2-24 that are NOT inside a .pl-ds2-60 container
  // Top-level comments are direct children of the comments section, not nested inside reply containers
  const topLevelWrappers = await page.locator('div.flex.flex-col.gap-ds2-24:not(.pl-ds2-60 div.flex.flex-col.gap-ds2-24)').all();

  let topLevelIndex = 0;
  for (const wrapper of topLevelWrappers) {
    const parsed = await parseComment(wrapper);
    if (!parsed) continue;

    const currentIndex = topLevelIndex;
    topLevelIndex++;

    comments.push({
      ...parsed,
      is_reply: false,
      parent_index: null,
    });

    // Check for replies inside this wrapper's .pl-ds2-60 container
    const repliesContainer = wrapper.locator(':scope > div.pl-ds2-60');
    if (await repliesContainer.count() > 0) {
      const replyWrappers = await repliesContainer.locator('div.flex.flex-col.gap-ds2-24').all();
      for (const replyWrapper of replyWrappers) {
        const replyParsed = await parseComment(replyWrapper);
        if (!replyParsed) continue;

        comments.push({
          ...replyParsed,
          is_reply: true,
          parent_index: currentIndex,
        });
      }
    }
  }

  return comments;
}

module.exports = {
  dismissMeetupPlusPopup,
  waitForEventsPage,
  getEventLinks,
  extractEventDetails,
  extractAttendees,
  extractComments,
};
