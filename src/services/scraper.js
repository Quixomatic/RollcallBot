const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

chromium.use(StealthPlugin());

const BROWSER_STATE_DIR = path.join(__dirname, '..', '..', 'data', 'browser-state');
const HEADLESS = process.env.HEADLESS !== 'false';

let browser = null;
let context = null;

async function ensureBrowserStateDir() {
  if (!fs.existsSync(BROWSER_STATE_DIR)) {
    fs.mkdirSync(BROWSER_STATE_DIR, { recursive: true });
  }
}

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;

  await ensureBrowserStateDir();

  browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  return browser;
}

async function getContext() {
  if (context) return context;

  const b = await getBrowser();
  const stateFile = path.join(BROWSER_STATE_DIR, 'state.json');

  const contextOptions = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
  };

  if (fs.existsSync(stateFile)) {
    contextOptions.storageState = stateFile;
    console.log('[scraper] Restoring browser session from saved state');
  }

  context = await b.newContext(contextOptions);
  return context;
}

async function saveSession() {
  if (!context) return;
  await ensureBrowserStateDir();
  const stateFile = path.join(BROWSER_STATE_DIR, 'state.json');
  await context.storageState({ path: stateFile });
  console.log('[scraper] Browser session saved');
}

async function login(email, password) {
  const ctx = await getContext();
  const page = await ctx.newPage();

  try {
    console.log('[scraper] Logging in to Meetup...');
    await page.goto('https://www.meetup.com/login/', { waitUntil: 'domcontentloaded' });

    // Fill in credentials
    await page.fill('input[type="email"], input#email', email);
    await page.fill('input[type="password"], input#current-password', password);

    // Submit
    await page.click('button[type="submit"]');

    // Wait for either successful redirect or CAPTCHA
    // Give the user up to 2 minutes to solve a CAPTCHA if one appears
    console.log('[scraper] Waiting for login to complete (solve CAPTCHA if prompted)...');
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 120000 });

    // Wait for navigation to settle
    await page.waitForLoadState('networkidle').catch(() => {});

    console.log('[scraper] Login successful');
    await saveSession();
  } finally {
    await page.close().catch(() => {});
  }
}

async function isLoggedIn() {
  const ctx = await getContext();
  const page = await ctx.newPage();

  try {
    await page.goto('https://www.meetup.com/home/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const isLogin = page.url().includes('/login');
    return !isLogin;
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

async function ensureLoggedIn(email, password) {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    console.log('[scraper] Session expired or not logged in, re-authenticating...');
    await login(email, password);
  }
}

async function getPage() {
  const ctx = await getContext();
  return ctx.newPage();
}

async function closeBrowser() {
  if (context) {
    await saveSession().catch(() => {});
    await context.close().catch(() => {});
    context = null;
  }
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
  console.log('[scraper] Browser closed');
}

module.exports = {
  getBrowser,
  getContext,
  getPage,
  login,
  isLoggedIn,
  ensureLoggedIn,
  saveSession,
  closeBrowser,
};
