/**
 * Snapshot every GraphQL operation and fragment meetup.com's frontend ships,
 * straight from the JS bundles in one or more capture HARs.
 *
 *   node tools/meetup-capture/extract-site-queries.js <captureDir> [<captureDir> ...]
 *
 * Writes docs/meetup-api/site-queries/:
 *   <name>.graphql   one file per query / mutation / fragment, verbatim
 *                    (fragment spreads appear as ${x} placeholders — the
 *                    named fragment is in its own file)
 *   INDEX.md         every definition, its kind, the persisted-query hash and
 *                    variables observed in the capture, and whether Rollcall
 *                    uses it
 *
 * Re-run after a fresh capture and `git diff docs/meetup-api/site-queries`
 * shows exactly which operations Meetup added, removed or changed.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'meetup-api', 'site-queries');
const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error('Usage: extract-site-queries.js <captureDir> [...]');
  process.exit(1);
}

// Site operations Rollcall's own queries are modelled on (see src/services/meetup-api/queries.js).
const USED_BY_ROLLCALL = {
  getUpcomingGroupEvents: 'rollcallGroupEvents',
  getPastGroupEvents: 'rollcallGroupEvents (status filter differs)',
  getEventByIdForAttendees: 'rollcallEventRsvps',
  EventByIdForAttendees: 'rollcallEventRsvps',
  AttendeesRsvp: 'rollcallEventRsvps',
  eventByIdComments: 'rollcallEventComments',
  eventByIdPinnedComments: 'rollcallEventPinnedComments',
  EventByIdComment: 'rollcallEventComments',
  EventCommentEdge: 'rollcallEventComments',
  CoreGroupHomeEvent: 'RollcallEvent fragment',
  getSelf: 'rollcallSelf',
  refreshTokensMutation: 'refreshTokensMutation (verbatim)',
};

const defs = {};
const observed = {}; // operationName -> { hash, variables, phases }
let buildId = null;

for (const dir of dirs) {
  const har = JSON.parse(fs.readFileSync(path.join(dir, 'meetup.har'), 'utf8'));
  for (const e of har.log.entries) {
    const url = e.request.url;
    buildId = buildId || url.match(/\/_next\/(?:static|data)\/([A-Za-z0-9_-]{10,})\/(?:_buildManifest|en-US)/)?.[1] || null;
    if (!/meetup\.com\/_next\/static\/.*\.js/.test(url) || !e.response.content.text) continue;
    const js = e.response.content.encoding === 'base64'
      ? Buffer.from(e.response.content.text, 'base64').toString()
      : e.response.content.text;
    const re = /`(\s*(query|fragment|mutation|subscription)\s+(\w+)[\s\S]*?)`/g;
    let m;
    while ((m = re.exec(js))) {
      const [, text, kind, name] = m;
      if (!defs[name] || defs[name].text.length < text.length) defs[name] = { kind, text };
    }
  }

  const requestsFile = path.join(dir, 'requests.json');
  if (fs.existsSync(requestsFile)) {
    for (const r of JSON.parse(fs.readFileSync(requestsFile, 'utf8'))) {
      if (!r.url.includes('/gql2') || !r.postData) continue;
      let body;
      try { body = JSON.parse(r.postData); } catch { continue; }
      for (const op of [].concat(body)) {
        const o = observed[op.operationName] = observed[op.operationName] || { hash: null, variables: null, phases: new Set() };
        o.hash = op.extensions?.persistedQuery?.sha256Hash || o.hash;
        // Keep the shape of the variables, not personal values (location, member IDs).
        o.variables = o.variables || JSON.parse(JSON.stringify(op.variables || {}, (k, v) => (
          /^(lat|lon|latitude|longitude|memberId|email|zip|zipCode)$/i.test(k) ? '<redacted>' : v
        )));
        o.phases.add(r.phase.split(':')[0]);
      }
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const names = Object.keys(defs).sort((a, b) => a.localeCompare(b));
for (const name of names) {
  fs.writeFileSync(path.join(OUT, `${name}.graphql`), defs[name].text.replace(/^\n+/, '').replace(/\s+$/, '') + '\n');
}

const kinds = ['query', 'mutation', 'subscription', 'fragment'];
const lines = [
  '# meetup.com frontend GraphQL operations (snapshot)',
  '',
  `Extracted from meetup.com's Next.js bundles${buildId ? ` (build \`${buildId}\`)` : ''} on ${new Date().toISOString().slice(0, 10)} by \`tools/meetup-capture/extract-site-queries.js\`.`,
  'Regenerate after a new capture and diff this folder to see what Meetup changed. See ../README.md for how Rollcall uses these.',
  '',
  `${names.length} definitions: ${kinds.map((k) => `${names.filter((n) => defs[n].kind === k).length} ${k === 'query' ? 'queries' : `${k}s`}`).join(', ')}.`,
  'Operations marked **observed** were sent during the capture; the hash is the persisted-query SHA-256 the site sent instead of the query text.',
  '',
];
for (const kind of kinds) {
  const group = names.filter((n) => defs[n].kind === kind);
  if (!group.length) continue;
  lines.push(`## ${kind === 'query' ? 'Queries' : `${kind[0].toUpperCase()}${kind.slice(1)}s`}`, '');
  lines.push(kind === 'fragment' ? '| Fragment | Used by Rollcall |' : '| Operation | Used by Rollcall | Observed | Persisted hash | Example variables |');
  lines.push(kind === 'fragment' ? '|---|---|' : '|---|---|---|---|---|');
  for (const n of group) {
    const used = USED_BY_ROLLCALL[n] ? `✅ ${USED_BY_ROLLCALL[n]}` : '';
    if (kind === 'fragment') {
      lines.push(`| [${n}](${n}.graphql) | ${used} |`);
    } else {
      const o = observed[n];
      const vars = o?.variables ? `\`${JSON.stringify(o.variables).replace(/\|/g, '\\|').slice(0, 120)}\`` : '';
      lines.push(`| [${n}](${n}.graphql) | ${used} | ${o ? `**observed** (${[...o.phases].join(', ')})` : ''} | ${o?.hash ? `\`${o.hash.slice(0, 16)}…\`` : ''} | ${vars} |`);
    }
  }
  lines.push('');
}
fs.writeFileSync(path.join(OUT, 'INDEX.md'), lines.join('\n'));
console.log(`${names.length} definitions → ${OUT}`);
