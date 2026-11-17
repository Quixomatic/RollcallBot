/**
 * Documentation for the dashboard's Docs section.
 *
 *   docs/guide/*.md          guide pages (front matter: title, order)
 *   docs/commands/<name>.md  usage notes for each slash command
 *   docs/meetup-api/         Meetup API reference + site query snapshot
 *
 * The command reference itself (options, limits, permissions) is generated
 * from the command definitions the bot actually registers, so it can't drift.
 */

const fs = require('fs');
const path = require('path');
const { PermissionsBitField } = require('discord.js');

const DOCS = path.join(__dirname, '..', '..', 'docs');
const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

const OPTION_TYPES = {
  1: 'subcommand', 2: 'subcommand group', 3: 'text', 4: 'whole number', 5: 'true/false', 6: 'user',
  7: 'channel', 8: 'role', 9: 'user or role', 10: 'number', 11: 'file',
};

// Order commands appear in the reference (anything else follows alphabetically).
const COMMAND_ORDER = ['config', 'comment', 'poll', 'status', 'events', 'rsvps', 'silence', 'test-rsvps', 'test-comments', 'test-reminder'];

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Split "---\nkey: value\n---\nbody" front matter. */
function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = Object.fromEntries(m[1].split(/\r?\n/).map((l) => l.split(/:\s*/)).filter((p) => p.length >= 2).map(([k, ...v]) => [k.trim(), v.join(': ').trim()]));
  return { meta, body: text.slice(m[0].length) };
}

function guidePages() {
  const dir = path.join(DOCS, 'guide');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const { meta } = parseFrontMatter(readText(path.join(dir, f)));
    return { slug: f.replace(/^\d+-/, '').replace(/\.md$/, ''), file: f, title: meta.title || f, order: Number(meta.order) || 99 };
  }).sort((a, b) => a.order - b.order);
}

function guidePage(slug) {
  const page = guidePages().find((p) => p.slug === slug);
  if (!page) return null;
  const { body } = parseFrontMatter(readText(path.join(DOCS, 'guide', page.file)));
  return { ...page, markdown: body };
}

function describeOption(o) {
  return {
    name: o.name,
    type: OPTION_TYPES[o.type] || String(o.type),
    description: o.description,
    required: !!o.required,
    autocomplete: !!o.autocomplete,
    choices: o.choices?.map((c) => c.name) || null,
    min: o.min_value ?? o.min_length ?? null,
    max: o.max_value ?? o.max_length ?? null,
    channelTypes: o.channel_types ? 'text channels' : null,
    options: o.type === 1 || o.type === 2 ? (o.options || []).map(describeOption) : undefined,
  };
}

/** The slash commands as registered with Discord, plus their usage notes. */
function commandReference() {
  const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.js'));
  const commands = files.map((f) => {
    const json = require(path.join(COMMANDS_DIR, f)).data.toJSON();
    const perms = json.default_member_permissions
      ? new PermissionsBitField(BigInt(json.default_member_permissions)).toArray().map((p) => p.replace(/([a-z])([A-Z])/g, '$1 $2'))
      : [];
    const options = (json.options || []).map(describeOption);
    return {
      name: json.name,
      description: json.description,
      permission: perms.length ? perms.join(', ') : 'Everyone',
      subcommands: options.filter((o) => o.type === 'subcommand'),
      options: options.filter((o) => o.type !== 'subcommand'),
      guide: readText(path.join(DOCS, 'commands', `${json.name}.md`)),
    };
  });
  const rank = (n) => (COMMAND_ORDER.includes(n) ? COMMAND_ORDER.indexOf(n) : 100);
  return commands.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/** Rollcall's own GraphQL documents, exactly as the running code sends them. */
function rollcallQueries() {
  const Q = require('../services/meetup-api/queries');
  return Object.entries(Q).map(([constant, text]) => ({
    constant,
    operation: text.match(/(?:query|mutation)\s+(\w+)/)?.[1] || constant,
    kind: /^\s*mutation/.test(text) ? 'mutation' : 'query',
    text: text.replace(/^\n+/, '').replace(/\s+$/, ''),
  }));
}

/** meetup.com's own operations, from the snapshot index. */
function siteOperations() {
  const index = readText(path.join(DOCS, 'meetup-api', 'site-queries', 'INDEX.md')) || '';
  const ops = [];
  let kind = null;
  for (const line of index.split(/\r?\n/)) {
    const h = line.match(/^## (Queries|Mutations|Subscriptions|Fragments)/);
    if (h) kind = { Queries: 'query', Mutations: 'mutation', Subscriptions: 'subscription', Fragments: 'fragment' }[h[1]];
    const row = line.match(/^\| \[(\w+)\]\(\w+\.graphql\) \|(.*)$/);
    if (!row || !kind) continue;
    const cells = row[2].split(' | ').map((c) => c.replace(/\|$/, '').trim());
    ops.push({
      name: row[1],
      kind,
      usedBy: cells[0]?.replace(/^✅\s*/, '') || null,
      observed: kind !== 'fragment' && /observed/.test(cells[1] || ''),
      hash: cells[2]?.replace(/`/g, '') || null,
      variables: cells[3]?.replace(/^`|`$/g, '').replace(/\\\|/g, '|') || null,
    });
  }
  const header = index.split('## ')[0];
  return { intro: header, operations: ops };
}

function siteOperation(name) {
  if (!/^\w+$/.test(name)) return null;
  return readText(path.join(DOCS, 'meetup-api', 'site-queries', `${name}.graphql`));
}

function apiGuide() {
  return readText(path.join(DOCS, 'meetup-api', 'README.md'));
}

module.exports = { guidePages, guidePage, commandReference, rollcallQueries, siteOperations, siteOperation, apiGuide };
