const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'rollcall.db');

let db;

function getDb() {
  if (!db) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initialize();
  }
  return db;
}

function initialize() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      meetup_group_url TEXT,
      events_channel_id TEXT,
      rsvp_channel_id TEXT,
      comments_channel_id TEXT,
      reminders_channel_id TEXT,
      poll_interval_minutes INTEGER DEFAULT 10,
      event_horizon_days INTEGER DEFAULT 30,
      reminder_day_before INTEGER DEFAULT 1,
      reminder_hours_before TEXT DEFAULT '2',
      bot_meetup_name TEXT,
      rsvp_edit_threshold_minutes INTEGER DEFAULT 15,
      enabled INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meetup_credentials (
      guild_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      title TEXT,
      url TEXT,
      date_time TEXT,
      location TEXT,
      description TEXT,
      rsvp_count INTEGER DEFAULT 0,
      waitlist_count INTEGER DEFAULT 0,
      is_cancelled INTEGER DEFAULT 0,
      first_seen_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (event_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS rsvps (
      event_id TEXT NOT NULL,
      member_name TEXT NOT NULL,
      member_url TEXT,
      rsvp_status TEXT,
      guests INTEGER DEFAULT 0,
      first_seen_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (event_id, member_name)
    );

    CREATE TABLE IF NOT EXISTS comments (
      comment_id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      author_name TEXT,
      content TEXT,
      posted_at TEXT,
      first_seen_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rsvp_messages (
      event_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (event_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS scrape_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      scrape_type TEXT,
      status TEXT,
      error_message TEXT,
      duration_ms INTEGER,
      scraped_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sent_reminders (
      event_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      reminder_type TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (event_id, guild_id, reminder_type)
    );
  `);

  // Migrations for existing databases
  const guildCols = db.pragma('table_info(guild_settings)').map((c) => c.name);
  if (!guildCols.includes('rsvp_edit_threshold_minutes')) {
    db.exec('ALTER TABLE guild_settings ADD COLUMN rsvp_edit_threshold_minutes INTEGER DEFAULT 15');
  }
}

const queries = {
  // Guild settings
  getGuildSettings: () => getDb().prepare(
    'SELECT * FROM guild_settings WHERE guild_id = ?'
  ),
  upsertGuildSettings: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id) VALUES (?)
    ON CONFLICT (guild_id) DO UPDATE SET updated_at = datetime('now')
  `),
  setMeetupGroupUrl: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id, meetup_group_url) VALUES (?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      meetup_group_url = excluded.meetup_group_url,
      updated_at = datetime('now')
  `),
  setEventsChannel: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id, events_channel_id) VALUES (?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      events_channel_id = excluded.events_channel_id,
      updated_at = datetime('now')
  `),
  setRsvpChannel: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id, rsvp_channel_id) VALUES (?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      rsvp_channel_id = excluded.rsvp_channel_id,
      updated_at = datetime('now')
  `),
  setCommentsChannel: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id, comments_channel_id) VALUES (?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      comments_channel_id = excluded.comments_channel_id,
      updated_at = datetime('now')
  `),
  setRemindersChannel: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id, reminders_channel_id) VALUES (?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      reminders_channel_id = excluded.reminders_channel_id,
      updated_at = datetime('now')
  `),
  setPollInterval: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id, poll_interval_minutes) VALUES (?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      poll_interval_minutes = excluded.poll_interval_minutes,
      updated_at = datetime('now')
  `),
  setEventHorizon: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id, event_horizon_days) VALUES (?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      event_horizon_days = excluded.event_horizon_days,
      updated_at = datetime('now')
  `),
  setReminderDayBefore: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id, reminder_day_before) VALUES (?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      reminder_day_before = excluded.reminder_day_before,
      updated_at = datetime('now')
  `),
  setReminderHoursBefore: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id, reminder_hours_before) VALUES (?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      reminder_hours_before = excluded.reminder_hours_before,
      updated_at = datetime('now')
  `),
  setRsvpEditThreshold: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id, rsvp_edit_threshold_minutes) VALUES (?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      rsvp_edit_threshold_minutes = excluded.rsvp_edit_threshold_minutes,
      updated_at = datetime('now')
  `),
  setEnabled: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id, enabled) VALUES (?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = datetime('now')
  `),
  setBotMeetupName: () => getDb().prepare(`
    INSERT INTO guild_settings (guild_id, bot_meetup_name) VALUES (?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      bot_meetup_name = excluded.bot_meetup_name,
      updated_at = datetime('now')
  `),
  getAllGuildSettings: () => getDb().prepare(
    'SELECT * FROM guild_settings'
  ),

  // Meetup credentials
  getMeetupCredentials: () => getDb().prepare(
    'SELECT * FROM meetup_credentials WHERE guild_id = ?'
  ),
  setMeetupCredentials: () => getDb().prepare(`
    INSERT INTO meetup_credentials (guild_id, email, password) VALUES (?, ?, ?)
    ON CONFLICT (guild_id) DO UPDATE SET
      email = excluded.email,
      password = excluded.password,
      updated_at = datetime('now')
  `),

  // Events
  getEvent: () => getDb().prepare(
    'SELECT * FROM events WHERE event_id = ?'
  ),
  getEventsForGuild: () => getDb().prepare(
    'SELECT * FROM events WHERE guild_id = ? AND is_cancelled = 0 ORDER BY date_time ASC'
  ),
  getUpcomingEventsForGuild: () => getDb().prepare(`
    SELECT * FROM events
    WHERE guild_id = ? AND is_cancelled = 0 AND date_time > datetime('now', '-3 hours')
    ORDER BY date_time ASC
  `),
  upsertEvent: () => getDb().prepare(`
    INSERT INTO events (event_id, guild_id, title, url, date_time, location, description, rsvp_count, waitlist_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (event_id, guild_id) DO UPDATE SET
      title = excluded.title,
      url = excluded.url,
      date_time = excluded.date_time,
      location = excluded.location,
      description = excluded.description,
      rsvp_count = excluded.rsvp_count,
      waitlist_count = excluded.waitlist_count,
      updated_at = datetime('now')
  `),
  cancelEvent: () => getDb().prepare(`
    UPDATE events SET is_cancelled = 1, updated_at = datetime('now') WHERE event_id = ?
  `),
  deleteOldEvents: () => getDb().prepare(`
    DELETE FROM events WHERE date_time < datetime('now', '-7 days')
  `),

  // RSVPs
  getRsvpsForEvent: () => getDb().prepare(
    'SELECT * FROM rsvps WHERE event_id = ? ORDER BY rsvp_status, member_name'
  ),
  upsertRsvp: () => getDb().prepare(`
    INSERT INTO rsvps (event_id, member_name, member_url, rsvp_status, guests)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (event_id, member_name) DO UPDATE SET
      member_url = excluded.member_url,
      rsvp_status = excluded.rsvp_status,
      guests = excluded.guests,
      updated_at = datetime('now')
  `),
  deleteRsvp: () => getDb().prepare(
    'DELETE FROM rsvps WHERE event_id = ? AND member_name = ?'
  ),
  deleteRsvpsForEvent: () => getDb().prepare(
    'DELETE FROM rsvps WHERE event_id = ?'
  ),

  // Comments
  getCommentsForEvent: () => getDb().prepare(
    'SELECT * FROM comments WHERE event_id = ? ORDER BY posted_at ASC'
  ),
  insertComment: () => getDb().prepare(`
    INSERT OR IGNORE INTO comments (comment_id, event_id, author_name, content, posted_at)
    VALUES (?, ?, ?, ?, ?)
  `),

  // RSVP messages (for delete-and-repost)
  getRsvpMessage: () => getDb().prepare(
    'SELECT * FROM rsvp_messages WHERE event_id = ? AND guild_id = ?'
  ),
  upsertRsvpMessage: () => getDb().prepare(`
    INSERT INTO rsvp_messages (event_id, channel_id, message_id, guild_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (event_id, guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      message_id = excluded.message_id,
      updated_at = datetime('now')
  `),

  // Scrape log
  insertScrapeLog: () => getDb().prepare(`
    INSERT INTO scrape_log (guild_id, scrape_type, status, error_message, duration_ms)
    VALUES (?, ?, ?, ?, ?)
  `),
  getLastScrape: () => getDb().prepare(`
    SELECT * FROM scrape_log WHERE guild_id = ? ORDER BY scraped_at DESC LIMIT 1
  `),
  getRecentScrapes: () => getDb().prepare(`
    SELECT * FROM scrape_log WHERE guild_id = ? ORDER BY scraped_at DESC LIMIT 10
  `),

  // Sent reminders
  hasReminderBeenSent: () => getDb().prepare(
    'SELECT 1 FROM sent_reminders WHERE event_id = ? AND guild_id = ? AND reminder_type = ?'
  ),
  markReminderSent: () => getDb().prepare(`
    INSERT OR IGNORE INTO sent_reminders (event_id, guild_id, reminder_type) VALUES (?, ?, ?)
  `),
};

module.exports = { getDb, queries };
