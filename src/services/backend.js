/**
 * Meetup data backend selector.
 *
 *   MEETUP_BACKEND=graphql  (default) Meetup's GraphQL API over plain HTTP.
 *   MEETUP_BACKEND=browser  The original Playwright scraper, unchanged.
 *
 * Both return the same shapes and share the same session file and database
 * keys, so switching back and forth is safe: nothing is re-posted and no
 * stored data needs migrating. The browser modules are only loaded when the
 * browser backend is selected.
 */

const NAME = (process.env.MEETUP_BACKEND || 'graphql').trim().toLowerCase();

function graphqlBackend() {
  const api = require('./meetup-api');
  return {
    name: 'graphql',
    // Can look up any single event by ID, so cancellation comes only from
    // Meetup's own status, never from an event missing in the listing.
    canLookupEvents: true,
    ensureLoggedIn: () => api.ensureLoggedIn(),
    getEvents: (groupUrl, guildId, opts) => api.fetchEvents(groupUrl, guildId, opts),
    getEventDetails: (eventUrl) => api.fetchEventDetails(eventUrl),
    getRsvps: (eventUrl) => api.fetchRsvps(eventUrl),
    getComments: (eventUrl) => api.fetchComments(eventUrl),
    postComment: (eventUrl, text, opts) => api.postComment(eventUrl, text, opts),
    deleteComment: (eventUrl, meetupCommentId, opts) => api.deleteComment(eventUrl, meetupCommentId, opts),
    clearSessionDead: () => api.clearSessionDead(),
    // Pick up a state.json that was replaced on disk (dashboard upload).
    reloadSession: async () => api.clearSessionDead(),
    close: async () => {},
  };
}

function browserBackend() {
  const scraper = require('./scraper');
  const { scrapeEvents } = require('./meetup-events');
  const { scrapeRsvps } = require('./meetup-rsvps');
  const { scrapeComments } = require('./meetup-comments');
  const { extractEventDetails, dismissMeetupPlusPopup } = require('../utils/selectors');

  return {
    name: 'browser',
    canLookupEvents: false,
    ensureLoggedIn: (email, password) => scraper.ensureLoggedIn(email, password),
    getEvents: (groupUrl, guildId) => scrapeEvents(groupUrl, guildId),
    getEventDetails: async (eventUrl) => {
      const page = await scraper.getPage();
      try {
        await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await dismissMeetupPlusPopup(page);
        return await extractEventDetails(page);
      } finally {
        await page.close().catch(() => {});
        await scraper.saveSession().catch(() => {});
      }
    },
    getRsvps: (eventUrl) => scrapeRsvps(eventUrl),
    getComments: (eventUrl) => scrapeComments(eventUrl),
    postComment: async () => { throw new Error('Posting comments needs the GraphQL backend (MEETUP_BACKEND=graphql)'); },
    deleteComment: async () => { throw new Error('Deleting comments needs the GraphQL backend (MEETUP_BACKEND=graphql)'); },
    clearSessionDead: () => scraper.clearSessionDead(),
    // The browser context caches cookies and saves them back on close, so
    // discard it WITHOUT saving, then let the next scrape load the new file.
    reloadSession: async () => {
      await scraper.discardContext();
      scraper.clearSessionDead();
    },
    close: () => scraper.closeBrowser(),
  };
}

let backend = null;

function getBackend() {
  if (backend) return backend;
  if (NAME === 'browser') backend = browserBackend();
  else {
    if (NAME !== 'graphql') console.warn(`[backend] Unknown MEETUP_BACKEND "${NAME}", using graphql`);
    backend = graphqlBackend();
  }
  console.log(`[backend] Using ${backend.name} backend for Meetup data`);
  return backend;
}

module.exports = { getBackend };
