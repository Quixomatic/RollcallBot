// The dashboard's docs: every page loads, every command is documented, and no
// link between pages points at something that doesn't exist.
const { setupEnv } = require('./helpers');
setupEnv();

const test = require('node:test');
const assert = require('node:assert/strict');
const docs = require('../src/dashboard/docs');

const guide = docs.guidePages();
const slugs = new Set(guide.map((p) => p.slug));
const commands = docs.commandReference();
const siteOps = new Set(docs.siteOperations().operations.map((o) => o.name));

/** Markdown link targets, without external URLs or same-page anchors. */
function links(md) {
  return [...md.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((h) => !/^(https?:|mailto:|#)/.test(h));
}

function assertLinkExists(href, where) {
  const path = href.split('#')[0];
  if (/^\/docs\/commands\/([\w-]+)$/.test(path)) {
    const name = path.split('/').pop();
    assert.ok(commands.some((c) => c.name === name), `${where}: link to unknown command ${href}`);
  } else if (['/docs/commands', '/docs/api', '/docs/api/queries', '/docs/api/site'].includes(path)) {
    // section index pages
  } else if (/site-queries\/(\w+)\.graphql$/.test(path)) {
    assert.ok(siteOps.has(path.match(/(\w+)\.graphql$/)[1]), `${where}: link to missing operation ${href}`);
  } else if (/site-queries\/INDEX\.md$|^\.\.\/\.\.\/src\//.test(path)) {
    // snapshot index / source files (opened on GitHub)
  } else if (/^\/docs\/([\w-]+)$/.test(path) || /^[\w-]+$/.test(path)) {
    const slug = path.replace(/^\/docs\//, '');
    assert.ok(slugs.has(slug), `${where}: link to unknown guide page ${href}`);
  } else {
    assert.fail(`${where}: unrecognised link ${href}`);
  }
}

test('every guide page has a title and content', () => {
  assert.ok(guide.length >= 7);
  for (const p of guide) {
    const page = docs.guidePage(p.slug);
    assert.ok(p.title && !p.title.endsWith('.md'), `${p.file} needs a title in its front matter`);
    assert.ok(page.markdown.trim().length > 200, `${p.file} looks empty`);
  }
});

test('every slash command has usage notes', () => {
  for (const c of commands) assert.ok(c.guide, `docs/commands/${c.name}.md is missing`);
});

test('the command reference reflects the real definitions', () => {
  const comment = commands.find((c) => c.name === 'comment');
  assert.equal(comment.permission, 'Administrator');
  assert.equal(comment.options.find((o) => o.name === 'text').max, 700);
  assert.equal(commands.find((c) => c.name === 'events').permission, 'Everyone');
  assert.ok(commands.find((c) => c.name === 'config').subcommands.some((s) => s.name === 'alertschannel'));
});

test('links in guide pages, command notes and the API guide all resolve', () => {
  for (const p of guide) for (const href of links(docs.guidePage(p.slug).markdown)) assertLinkExists(href, `guide/${p.file}`);
  for (const c of commands) for (const href of links(c.guide || '')) assertLinkExists(href, `commands/${c.name}.md`);
  for (const href of links(docs.apiGuide())) assertLinkExists(href, 'meetup-api/README.md');
});

test('Rollcall\'s queries and the site snapshot are available', () => {
  const ops = docs.rollcallQueries().map((q) => q.operation);
  for (const op of ['rollcallGroupEvents', 'rollcallEventRsvps', 'rollcallEventComments', 'addComment', 'refreshTokensMutation']) assert.ok(ops.includes(op), op);
  assert.ok(siteOps.size > 300);
  assert.match(docs.siteOperation('getUpcomingGroupEvents'), /query getUpcomingGroupEvents/);
  assert.equal(docs.siteOperation('../../etc/passwd'), null, 'names are validated');
});
