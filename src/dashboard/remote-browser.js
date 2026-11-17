/**
 * Remote login: a real Chrome running next to the bot, shown in the dashboard.
 *
 * Why this gets past Meetup's hCaptcha where Playwright/noVNC didn't:
 *   - Chrome is started as a plain process (no --enable-automation, no
 *     Playwright launch flags, no navigator.webdriver) with a fresh profile,
 *     exactly like the real-Chrome logins that work on a desktop.
 *   - We talk to it over the DevTools protocol using only screencast and input
 *     commands (Page.startScreencast, Input.*). Runtime.enable, the usual
 *     tell-tale of an automated browser, is never called.
 *   - Cookies are read once the user is done (Storage.getCookies), then the
 *     session is verified against Meetup and installed like an upload.
 *
 * Chrome only exists while a login is in progress: started from the dashboard,
 * stopped after saving, on Stop, or after 15 idle minutes. On Linux without a
 * display it runs under its own Xvfb. The debugging port listens on 127.0.0.1.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const WebSocket = require('ws');

const LOGIN_URL = 'https://www.meetup.com/login/';
const WIDTH = 1280;
const HEIGHT = 900;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/opt/google/chrome/chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return { path: c, kind: 'chrome' };
  // Fallback: Playwright's bundled Chromium binary, still launched as a plain process.
  try {
    const p = require('playwright').chromium.executablePath();
    if (p && fs.existsSync(p)) return { path: p, kind: 'chromium' };
  } catch { /* playwright not installed */ }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal DevTools protocol connection to one target. */
class Cdp extends EventEmitter {
  constructor(url) {
    super();
    this.nextId = 1;
    this.pending = new Map();
    this.ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
    this.ready = new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        this.emit(msg.method, msg.params);
      }
    });
    this.ws.on('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('DevTools connection closed'));
      this.pending.clear();
      this.emit('close');
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }), (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  close() {
    try { this.ws.close(); } catch { /* already closed */ }
  }
}

class RemoteBrowser extends EventEmitter {
  constructor() {
    super();
    this.state = 'idle'; // idle | starting | running | stopping
    this.reset();
  }

  reset() {
    this.chrome = null;
    this.xvfb = null;
    this.page = null;
    this.port = null;
    this.profileDir = null;
    this.startedAt = null;
    this.url = null;
    this.lastFrame = null;
    this.lastActivity = 0;
    this.error = null;
    clearInterval(this.idleTimer);
    this.idleTimer = null;
  }

  status() {
    const chrome = findChrome();
    return {
      state: this.state,
      available: !!chrome,
      browser: chrome?.kind || null,
      startedAt: this.startedAt,
      url: this.url,
      error: this.error,
      width: this.lastFrame?.width || WIDTH,
      height: this.lastFrame?.height || HEIGHT,
    };
  }

  async start() {
    if (this.state === 'running' || this.state === 'starting') return this.status();
    const chrome = findChrome();
    if (!chrome) throw new Error('No Chrome or Chromium found for remote login (set CHROME_PATH)');
    this.state = 'starting';
    this.error = null;

    try {
      const env = { ...process.env };
      if (process.platform === 'linux' && !process.env.DISPLAY) {
        const display = `:${90 + Math.floor(Math.random() * 9)}`;
        this.xvfb = spawn('Xvfb', [display, '-screen', '0', `${WIDTH}x${HEIGHT}x24`, '-nolisten', 'tcp'], { stdio: 'ignore' });
        this.xvfb.on('error', (err) => console.error('[remote-login] Xvfb failed:', err.message));
        env.DISPLAY = display;
        await sleep(500);
      }

      this.port = await freePort();
      this.profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollcall-login-'));
      const args = [
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${this.profileDir}`,
        `--window-size=${WIDTH},${HEIGHT}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-dev-shm-usage',
        '--password-store=basic',
        // Keep rendering while nobody is looking at the (virtual) window.
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
      ];
      // Containers usually can't give Chrome its sandbox (no user namespaces).
      if (process.platform === 'linux' && process.env.REMOTE_BROWSER_SANDBOX !== '1') args.push('--no-sandbox');
      args.push(LOGIN_URL);

      this.chrome = spawn(chrome.path, args, { env, stdio: 'ignore' });
      this.chrome.on('exit', (code) => {
        if (this.state === 'running' || this.state === 'starting') {
          console.log(`[remote-login] Chrome exited (${code})`);
          this.cleanup();
        }
      });

      // Wait for the DevTools endpoint, then attach to the login page.
      let pageInfo = null;
      for (let i = 0; i < 60 && !pageInfo; i++) {
        await sleep(250);
        try {
          const targets = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
          pageInfo = targets.find((t) => t.type === 'page');
        } catch { /* not up yet */ }
      }
      if (!pageInfo) throw new Error('Chrome did not start in time');

      this.page = new Cdp(pageInfo.webSocketDebuggerUrl);
      await this.page.ready;
      this.page.on('Page.screencastFrame', (f) => this.onFrame(f));
      this.page.on('Page.frameNavigated', ({ frame }) => {
        if (!frame.parentId) {
          this.url = frame.url;
          this.emit('status', this.status());
        }
      });
      this.page.on('close', () => { if (this.state === 'running') this.cleanup(); });
      await this.page.send('Page.enable');
      await this.page.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });

      this.url = pageInfo.url;
      this.state = 'running';
      this.startedAt = new Date().toISOString();
      this.touch();
      this.idleTimer = setInterval(() => {
        if (Date.now() - this.lastActivity > IDLE_TIMEOUT_MS) {
          console.log('[remote-login] Idle for 15 minutes — closing the browser');
          this.stop();
        }
      }, 30 * 1000);
      console.log(`[remote-login] Started ${chrome.kind} for a Meetup login`);
      this.emit('status', this.status());
      return this.status();
    } catch (err) {
      this.error = err.message;
      await this.cleanup();
      throw err;
    }
  }

  onFrame({ data, metadata, sessionId }) {
    this.page.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    this.lastFrame = {
      data,
      width: Math.round(metadata.deviceWidth),
      height: Math.round(metadata.deviceHeight),
    };
    this.emit('frame', this.lastFrame);
  }

  touch() {
    this.lastActivity = Date.now();
  }

  /** Forward a mouse/keyboard/text event from the dashboard viewer. */
  async input(ev) {
    if (this.state !== 'running' || !this.page) return;
    this.touch();
    const mods = (ev.alt ? 1 : 0) | (ev.ctrl ? 2 : 0) | (ev.meta ? 4 : 0) | (ev.shift ? 8 : 0);
    switch (ev.type) {
      case 'mouse': {
        const base = { x: ev.x, y: ev.y, modifiers: mods };
        if (ev.action === 'wheel') {
          return this.page.send('Input.dispatchMouseEvent', { ...base, type: 'mouseWheel', deltaX: ev.deltaX || 0, deltaY: ev.deltaY || 0 });
        }
        const type = { down: 'mousePressed', up: 'mouseReleased', move: 'mouseMoved' }[ev.action];
        if (!type) return;
        return this.page.send('Input.dispatchMouseEvent', {
          ...base, type, button: ev.action === 'move' ? (ev.buttons ? 'left' : 'none') : (ev.button || 'left'), clickCount: ev.clickCount || 1,
        });
      }
      case 'key': {
        const common = { key: ev.key, code: ev.code, windowsVirtualKeyCode: ev.keyCode, nativeVirtualKeyCode: ev.keyCode, modifiers: mods };
        if (ev.action === 'up') return this.page.send('Input.dispatchKeyEvent', { ...common, type: 'keyUp' });
        const printable = ev.key.length === 1 && !(mods & 2) && !(mods & 4);
        const text = printable ? ev.key : ev.key === 'Enter' ? '\r' : undefined;
        return this.page.send('Input.dispatchKeyEvent', { ...common, type: text ? 'keyDown' : 'rawKeyDown', text, unmodifiedText: text });
      }
      case 'text':
        return this.page.send('Input.insertText', { text: String(ev.text || '') });
      case 'navigate': {
        const url = /^https?:\/\//.test(ev.url) ? ev.url : `https://${ev.url}`;
        return this.page.send('Page.navigate', { url });
      }
      case 'back': {
        const { currentIndex, entries } = await this.page.send('Page.getNavigationHistory');
        if (currentIndex > 0) return this.page.send('Page.navigateToHistoryEntry', { entryId: entries[currentIndex - 1].id });
        return undefined;
      }
      case 'reload':
        return this.page.send('Page.reload');
      default:
        return undefined;
    }
  }

  /** Type text into whatever field has focus in the remote page (e.g. stored credentials). */
  async typeText(text) {
    await this.input({ type: 'text', text });
  }

  /** Read every cookie from the browser, in Playwright storageState format. */
  async storageState() {
    if (this.state !== 'running') throw new Error('Remote login is not running');
    const info = await (await fetch(`http://127.0.0.1:${this.port}/json/version`)).json();
    const browser = new Cdp(info.webSocketDebuggerUrl);
    await browser.ready;
    try {
      const { cookies } = await browser.send('Storage.getCookies');
      return {
        cookies: cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.session ? -1 : c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite || 'Lax',
        })),
        origins: [],
      };
    } finally {
      browser.close();
    }
  }

  async stop() {
    if (this.state === 'idle') return;
    this.state = 'stopping';
    console.log('[remote-login] Closing the browser');
    await this.cleanup();
  }

  async cleanup() {
    if (this.page) this.page.close();
    if (this.chrome && this.chrome.exitCode === null) {
      this.chrome.kill();
      await sleep(500);
    }
    if (this.xvfb && this.xvfb.exitCode === null) this.xvfb.kill();
    const dir = this.profileDir;
    const err = this.error;
    this.reset();
    this.error = err;
    this.state = 'idle';
    // The profile holds the login's cookies; don't leave it lying around.
    if (dir) fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }, () => {});
    this.emit('status', this.status());
  }
}

module.exports = new RemoteBrowser();
