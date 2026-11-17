/**
 * Keeps the most recent console output in memory so the dashboard can show
 * live logs. Call install() once at startup; console output still goes to
 * stdout/stderr as before.
 */

const util = require('util');

const MAX_LINES = 2000;
const lines = [];
let seq = 0;
let installed = false;

function install() {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      lines.push({ id: ++seq, t: new Date().toISOString(), level: level === 'log' ? 'info' : level, msg: util.format(...args) });
      if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
      original(...args);
    };
  }
}

/** Lines with id > after (for incremental polling), newest last. */
function getLines(after = 0, limit = 500) {
  const out = lines.filter((l) => l.id > after);
  return out.slice(-limit);
}

module.exports = { install, getLines };
