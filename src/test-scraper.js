/**
 * Local test script for developing and tuning Playwright scraper.
 *
 * Usage:
 *   node src/test-scraper.js login <email> <password>
 *   node src/test-scraper.js events <meetup-group-url>
 *   node src/test-scraper.js rsvps <event-url>
 *   node src/test-scraper.js comments <event-url>
 *   node src/test-scraper.js codegen [url]
 *
 * The "codegen" command launches Playwright's code generator — it records your
 * browser interactions and outputs the selectors/actions as code. Super useful
 * for figuring out how to navigate Meetup pages and what selectors to use.
 *
 * Set HEADLESS=false in .env to see the browser (recommended for debugging).
 */

require('dotenv').config();
process.env.HEADLESS = 'false'; // Always headed for testing

const { login, ensureLoggedIn, closeBrowser } = require('./services/scraper');
const { scrapeEvents } = require('./services/meetup-events');
const { scrapeRsvps } = require('./services/meetup-rsvps');
const { scrapeComments } = require('./services/meetup-comments');

// Initialize database (creates tables if needed)
require('./database');

const [,, command, ...args] = process.argv;

async function run() {
  try {
    switch (command) {
      case 'login': {
        const [email, password] = args;
        if (!email || !password) {
          console.log('Usage: node src/test-scraper.js login <email> <password>');
          process.exit(1);
        }
        await login(email, password);
        console.log('Login successful! Session saved.');
        break;
      }

      case 'events': {
        const [groupUrl] = args;
        if (!groupUrl) {
          console.log('Usage: node src/test-scraper.js events <meetup-group-url>');
          process.exit(1);
        }
        const events = await scrapeEvents(groupUrl, 'test-guild');
        console.log('\n=== Scraped Events ===');
        console.log(JSON.stringify(events, null, 2));
        break;
      }

      case 'rsvps': {
        const [eventUrl] = args;
        if (!eventUrl) {
          console.log('Usage: node src/test-scraper.js rsvps <event-url>');
          process.exit(1);
        }
        const rsvps = await scrapeRsvps(eventUrl);
        console.log('\n=== Scraped RSVPs ===');
        console.log(JSON.stringify(rsvps, null, 2));
        break;
      }

      case 'comments': {
        const [eventUrl] = args;
        if (!eventUrl) {
          console.log('Usage: node src/test-scraper.js comments <event-url>');
          process.exit(1);
        }
        const comments = await scrapeComments(eventUrl);
        console.log('\n=== Scraped Comments ===');
        console.log(JSON.stringify(comments, null, 2));
        break;
      }

      case 'codegen': {
        // Launch Playwright codegen without saved session
        const { execSync } = require('child_process');
        const url = args[0] || 'https://www.meetup.com/';
        console.log(`Launching Playwright codegen at: ${url}`);
        console.log('Record your interactions — the generated code will show selectors and actions.');
        execSync(`npx playwright codegen ${url}`, { stdio: 'inherit' });
        return; // codegen handles its own lifecycle
      }

      case 'codegen-auth': {
        // Launch Playwright codegen with saved session (logged in)
        const { execSync } = require('child_process');
        const stateFile = require('path').join(__dirname, '..', 'data', 'browser-state', 'state.json');
        const url = args[0] || 'https://www.meetup.com/';
        if (!require('fs').existsSync(stateFile)) {
          console.log('No saved session found. Run "login" first.');
          process.exit(1);
        }
        console.log(`Launching Playwright codegen (authenticated) at: ${url}`);
        console.log('The recorder panel on the RIGHT side captures code as you click.');
        console.log('Copy the generated code from that panel before closing.');
        execSync(`npx playwright codegen --load-storage="${stateFile}" ${url}`, { stdio: 'inherit' });
        return;
      }

      case 'debug': {
        // Open a page with saved session, let user interact, then dump HTML on Enter
        const { getPage, saveSession } = require('./services/scraper');
        const readline = require('readline');
        const url = args[0] || 'https://www.meetup.com/';
        console.log(`Opening ${url} in debug mode (logged in)...`);
        const page = await getPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        console.log(`\nPage title: ${await page.title()}`);
        console.log(`Page URL: ${page.url()}`);
        console.log('\nBrowser is open — interact with the page as needed.');
        console.log('Press ENTER to save the current HTML, or Ctrl+C to close.');

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise((resolve) => rl.question('', resolve));
        rl.close();

        const html = await page.content();
        const fs = require('fs');
        const outPath = require('path').join(__dirname, '..', 'data', 'debug-page.html');
        fs.writeFileSync(outPath, html);
        console.log(`Page HTML saved to: ${outPath}`);
        await saveSession();
        console.log('Press Ctrl+C to close, or press ENTER to save again.');
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise(() => {}); // keep alive
      }

      case 'post-rsvps': {
        // Scrape RSVPs from an event and post the embed to Discord (for testing formatting)
        const [eventUrl] = args;
        if (!eventUrl) {
          console.log('Usage: node src/test-scraper.js post-rsvps <event-url>');
          process.exit(1);
        }
        const { Client, GatewayIntentBits } = require('discord.js');
        const { queries } = require('./database');
        const { scrapeRsvps: scrapeRsvpsFn, detectRsvpChanges } = require('./services/meetup-rsvps');
        const { extractEventDetails, dismissMeetupPlusPopup } = require('./utils/selectors');
        const notifier = require('./services/notifier');
        const { getPage, saveSession: saveSess } = require('./services/scraper');

        // Get event details
        console.log('Scraping event details...');
        const detailPage = await getPage();
        await detailPage.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await dismissMeetupPlusPopup(detailPage);
        const details = await extractEventDetails(detailPage);
        await detailPage.close();

        // Get RSVPs
        console.log('Scraping RSVPs...');
        let rsvps = await scrapeRsvpsFn(eventUrl);

        // Filter bot account
        const allSettings = queries.getAllGuildSettings().all();
        const settings = allSettings[0];
        if (settings?.bot_meetup_name) {
          rsvps = rsvps.filter((r) => r.member_name !== settings.bot_meetup_name);
        }

        const eventId = eventUrl.match(/events\/(\d+)/)?.[1] || 'test';

        // Clear existing RSVPs for this event so they show as "added"
        try { queries.deleteRsvpsForEvent().run(eventId); } catch {}

        const rsvpChanges = detectRsvpChanges(eventId, rsvps);
        // First run — show clean summary
        rsvpChanges.added = [];
        rsvpChanges.removed = [];
        rsvpChanges.changed = [];

        const event = {
          event_id: eventId,
          title: details.title || 'Test Event',
          url: eventUrl,
          date_time: details.date_time,
          location: details.location,
        };

        console.log(`Event: ${event.title}`);
        console.log(`RSVPs: ${rsvps.length} total`);
        console.log('Posting to Discord...');

        // Connect to Discord just to post
        const testClient = new Client({ intents: [GatewayIntentBits.Guilds] });
        await testClient.login(process.env.DISCORD_TOKEN);
        await new Promise((resolve) => testClient.once('ready', resolve));

        if (!settings) {
          console.log('No guild configured. Run /config first.');
          testClient.destroy();
          break;
        }

        await notifier.notifyRsvpUpdate(testClient, settings.guild_id, event, rsvpChanges);
        console.log('Posted!');
        testClient.destroy();
        break;
      }

      case 'post-comments': {
        // Scrape comments from an event and post them to Discord (for testing formatting)
        const [eventUrl] = args;
        if (!eventUrl) {
          console.log('Usage: node src/test-scraper.js post-comments <event-url>');
          process.exit(1);
        }
        const { Client: Client2, GatewayIntentBits: GIB2 } = require('discord.js');
        const { queries: q2 } = require('./database');
        const { scrapeComments: scrapeCommentsFn, detectNewComments } = require('./services/meetup-comments');
        const { extractEventDetails: extractDetails2, dismissMeetupPlusPopup: dismissPopup2 } = require('./utils/selectors');
        const notifier2 = require('./services/notifier');
        const { getPage: getPage2 } = require('./services/scraper');

        // Get event details
        console.log('Scraping event details...');
        const dp = await getPage2();
        await dp.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await dismissPopup2(dp);
        const det = await extractDetails2(dp);
        await dp.close();

        // Get comments
        console.log('Scraping comments...');
        const comments = await scrapeCommentsFn(eventUrl);

        const evId = eventUrl.match(/events\/(\d+)/)?.[1] || 'test';
        const newComments = detectNewComments(evId, comments);

        const ev = {
          event_id: evId,
          title: det.title || 'Test Event',
          url: eventUrl,
          date_time: det.date_time,
          location: det.location,
        };

        console.log(`Event: ${ev.title}`);
        console.log(`Comments: ${comments.length} total, ${newComments.length} new`);

        if (newComments.length === 0) {
          console.log('No new comments to post.');
          break;
        }

        console.log('Posting to Discord...');
        const testClient2 = new Client2({ intents: [GIB2.Guilds] });
        await testClient2.login(process.env.DISCORD_TOKEN);
        await new Promise((resolve) => testClient2.once('ready', resolve));

        const allSettings2 = q2.getAllGuildSettings().all();
        const settings2 = allSettings2[0];
        if (!settings2) {
          console.log('No guild configured. Run /config first.');
          testClient2.destroy();
          break;
        }

        const commentsChannel = await testClient2.channels.fetch(settings2.comments_channel_id).catch(() => null);
        if (commentsChannel) {
          await notifier2.notifyNewComments(commentsChannel, ev, newComments, comments);
        } else {
          console.log('No comments channel configured or accessible.');
        }
        console.log('Posted!');
        testClient2.destroy();
        break;
      }

      default:
        console.log('Rollcall Scraper Test Utility');
        console.log('');
        console.log('Commands:');
        console.log('  login <email> <password>    Log in to Meetup and save session');
        console.log('  events <group-url>          Scrape events from a Meetup group');
        console.log('  rsvps <event-url>           Scrape RSVPs for an event');
        console.log('  comments <event-url>        Scrape comments for an event');
        console.log('  post-rsvps <event-url>      Scrape RSVPs and post embed to Discord');
        console.log('  post-comments <event-url>   Scrape comments and post to Discord');
        console.log('  codegen [url]               Launch Playwright recorder');
        console.log('  codegen-auth [url]          Launch recorder with saved session');
        console.log('  debug [url]                 Open page, interact, save HTML');
        console.log('');
        console.log('Example:');
        console.log('  node src/test-scraper.js post-rsvps https://www.meetup.com/your-group/events/12345/');
        break;
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (command !== 'codegen') {
      await closeBrowser();
    }
  }
}

run();
