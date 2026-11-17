/**
 * Web dashboard: JSON API under /api plus the built React app (dashboard/dist).
 * Enabled by setting DASHBOARD_PASSWORD; listens on DASHBOARD_PORT (3000).
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const auth = require('./auth');
const { createApi } = require('./api');

const DIST = path.join(__dirname, '..', '..', 'dashboard', 'dist');

function startDashboard(client, { outbox = null } = {}) {
  if (!process.env.DASHBOARD_PASSWORD) {
    console.log('[dashboard] Disabled — set DASHBOARD_PASSWORD to enable the web dashboard');
    return null;
  }
  // DASHBOARD_PORT=0 picks any free port (tests).
  const parsed = parseInt(process.env.DASHBOARD_PORT, 10);
  const port = Number.isInteger(parsed) && parsed >= 0 ? parsed : 3000;

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, linklocal, uniquelocal'); // correct client IPs behind a LAN reverse proxy
  app.use(express.json({ limit: '5mb' })); // session uploads are ~20 KB

  app.post('/api/auth/login', auth.login);
  app.post('/api/auth/logout', auth.logout);
  app.get('/api/auth/me', (req, res) => res.json({ authenticated: auth.isAuthenticated(req) }));
  app.use('/api', auth.requireAuth, createApi(client, { outbox }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route' }));

  if (fs.existsSync(path.join(DIST, 'index.html'))) {
    app.use(express.static(DIST, { index: false, maxAge: '1h' }));
    // Client-side routes: every other GET serves the app shell.
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
  } else {
    app.get('/', (req, res) => res.type('text').send('Dashboard UI not built. Run: pnpm --dir dashboard install && pnpm --dir dashboard build'));
  }

  const server = app.listen(port, () => console.log(`[dashboard] Listening on http://0.0.0.0:${port}`));
  server.on('error', (err) => console.error(`[dashboard] Could not start on port ${port}: ${err.message}`));
  attachRemoteLoginSocket(server);
  return server;
}

/**
 * WebSocket for the remote login viewer: streams screen frames out, takes
 * mouse/keyboard input in. Same login cookie as the rest of the dashboard.
 */
function attachRemoteLoginSocket(server) {
  const { WebSocketServer } = require('ws');
  const remote = require('./remote-browser');
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/api/remote-login/ws')) return socket.destroy();
    if (!auth.isAuthenticated(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  wss.on('connection', (ws) => {
    const send = (obj) => {
      // Drop frames rather than queue them if this viewer can't keep up.
      if (obj.type === 'frame' && ws.bufferedAmount > 2 * 1024 * 1024) return;
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };
    const onFrame = (f) => send({ type: 'frame', ...f });
    const onStatus = (s) => send({ type: 'status', status: s });
    remote.on('frame', onFrame);
    remote.on('status', onStatus);
    onStatus(remote.status());
    if (remote.lastFrame) onFrame(remote.lastFrame);

    ws.on('message', (raw) => {
      let ev;
      try { ev = JSON.parse(raw); } catch { return; }
      remote.input(ev).catch((err) => send({ type: 'error', message: err.message }));
    });
    ws.on('close', () => {
      remote.off('frame', onFrame);
      remote.off('status', onStatus);
    });
  });
}

module.exports = { startDashboard };
