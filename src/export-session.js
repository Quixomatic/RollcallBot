/**
 * Export a Playwright storageState file from a real, human-driven Chrome window.
 *
 * The Meetup auth cookies (MEETUP_SESSION, __meetup_auth_access_token,
 * __meetup_auth_refresh_token) are httpOnly, so they are invisible to
 * document.cookie and cannot be scraped from the browser console. This connects
 * over the DevTools protocol instead, which does expose them.
 *
 * Usage:
 *   1. Close Chrome, or just run this as-is (it uses a separate profile dir, so
 *      your normal Chrome can stay open):
 *
 *        chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\meetup-login
 *
 *   2. Log in to https://www.meetup.com in that window. Solve the CAPTCHA.
 *   3. node src/export-session.js [outputPath]
 *
 * Writes data/browser-state/state.json by default — the same file
 * the bot (both backends) reads.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';
const OUT_PATH = process.argv[2] || path.join(__dirname, '..', 'data', 'browser-state', 'state.json');

// Cookies that must be present for the saved session to actually authenticate.
const REQUIRED = ['MEETUP_SESSION', '__meetup_auth_access_token', '__meetup_auth_refresh_token'];

/**
 * Exit without touching the browser.
 *
 * Do NOT call browser.close() here — on a connectOverCDP connection that closes
 * the real Chrome window, not just the connection, killing the session the user
 * just logged in to. Exiting drops the CDP socket and leaves Chrome running.
 */
function detach(code) {
  process.exit(code);
}

async function run() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (err) {
    console.error(`Could not connect to Chrome at ${CDP_URL}`);
    console.error('');
    console.error('Start Chrome with remote debugging first:');
    console.error('  chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\meetup-login');
    console.error('');
    console.error(`(${err.message})`);
    process.exit(1);
  }

  const contexts = browser.contexts();
  if (!contexts.length) {
    console.error('Chrome is running but has no browser context. Open a tab and retry.');
    process.exit(1);
  }

  // Prefer whichever context already has a meetup.com tab open; localStorage is
  // only captured for origins that have a live page.
  let context = contexts.find((c) => c.pages().some((p) => p.url().includes('meetup.com'))) || contexts[0];

  let page = context.pages().find((p) => p.url().includes('meetup.com'));
  if (!page) {
    console.log('No meetup.com tab found — opening one to capture localStorage...');
    page = await context.newPage();
    await page.goto('https://www.meetup.com/home/', { waitUntil: 'domcontentloaded' });
  }

  // Confirm we are actually logged in before writing anything.
  await page.goto('https://www.meetup.com/home/', { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/login')) {
    console.error('That Chrome window is NOT logged in to Meetup (redirected to /login).');
    console.error('Log in in that window first, then re-run this script.');
    detach(1);
  }

  const dir = path.dirname(OUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const state = await context.storageState();

  // Over a CDP connection Playwright does not populate `origins`, so collect
  // localStorage by hand from every open page and merge it in.
  const byOrigin = new Map();
  for (const p of context.pages()) {
    try {
      const entry = await p.evaluate(() => ({
        origin: location.origin,
        localStorage: Object.keys(localStorage).map((name) => ({ name, value: localStorage.getItem(name) })),
      }));
      if (entry.localStorage.length) byOrigin.set(entry.origin, entry.localStorage);
    } catch {
      // about:blank, devtools pages, cross-origin restrictions — skip
    }
  }
  state.origins = [...byOrigin].map(([origin, localStorage]) => ({ origin, localStorage }));

  fs.writeFileSync(OUT_PATH, JSON.stringify(state, null, 2));

  const names = new Set(state.cookies.map((c) => c.name));
  const missing = REQUIRED.filter((n) => !names.has(n));

  console.log('');
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`  cookies:  ${state.cookies.length} (${state.cookies.filter((c) => c.httpOnly).length} httpOnly)`);
  console.log(`  origins:  ${state.origins.length}`);
  console.log('');

  if (missing.length) {
    console.error(`WARNING: missing auth cookies: ${missing.join(', ')}`);
    console.error('The bot will not authenticate with this file.');
    detach(1);
  }

  console.log('All required auth cookies present. Safe to copy to the NAS:');
  console.log('  /mnt/Main/Main/docker/data/rollcallbot/data/browser-state/state.json');
  console.log('');
  console.log('Your Chrome window is still open — log out or close it when done.');

  detach(0);
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
