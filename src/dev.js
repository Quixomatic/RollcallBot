/**
 * Local dry run: the real poller, Meetup backend and dashboard, but with a
 * stand-in Discord client that records posts instead of sending them, and a
 * separate database. Nothing reaches your Discord server, and the bot's real
 * data/rollcall.db is never touched.
 *
 *   pnpm run dev                       # API + dashboard on http://localhost:3000
 *   pnpm --dir dashboard dev           # optional: hot-reloading UI on :5173
 *
 * Env (all optional): DASHBOARD_PASSWORD (default "rollcall"), DEV_GROUP_URL,
 * ROLLCALL_DB_PATH (default data/dev.db), MEETUP_BACKEND, MEETUP_STATE_FILE,
 * DEV_ALLOW_MEETUP_WRITES=1 (let the dashboard post/delete real Meetup comments).
 * Meetup reads are real; Meetup writes are blocked unless that is set.
 * Uses the Meetup session in data/browser-state/state.json like the bot does.
 */

const path = require('path');
require('dotenv').config();
process.env.ROLLCALL_DB_PATH = process.env.ROLLCALL_DB_PATH || path.join(__dirname, '..', 'data', 'dev.db');
process.env.DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'rollcall';
require('./services/log-buffer').install();

const { queries } = require('./database');
const { startDashboard } = require('./dashboard/server');
const { startPolling } = require('./services/poller');
const { createFakeClient } = require('./dev/fake-discord');

const GUILD_ID = 'dev-guild';
const GROUP_URL = process.env.DEV_GROUP_URL || 'https://www.meetup.com/reston-pickup-soccer-rps/';
const outbox = [];

async function main() {
  console.log('[dev] Dry run — Discord posts are recorded, not sent');
  console.log(`[dev] Database: ${process.env.ROLLCALL_DB_PATH}`);

  if (!queries.getGuildSettings().get(GUILD_ID)) {
    console.log(`[dev] Seeding dev guild for ${GROUP_URL}`);
    queries.setMeetupGroupUrl().run(GUILD_ID, GROUP_URL);
    queries.setMeetupCredentials().run(GUILD_ID, 'dry-run@example.com', 'unused');
    queries.setEventsChannel().run(GUILD_ID, '100');
    queries.setRsvpChannel().run(GUILD_ID, '101');
    queries.setCommentsChannel().run(GUILD_ID, '102');
    queries.setRemindersChannel().run(GUILD_ID, '103');
    queries.setBotMeetupName().run(GUILD_ID, 'Eventer');
    queries.setAlertsChannel().run(GUILD_ID, '104');
  }

  // Dev databases seeded before alerts existed get the fake #alerts channel too.
  if (!queries.getGuildSettings().get(GUILD_ID).alerts_channel_id) queries.setAlertsChannel().run(GUILD_ID, '104');

  const client = createFakeClient({ guildId: GUILD_ID, outbox });
  startDashboard(client, { outbox });
  console.log(`[dev] Dashboard password: ${process.env.DASHBOARD_PASSWORD}`);
  await startPolling(client);
}

main().catch((err) => {
  console.error('[dev] Fatal:', err);
  process.exit(1);
});
