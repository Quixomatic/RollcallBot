/**
 * Meetup API health check — run this when the GraphQL backend misbehaves, or
 * any time, to see whether Meetup changed something Rollcall depends on.
 *
 *   node src/api-check.js [groupUrl] [--event <url>] [--refresh] [--parity <url>]
 *   pnpm run api-check -- --refresh
 *
 *   groupUrl        defaults to the first configured guild's group
 *   --event <url>   event to check RSVPs/comments on (default: the next upcoming)
 *   --refresh       also force a token refresh and confirm the new token works
 *   --parity <url>  run BOTH backends on one event and diff the results
 *                   (needs Playwright; use before switching backends)
 *   --report [path] write an HTML page of everything returned (default
 *                   data/api-report.html — local only, it lists member names)
 *
 * Every check names the exact operation, field path or enum value that
 * failed. A GraphQL validation error (field renamed/removed, argument type
 * changed) comes straight from Meetup with the field name in the message.
 * Exits non-zero if anything failed.
 */

require('dotenv').config();
const api = require('./services/meetup-api');
const { runHealthChecks } = require('./services/api-health');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const positional = args.filter((a, i) => !a.startsWith('--') && !['--event', '--parity', '--report'].includes(args[i - 1]));

let failures = 0;
const checkLog = []; // { section, level, msg } for --report
let currentSection = '';
const print = { ok: '✓', warn: '!', fail: '✗' };
function onResult(r) {
  if (r.level === 'section') {
    currentSection = r.msg;
    console.log(`\n${r.msg}`);
    return;
  }
  checkLog.push(r);
  if (r.level === 'fail') failures++;
  console.log(`  ${print[r.level]} ${r.msg}`);
}
// Used by the parity check below.
const ok = (msg) => onResult({ section: currentSection, level: 'ok', msg });
const fail = (msg) => onResult({ section: currentSection, level: 'fail', msg });
const warn = (msg) => onResult({ section: currentSection, level: 'warn', msg });

function defaultGroupUrl() {
  try {
    const { queries } = require('./database');
    return queries.getAllGuildSettings().all().find((s) => s.meetup_group_url)?.meetup_group_url || null;
  } catch {
    return null; // database unavailable — pass the URL explicitly
  }
}

async function run() {
  const groupUrl = positional[0] || defaultGroupUrl();
  console.log(`Session file: ${require('./services/meetup-api/client').STATE_FILE}`);

  const { eventUrl } = await runHealthChecks({
    groupUrl, eventUrl: opt('--event'), refresh: flag('--refresh'), onResult,
  });

  const parityUrl = opt('--parity');
  if (parityUrl) {
    currentSection = 'Parity';
    await parity(parityUrl);
  }

  if (flag('--report')) {
    const reportPath = opt('--report') && !opt('--report').startsWith('--')
      ? opt('--report')
      : require('path').join(__dirname, '..', 'data', 'api-report.html');
    await writeReport(reportPath, groupUrl, eventUrl);
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

/**
 * Write a self-contained HTML page showing exactly what the GraphQL backend
 * returns, in the shapes the bot stores and posts. Local file only: it lists
 * member names, so it isn't meant to be published.
 */
async function writeReport(reportPath, groupUrl, eventUrl) {
  const fs = require('fs');
  const path = require('path');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : '');
  const table = (headers, rows) => `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="muted">None</td></tr>`
  }</tbody></table>`;

  const self = await api.getSelf().catch(() => null);
  const events = groupUrl ? await api.fetchEvents(groupUrl, null).catch(() => []) : [];
  const details = eventUrl ? await api.fetchEventDetails(eventUrl).catch(() => null) : null;
  const rsvps = eventUrl ? await api.fetchRsvps(eventUrl).catch(() => []) : [];
  const comments = eventUrl ? await api.fetchComments(eventUrl).catch(() => []) : [];

  const tabs = [['going', '✅ Going'], ['waitlist', '⏳ Waitlist'], ['not_going', '❌ Not going']];
  const people = (list) => list.reduce((s, r) => s + 1 + (r.guests || 0), 0);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meetup API Report</title>
<style>
  :root { --bg:#fbfaf8; --fg:#1d1d1f; --muted:#6e6e73; --line:#e3e1dc; --card:#fff; --ok:#1f7a4d; --fail:#b42318; --warn:#a15c00; --accent:#7a3cff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#151517; --fg:#ececee; --muted:#9a9aa1; --line:#2c2c31; --card:#1d1d21; --ok:#4cc38a; --fail:#ff7a6e; --warn:#f2b45a; --accent:#a98bff; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 32px 0 8px; }
  .muted { color: var(--muted); }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin: 12px 0; }
  .chip { background: var(--card); border:1px solid var(--line); border-radius: 999px; padding: 4px 10px; }
  .wrap { overflow-x: auto; background: var(--card); border:1px solid var(--line); border-radius: 10px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }
  tr:last-child td { border-bottom: 0; }
  td.num { font-variant-numeric: tabular-nums; }
  .ok { color: var(--ok); } .fail { color: var(--fail); font-weight: 600; } .warn { color: var(--warn); }
  .reply td:nth-child(2) { padding-left: 28px; }
  code { font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; color: var(--muted); }
  .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
</style></head><body><main>
<h1>Meetup API Report</h1>
<div class="muted">Generated ${esc(new Date().toLocaleString())} · session: ${esc(self ? `${self.name} (${self.id})` : 'not logged in')} · ${failures ? `<span class="fail">${failures} check(s) failed</span>` : '<span class="ok">all checks passed</span>'}</div>

<h2>Checks</h2>
<div class="wrap">${table(['Check', 'Result'], checkLog.map((c) => [
    esc(c.section), `<span class="${c.level}">${c.level === 'ok' ? '✓' : c.level === 'fail' ? '✗' : '!'} ${esc(c.msg).replace(/\n/g, '<br>')}</span>`,
  ]))}</div>

<h2>Events in the next 30 days <span class="muted">(${events.length})</span></h2>
<div class="wrap">${table(['When', 'Title', 'Location (as stored)', 'Going', 'Status', 'ID'], events.map((e) => [
    esc(fmt(e.date_time)), `<a href="${esc(e.url)}">${esc(e.title)}</a>`, esc(e.location), `<span class="num">${e.rsvp_count}</span>`,
    `<span class="${e.status === 'ACTIVE' ? 'ok' : 'fail'}">${esc(e.status)}</span>`, `<code>${esc(e.event_id)}</code>`,
  ]))}</div>

${details ? `<h2>Checked event: <a href="${esc(details.url)}">${esc(details.title)}</a></h2>
<div class="chips">
  <span class="chip">${esc(fmt(details.date_time))}</span><span class="chip">${esc(details.location)}</span><span class="chip">${esc(details.status)}</span>
  ${tabs.map(([k, label]) => { const l = rsvps.filter((r) => r.rsvp_status === k); return `<span class="chip">${label}: <b>${people(l)}</b>${l.some((r) => r.guests) ? ` <span class="muted">(${l.length} + ${l.reduce((s, r) => s + r.guests, 0)} guests)</span>` : ''}</span>`; }).join('')}
  <span class="chip">💬 ${comments.length} comments</span>
</div>

<h3>RSVPs</h3>
<div class="grid">${tabs.map(([k, label]) => {
    const l = rsvps.filter((r) => r.rsvp_status === k);
    return `<div><div class="muted" style="margin:4px 2px">${label} (${people(l)})</div><div class="wrap">${table(['#', 'Member', 'Guests', 'Member ID'], l.map((r, i) => [
      `<span class="num muted">${i + 1}</span>`, `<a href="${esc(r.member_url)}">${esc(r.member_name)}</a>`, r.guests ? `<b>+${r.guests}</b>` : '', `<code>${esc(r.member_id)}</code>`,
    ]))}</div></div>`;
  }).join('')}</div>

<h3>Comments (oldest first, as they'd be posted)</h3>
<div class="wrap">${table(['Posted', 'Comment', 'Likes', 'Pinned', 'Meetup ID', 'Rollcall key'], comments.map((c) => [
    esc(fmt(c.created)), `${c.is_reply ? '↳ ' : ''}<b>${esc(c.author_name)}</b> — ${esc(c.content)}`, c.likes ? `<b>${c.likes}</b>` : '',
    c.is_pinned ? '📌' : '', `<code>${esc(c.meetup_comment_id)}</code>`, `<code>${esc(c.comment_id.slice(0, 10))}</code>`,
  ]))}</div>` : ''}
</main></body></html>`;

  // Mark reply rows so they indent.
  const out = html.replace(/<tr><td>([^<]*)<\/td><td>↳ /g, '<tr class="reply"><td>$1</td><td>↳ ');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, out);
  console.log(`\nReport written to ${reportPath}`);
}

/** Run both backends on one event and diff everything the bot stores or posts. */
async function parity(eventUrl) {
  console.log(`\nParity: browser vs graphql — ${eventUrl}`);
  const scraper = require('./services/scraper');
  const { scrapeRsvps } = require('./services/meetup-rsvps');
  const { scrapeComments } = require('./services/meetup-comments');
  const { extractEventDetails, dismissMeetupPlusPopup } = require('./utils/selectors');

  try {
    const page = await scraper.getPage();
    await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await dismissMeetupPlusPopup(page);
    const bDetails = await extractEventDetails(page);
    await page.close();
    const gDetails = await api.fetchEventDetails(eventUrl);
    for (const field of ['title', 'date_time', 'location']) {
      if (bDetails[field] === gDetails[field]) ok(`${field} identical`);
      else fail(`${field} differs:\n      browser: ${JSON.stringify(bDetails[field])}\n      graphql: ${JSON.stringify(gDetails[field])}`);
    }

    const key = (r) => `${r.rsvp_status}|${r.member_name}|${r.guests}`;
    // The browser scraper picks up the logged-in account's own header avatar
    // on every attendee tab (a v1 bug, normally hidden by /config botname).
    const self = await api.getSelf();
    const browserRsvps = await scrapeRsvps(eventUrl);
    const selfRows = browserRsvps.filter((r) => self && r.member_name === self.name);
    if (selfRows.length) warn(`browser listed the bot's own account "${self.name}" ${selfRows.length}x (v1 bug: header avatar) — ignored for the diff`);
    const bRsvps = new Set(browserRsvps.filter((r) => !selfRows.includes(r)).map(key));
    const gRsvps = new Set((await api.fetchRsvps(eventUrl)).map(key));
    const onlyB = [...bRsvps].filter((k) => !gRsvps.has(k));
    const onlyG = [...gRsvps].filter((k) => !bRsvps.has(k));
    if (!onlyB.length && !onlyG.length) ok(`RSVPs identical (${gRsvps.size})`);
    else fail(`RSVPs differ (status|name|guests):\n      only browser: ${onlyB.join('; ') || '-'}\n      only graphql: ${onlyG.join('; ') || '-'}`);

    const bComments = await scrapeComments(eventUrl);
    const gComments = await api.fetchComments(eventUrl);
    const bIds = new Set(bComments.map((c) => c.comment_id));
    const gIds = new Set(gComments.map((c) => c.comment_id));
    const cOnlyB = bComments.filter((c) => !gIds.has(c.comment_id));
    const cOnlyG = gComments.filter((c) => !bIds.has(c.comment_id));
    if (!cOnlyB.length && !cOnlyG.length) ok(`comment keys identical (${gIds.size} unique; browser saw ${bComments.length} rows)`);
    else {
      fail('comment keys differ (these would look new after a backend switch, unless caught by the text/created-time guard):');
      for (const c of cOnlyB) console.log(`      only browser: ${c.author_name}: ${JSON.stringify(c.content)}`);
      for (const c of cOnlyG) console.log(`      only graphql: ${c.author_name}: ${JSON.stringify(c.content)}`);
    }
  } finally {
    await scraper.closeBrowser();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
