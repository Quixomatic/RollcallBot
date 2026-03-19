/**
 * Remote login helper for Docker environments.
 *
 * Launches a headed Chromium browser inside a virtual display and exposes it
 * via noVNC so you can access it from your browser at http://<NAS-IP>:6080
 *
 * Usage:
 *   docker exec -it rollcall node src/login-server.js <email> <password>
 *
 * Then open http://<NAS-IP>:6080 in your browser.
 * Solve the CAPTCHA, then press Enter in the terminal to save the session.
 */

require('dotenv').config();
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

chromium.use(StealthPlugin());

const BROWSER_STATE_DIR = path.join(__dirname, '..', 'data', 'browser-state');
const [,, email, password] = process.argv;
const VNC_PORT = 5900;
const NOVNC_PORT = parseInt(process.env.NOVNC_PORT, 10) || 6080;
const DISPLAY = ':99';

async function run() {
  if (!email || !password) {
    console.log('Usage: node src/login-server.js <email> <password>');
    console.log('');
    console.log('Then open http://<your-host>:6080 in your browser.');
    process.exit(1);
  }

  if (!fs.existsSync(BROWSER_STATE_DIR)) {
    fs.mkdirSync(BROWSER_STATE_DIR, { recursive: true });
  }

  // Start Xvfb (virtual display)
  console.log('Starting virtual display...');
  const xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', '1280x720x24'], { stdio: 'ignore' });
  process.env.DISPLAY = DISPLAY;

  // Wait for Xvfb to start
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Start x11vnc
  console.log('Starting VNC server...');
  const vnc = spawn('x11vnc', ['-display', DISPLAY, '-nopw', '-forever', '-shared', '-rfbport', String(VNC_PORT)], { stdio: 'ignore' });

  // Start noVNC websocket proxy
  console.log(`Starting noVNC on port ${NOVNC_PORT}...`);
  const novnc = spawn('websockify', [
    '--web', '/usr/share/novnc',
    String(NOVNC_PORT),
    `localhost:${VNC_PORT}`,
  ], { stdio: 'ignore' });

  // Wait for services to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Launch browser in headed mode on the virtual display
  console.log('Launching Chromium...');
  const stateFile = path.join(BROWSER_STATE_DIR, 'state.json');
  const contextOptions = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
  };

  if (fs.existsSync(stateFile)) {
    contextOptions.storageState = stateFile;
    console.log('Restoring previous session...');
  }

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--start-maximized',
    ],
  });

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
  console.log('============================================');
  console.log(`  Open http://<your-NAS-IP>:${NOVNC_PORT}`);
  console.log('  in your browser to see the login page.');
  console.log('');
  console.log('  Solve the CAPTCHA if prompted.');
  console.log('  Then press ENTER here to save the session.');
  console.log('============================================');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question('Press ENTER to save session and exit...', resolve));
  rl.close();

  // Save session
  await context.storageState({ path: stateFile });
  console.log('Session saved!');

  // Cleanup
  await browser.close();
  novnc.kill();
  vnc.kill();
  xvfb.kill();
  console.log('Done. Restart the bot to use the new session.');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
