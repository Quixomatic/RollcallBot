/**
 * Operational alerts to each server's alerts channel (/config alertschannel):
 * the Meetup session dying or coming back, and the daily Meetup API check.
 *
 * Alerts fire on state changes, not every poll: "session died" posts once
 * until the session works again, then "session restored" posts once. The
 * state is kept in bot_state so a restart doesn't repeat an alert.
 */

const { EmbedBuilder } = require('discord.js');
const { queries } = require('../database');

const COLOR = { bad: 0xFF6B6B, ok: 0x00AE86, warn: 0xFFA500 };

function getState(key) {
  return queries.getState().get(key)?.value ?? null;
}

function setState(key, value) {
  queries.setState().run(key, value);
}

function dashboardLink(path) {
  const base = (process.env.DASHBOARD_URL || '').replace(/\/$/, '');
  return base ? `${base}${path}` : null;
}

/** Post an embed to every configured alerts channel. Returns how many were sent. */
async function sendAlert(client, { title, description, color = COLOR.warn, fields = [], url = null }) {
  let sent = 0;
  for (const s of queries.getAllGuildSettings().all()) {
    if (!s.alerts_channel_id) continue;
    const channel = await client.channels.fetch(s.alerts_channel_id).catch(() => null);
    if (!channel) continue;
    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
    if (url) embed.setURL(url);
    if (fields.length) embed.addFields(fields);
    try {
      await channel.send({ embeds: [embed] });
      sent++;
    } catch (err) {
      console.error(`[alerts] Could not post to alerts channel ${s.alerts_channel_id}: ${err.message}`);
    }
  }
  if (sent) console.log(`[alerts] ${title}`);
  return sent;
}

/** The Meetup session stopped working. Posts once until it's restored. */
async function sessionDead(client, reason) {
  if (getState('session') === 'dead') return;
  setState('session', 'dead');
  const link = dashboardLink('/session');
  await sendAlert(client, {
    title: '🔑 Meetup session expired',
    description: [
      'Rollcall can no longer read Meetup, so **polling is paused**.',
      link
        ? `Log in again from the dashboard: **[Meetup session → Remote login](${link})**, or upload a new \`state.json\` there.`
        : 'Log in again from the dashboard\'s **Meetup session** page (Remote login), or upload a new `state.json` there.',
    ].join('\n'),
    fields: reason ? [{ name: 'Reason', value: String(reason).slice(0, 1024) }] : [],
    color: COLOR.bad,
    url: link,
  });
}

/** A session check succeeded. Posts "restored" only if we'd alerted it was dead. */
async function sessionOk(client, self) {
  const previous = getState('session');
  if (previous === 'ok') return;
  setState('session', 'ok');
  if (previous !== 'dead') return; // first run: nothing to announce
  await sendAlert(client, {
    title: '✅ Meetup session restored',
    description: `Logged in${self?.name ? ` as **${self.name}**` : ''}. Polling has resumed.`,
    color: COLOR.ok,
  });
}

/**
 * Result of the scheduled Meetup API check. Failures post every time the
 * check runs (daily) so they aren't forgotten; a pass after a failure posts
 * once. The latest result is kept for the dashboard.
 */
async function apiHealthResult(client, { results, failures }) {
  const previous = getState('api_health');
  setState('api_health', failures ? 'fail' : 'ok');
  setState('api_health_last', JSON.stringify({ at: new Date().toISOString(), failures, results }));

  if (failures) {
    const lines = results.filter((r) => r.level === 'fail').map((r) => `• **${r.section}:** ${r.msg}`);
    const link = dashboardLink('/health');
    await sendAlert(client, {
      title: `⚠️ Meetup API check failed (${failures})`,
      description: [
        'Something Rollcall depends on changed or stopped working:',
        lines.join('\n').slice(0, 3500),
        link ? `\nDetails: [API health](${link}). Switching to \`MEETUP_BACKEND=browser\` keeps the bot running meanwhile.` : '\nSwitching to `MEETUP_BACKEND=browser` keeps the bot running meanwhile.',
      ].join('\n'),
      color: COLOR.bad,
      url: link,
    });
  } else if (previous === 'fail') {
    await sendAlert(client, { title: '✅ Meetup API check passing again', description: 'All checks passed.', color: COLOR.ok });
  }
}

function lastApiHealth() {
  try {
    return JSON.parse(getState('api_health_last'));
  } catch {
    return null;
  }
}

module.exports = { sendAlert, sessionDead, sessionOk, apiHealthResult, lastApiHealth };
