/**
 * Reset scraped data while preserving guild settings and credentials.
 *
 * Usage:
 *   node src/reset-data.js
 *
 * Clears: events, rsvps, comments, rsvp_messages, scrape_log, sent_reminders
 * Keeps: guild_settings, meetup_credentials
 */

require('dotenv').config();
const { getDb } = require('./database');

const db = getDb();

const tables = ['events', 'rsvps', 'comments', 'rsvp_messages', 'scrape_log', 'sent_reminders'];

for (const table of tables) {
  const count = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;
  db.prepare(`DELETE FROM ${table}`).run();
  console.log(`Cleared ${table} (${count} rows)`);
}

console.log('\nData reset complete. Settings and credentials preserved.');
