/**
 * Remote login helper for Docker environments.
 *
 * Launches Chromium with remote debugging enabled so you can connect
 * from your local machine to solve CAPTCHAs and establish a session.
 *
 * Usage:
 *   node src/login-server.js <email> <password> [port]
 *
 * Then on your local machine, open Chrome and go to:
 *   chrome://inspect/#devices
 *   Click "Configure" and add: <NAS-IP>:<port> (default 9222)
 *   Click "inspect" on the Meetup page to see and interact with it.
 *
 * Once you've solved the CAPTCHA and logged in, press Enter in the
 * terminal to save the session and exit.
 */

require('dotenv').config();
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

chromium.use(StealthPlugin());

const BROWSER_STATE_DIR = path.join(__dirname, '..', 'data', 'browser-state');
const [,, email, password, portArg] = process.argv;
const PORT = parseInt(portArg, 10) || 9222;

async function run() {
  if (!email || !password) {
    console.log('Usage: node src/login-server.js <email> <password> [port]');
    console.log('Default port: 9222');
    process.exit(1);
  }

  if (!fs.existsSync(BROWSER_STATE_DIR)) {
    fs.mkdirSync(BROWSER_STATE_DIR, { recursive: true });
  }

  console.log(`Launching Chromium with remote debugging on port ${PORT}...`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${PORT}`,
      '--remote-debugging-address=0.0.0.0',
    ],
  });

  const stateFile = path.join(BROWSER_STATE_DIR, 'state.json');
  const contextOptions = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
  };

  if (fs.existsSync(stateFile)) {
    contextOptions.storageState = stateFile;
    console.log('Restoring previous session...');
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  console.log('Navigating to Meetup login...');
  await page.goto('https://www.meetup.com/login/', { waitUntil: 'domcontentloaded' });

  // Fill credentials
  try {
    await page.fill('input[type="email"], input#email', email);
    await page.fill('input[type="password"], input#current-password', password);
    await page.click('button[type="submit"]');
    console.log('Credentials submitted.');
  } catch (err) {
    console.log('Could not auto-fill credentials:', err.message);
  }

  console.log('');
  console.log('=== Remote Login Ready ===');
  console.log(`Connect from your local Chrome: chrome://inspect/#devices`);
  console.log(`Add target: <your-NAS-IP>:${PORT}`);
  console.log('');
  console.log('Solve the CAPTCHA in the remote browser if prompted.');
  console.log('Once logged in, press ENTER here to save the session.');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question('Press ENTER to save session and exit...', resolve));
  rl.close();

  // Save session
  await context.storageState({ path: stateFile });
  console.log('Session saved to', stateFile);

  await browser.close();
  console.log('Done. The bot will use this session on next start.');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
