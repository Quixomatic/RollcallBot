/**
 * Record all meetup.com network traffic while running the bot's own browser
 * scrape flows (events listing, event page + comments, attendees tabs).
 * Output feeds extract-site-queries.js, which snapshots every GraphQL
 * operation the site uses into docs/meetup-api/site-queries/.
 *
 *   node tools/meetup-capture/capture.js [groupUrl | eventUrl] [maxEvents]
 *
 * Session: MEETUP_STATE_FILE, else data/browser-state/state.json. Use a
 * separate login (export-session.js <path>) rather than the bot's live one.
 * Output: data/capture/<timestamp>/ (meetup.har, requests.json, phases.json).
 * These contain member names and cookies in headers — never commit them.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { chromium } = require('playwright-extra');
chromium.use(require('puppeteer-extra-plugin-stealth')());
const sel = require(path.join(ROOT, 'src', 'utils', 'selectors'));

const STATE = process.env.MEETUP_STATE_FILE || path.join(ROOT, 'data', 'browser-state', 'state.json');
const target = process.argv[2] || 'https://www.meetup.com/reston-pickup-soccer-rps/';
const SINGLE_EVENT = /\/events\/\d+/.test(target) ? target : null;
const GROUP_URL = (SINGLE_EVENT ? target.replace(/\/events\/.*/, '') : target).replace(/\/$/, '');
const MAX_EVENTS = parseInt(process.argv[3] || '2', 10);
const OUT = path.join(ROOT, 'data', 'capture', new Date().toISOString().replace(/[:.]/g, '-'));

fs.mkdirSync(OUT, { recursive: true });
const phases = [];
let phase = 'init';
function setPhase(name) {
  phase = name;
  phases.push({ phase: name, t: Date.now() });
  console.log(`\n=== ${name}`);
}

const log = [];
const STATIC = new Set(['image', 'stylesheet', 'font', 'media']);

async function run() {
  if (!fs.existsSync(STATE)) throw new Error(`No session at ${STATE}`);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: STATE,
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    recordHar: { path: path.join(OUT, 'meetup.har'), content: 'embed' },
  });

  context.on('response', async (res) => {
    const req = res.request();
    if (STATIC.has(req.resourceType())) return;
    const entry = {
      phase,
      t: Date.now(),
      type: req.resourceType(),
      method: req.method(),
      url: req.url(),
      status: res.status(),
      postData: req.postData() || null,
      contentType: res.headers()['content-type'] || '',
    };
    if (/json|graphql/.test(entry.contentType)) entry.body = await res.text().catch(() => null);
    log.push(entry);
  });

  const page = await context.newPage();
  try {
    setPhase('home');
    await page.goto('https://www.meetup.com/home/', { waitUntil: 'domcontentloaded' });
    if (page.url().includes('/login')) throw new Error('Not logged in — the session is invalid');
    await page.waitForTimeout(3000);

    let links = [{ href: SINGLE_EVENT }];
    if (!SINGLE_EVENT) {
      setPhase('events-listing');
      await page.goto(`${GROUP_URL}/events/`, { waitUntil: 'domcontentloaded' });
      await sel.waitForEventsPage(page);
      links = await sel.getEventLinks(page, GROUP_URL.split('/').pop());
      console.log(`found ${links.length} event links`);
    }

    for (const link of links.slice(0, MAX_EVENTS)) {
      const id = link.href.match(/events\/(\d+)/)[1];

      setPhase(`event-detail:${id}`);
      await page.goto(link.href, { waitUntil: 'domcontentloaded' });
      const details = await sel.extractEventDetails(page);
      console.log(details.title, '|', details.date_time);

      setPhase(`event-comments:${id}`);
      console.log(`${(await sel.extractComments(page)).length} comments`);

      setPhase(`event-attendees:${id}`);
      await page.goto(`${link.href.replace(/\/?(\?.*)?$/, '')}/attendees/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      console.log(`${(await sel.extractAttendees(page)).length} attendees`);
    }
    setPhase('done');
  } catch (err) {
    console.error('capture error:', err.message);
  } finally {
    await context.close(); // flushes the HAR
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'requests.json'), JSON.stringify(log, null, 2));
    fs.writeFileSync(path.join(OUT, 'phases.json'), JSON.stringify(phases, null, 2));
    console.log(`\n${log.length} requests → ${OUT}`);
    console.log(`Next: node tools/meetup-capture/extract-site-queries.js "${OUT}"`);
  }
}

run();
