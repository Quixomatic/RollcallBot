/**
 * Dashboard JSON API. Everything here runs inside the bot process, so it
 * sees the same database, poller, backend and Discord client the bot uses.
 */

const express = require('express');
const fs = require('fs');
const { ChannelType } = require('discord.js');
const { queries, getDb } = require('../database');
const { getBackend } = require('../services/backend');
const poller = require('../services/poller');
const notifier = require('../services/notifier');
const logBuffer = require('../services/log-buffer');
const { runHealthChecks } = require('../services/api-health');
const { postAsAdmin } = require('../services/comment-poster');
const { version } = require('../../package.json');

const startedAt = new Date().toISOString();

function wrap(fn) {
  return (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
    const status = err instanceof poller.PollerBusyError ? 409 : err.status || 500;
    if (status >= 500) console.error(`[dashboard] ${req.method} ${req.path}:`, err.message);
    res.status(status).json({ error: err.message });
  });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function guildInfo(client, guildId) {
  const g = client.guilds?.cache?.get(guildId);
  return { id: guildId, name: g?.name || guildId, iconUrl: g?.iconURL?.() || null, inDiscord: !!g };
}

/** Stored RSVP counts in the same terms the Discord embed uses. */
function rsvpCounts(eventId) {
  const rsvps = queries.getRsvpsForEvent().all(eventId);
  const of = (s) => rsvps.filter((r) => r.rsvp_status === s);
  return {
    going: of('going').reduce((n, r) => n + 1 + (r.guests || 0), 0),
    goingMembers: of('going').length,
    guests: of('going').reduce((n, r) => n + (r.guests || 0), 0),
    waitlist: of('waitlist').length,
    notGoing: of('not_going').length,
    tracked: rsvps.length > 0,
  };
}

function eventSummary(e) {
  const commentCount = getDb().prepare('SELECT COUNT(*) AS n FROM comments WHERE event_id = ?').get(e.event_id).n;
  return {
    ...e,
    rsvps: rsvpCounts(e.event_id),
    commentCount,
    quickPollMinutes: e.is_cancelled ? null : poller.getQuickPollInterval(e.date_time),
  };
}

/**
 * Session status for the dashboard. The logged-in account comes from the
 * poller's own most recent session check, so viewing the dashboard never
 * sends anything to Meetup. Only `fresh` (the "Re-read session" button), or
 * no check having run yet, makes a request.
 */
async function sessionStatus({ fresh = false } = {}) {
  const backend = getBackend();
  const meetup = require('../services/meetup-api/client');
  const status = {
    backend: backend.name, dead: false, self: null, checkedAt: null,
    tokenMinutesLeft: null, tokenIssuedAt: null, stateFileUpdatedAt: null,
  };
  try {
    status.stateFileUpdatedAt = fs.statSync(meetup.STATE_FILE).mtime.toISOString();
    // Informational only: Meetup doesn't enforce the token's own expiry.
    const claims = meetup.accessTokenClaims();
    if (claims?.iat) status.tokenIssuedAt = new Date(claims.iat * 1000).toISOString();
    if (claims?.exp) status.tokenMinutesLeft = Math.round((claims.exp - Date.now() / 1000) / 60);
  } catch { /* no session file yet */ }

  if (backend.name === 'graphql') {
    status.dead = meetup.isSessionDead();
    if (!status.dead) {
      if (fresh || !meetup.getLastSelf().at) await meetup.getSelf().catch(() => null);
      const last = meetup.getLastSelf();
      status.self = last.value;
      status.checkedAt = last.at;
      status.dead = meetup.isSessionDead();
    }
  }
  return status;
}

/** Validate and apply a partial settings update, mirroring /config's limits. */
function applySettings(client, guildId, body) {
  const changes = [];
  const guild = client.guilds?.cache?.get(guildId);
  const intIn = (v, min, max, name) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw httpError(400, `${name} must be a whole number from ${min} to ${max}`);
    return n;
  };
  const channel = (id, name) => {
    if (id === null || id === '') return null;
    if (guild && !guild.channels.cache.get(id)) throw httpError(400, `${name}: channel ${id} is not in this server`);
    return String(id);
  };

  if (body.meetup_group_url !== undefined) {
    if (!/^https:\/\/(www\.)?meetup\.com\/[^/]+\/?$/.test(body.meetup_group_url)) throw httpError(400, 'Meetup group URL must look like https://www.meetup.com/your-group/');
    queries.setMeetupGroupUrl().run(guildId, body.meetup_group_url); changes.push('meetup URL');
  }
  if (body.events_channel_id !== undefined) { queries.setEventsChannel().run(guildId, channel(body.events_channel_id, 'Events channel')); changes.push('events channel'); }
  if (body.rsvp_channel_id !== undefined) { queries.setRsvpChannel().run(guildId, channel(body.rsvp_channel_id, 'RSVP channel')); changes.push('RSVP channel'); }
  if (body.comments_channel_id !== undefined) { queries.setCommentsChannel().run(guildId, channel(body.comments_channel_id, 'Comments channel')); changes.push('comments channel'); }
  if (body.reminders_channel_id !== undefined) { queries.setRemindersChannel().run(guildId, channel(body.reminders_channel_id, 'Reminders channel')); changes.push('reminders channel'); }
  if (body.poll_interval_minutes !== undefined) { queries.setPollInterval().run(guildId, intIn(body.poll_interval_minutes, 5, 60, 'Poll interval')); changes.push('poll interval'); }
  if (body.event_horizon_days !== undefined) { queries.setEventHorizon().run(guildId, intIn(body.event_horizon_days, 7, 90, 'Event horizon')); changes.push('horizon'); }
  if (body.rsvp_edit_threshold_minutes !== undefined) { queries.setRsvpEditThreshold().run(guildId, intIn(body.rsvp_edit_threshold_minutes, 0, 60, 'RSVP edit threshold')); changes.push('RSVP threshold'); }
  if (body.reminder_day_before !== undefined) { queries.setReminderDayBefore().run(guildId, body.reminder_day_before ? 1 : 0); changes.push('day-before reminder'); }
  if (body.reminder_hours_before !== undefined) {
    const v = String(body.reminder_hours_before).trim();
    if (v && !/^\d+(\.\d+)?(\s*,\s*\d+(\.\d+)?)*$/.test(v)) throw httpError(400, 'Hours-before reminders must be numbers separated by commas, e.g. "2,1"');
    queries.setReminderHoursBefore().run(guildId, v); changes.push('hours-before reminders');
  }
  if (body.timezone !== undefined) {
    try { Intl.DateTimeFormat('en-US', { timeZone: body.timezone }); } catch { throw httpError(400, `Invalid timezone "${body.timezone}"`); }
    queries.setTimezone().run(guildId, body.timezone); changes.push('timezone');
  }
  if (body.bot_meetup_name !== undefined) { queries.setBotMeetupName().run(guildId, String(body.bot_meetup_name).trim() || null); changes.push('bot Meetup name'); }
  if (body.enabled !== undefined) { queries.setEnabled().run(guildId, body.enabled ? 1 : 0); changes.push(body.enabled ? 'enabled' : 'disabled'); }
  return changes;
}

function createApi(client, { outbox = null } = {}) {
  const router = express.Router();
  const guildSettings = (guildId) => {
    const s = queries.getGuildSettings().get(guildId);
    if (!s) throw httpError(404, 'This server has no Rollcall configuration');
    return s;
  };

  router.get('/overview', wrap(async (req, res) => {
    const all = queries.getAllGuildSettings().all();
    const guilds = all.map((s) => {
      const upcoming = queries.getUpcomingEventsForGuild().all(s.guild_id);
      const recent = queries.getRecentScrapes().all(s.guild_id);
      return {
        ...guildInfo(client, s.guild_id),
        enabled: !!s.enabled,
        groupUrl: s.meetup_group_url,
        upcomingCount: upcoming.length,
        nextEvent: upcoming[0] ? eventSummary(upcoming[0]) : null,
        lastScrape: recent[0] || null,
        recentErrors: recent.filter((r) => r.status === 'error').slice(0, 5),
      };
    });
    res.json({
      version,
      startedAt,
      nodeVersion: process.version,
      dryRun: !!outbox,
      poller: poller.getStatus(),
      session: await sessionStatus(),
      guilds,
    });
  }));

  router.get('/guilds', wrap(async (req, res) => {
    res.json(queries.getAllGuildSettings().all().map((s) => ({ ...guildInfo(client, s.guild_id), enabled: !!s.enabled, groupUrl: s.meetup_group_url })));
  }));

  router.get('/guilds/:guildId/events', wrap(async (req, res) => {
    guildSettings(req.params.guildId);
    const rows = req.query.scope === 'upcoming'
      ? queries.getUpcomingEventsForGuild().all(req.params.guildId)
      : queries.getAllEventsForGuild().all(req.params.guildId);
    res.json(rows.map(eventSummary));
  }));

  router.get('/guilds/:guildId/events/:eventId', wrap(async (req, res) => {
    const { guildId, eventId } = req.params;
    const event = queries.getEventForGuild().get(eventId, guildId);
    if (!event) throw httpError(404, 'Event not stored for this server');
    res.json({
      event: eventSummary(event),
      rsvps: queries.getRsvpsForEvent().all(eventId),
      comments: queries.getCommentsForEvent().all(eventId),
      rsvpMessage: queries.getRsvpMessage().get(eventId, guildId) || null,
      reminders: getDb().prepare('SELECT * FROM sent_reminders WHERE event_id = ? AND guild_id = ?').all(eventId, guildId),
    });
  }));

  // Fresh from Meetup, through the active backend (nothing is stored or posted).
  router.get('/guilds/:guildId/events/:eventId/live', wrap(async (req, res) => {
    const { guildId, eventId } = req.params;
    const event = queries.getEventForGuild().get(eventId, guildId);
    if (!event) throw httpError(404, 'Event not stored for this server');
    const backend = getBackend();
    const [details, rsvps, comments] = await Promise.all([
      backend.getEventDetails(event.url), backend.getRsvps(event.url), backend.getComments(event.url),
    ]);
    res.json({ backend: backend.name, fetchedAt: new Date().toISOString(), details, rsvps, comments });
  }));

  router.post('/guilds/:guildId/poll', wrap(async (req, res) => {
    guildSettings(req.params.guildId);
    const started = Date.now();
    await poller.pollGuildNow(client, req.params.guildId, 'dashboard: full poll');
    res.json({ ok: true, durationMs: Date.now() - started });
  }));

  router.post('/guilds/:guildId/events/:eventId/rescan', wrap(async (req, res) => {
    res.json(await poller.pollEventNow(client, req.params.guildId, req.params.eventId));
  }));

  router.post('/guilds/:guildId/events/:eventId/post-rsvps', wrap(async (req, res) => {
    const { guildId, eventId } = req.params;
    const event = queries.getEventForGuild().get(eventId, guildId);
    if (!event) throw httpError(404, 'Event not stored for this server');
    const all = queries.getRsvpsForEvent().all(eventId).map((r) => ({ member_name: r.member_name, rsvp_status: r.rsvp_status, guests: r.guests }));
    if (!all.length) throw httpError(400, 'No RSVPs stored for this event yet — rescan it first');
    await notifier.notifyRsvpUpdate(client, guildId, event, { all, added: [], removed: [], changed: [] });
    res.json({ ok: true });
  }));

  // Uptime-Kuma-style monitors: recent checks per scrape type, oldest first,
  // plus success rate and average duration over 24h and 7d.
  router.get('/guilds/:guildId/heartbeats', wrap(async (req, res) => {
    const { guildId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const uptime = (type, window) => {
      const u = queries.getScrapeUptime().get(guildId, type, window);
      return { total: u.total, ok: u.ok || 0, pct: u.total ? (100 * (u.ok || 0)) / u.total : null, avgMs: u.avg_ms == null ? null : Math.round(u.avg_ms) };
    };
    const monitors = [
      { type: 'events', label: 'Event listing' },
      { type: 'rsvps', label: 'RSVPs' },
      { type: 'comments', label: 'Comments' },
    ].map((m) => ({
      ...m,
      beats: queries.getScrapeLogByType().all(guildId, m.type, limit).reverse(),
      day: uptime(m.type, '-1 day'),
      week: uptime(m.type, '-7 days'),
    }));
    res.json(monitors);
  }));

  // The dry run fakes Discord but its Meetup calls are real, so writes to
  // Meetup are off there unless explicitly allowed.
  const assertMeetupWritesAllowed = () => {
    if (outbox && process.env.DEV_ALLOW_MEETUP_WRITES !== '1') {
      throw httpError(403, 'Dry run: posting to Meetup is disabled because it would be real. Set DEV_ALLOW_MEETUP_WRITES=1 to allow it.');
    }
  };

  // Post a comment (or reply) as the bot account, signed with the admin's name.
  router.post('/guilds/:guildId/events/:eventId/comments', wrap(async (req, res) => {
    assertMeetupWritesAllowed();
    const { guildId, eventId } = req.params;
    const authorName = String(req.body?.authorName || '').trim();
    if (!authorName) throw httpError(400, 'Enter the name to sign the comment with');
    try {
      const result = await postAsAdmin({
        guildId, eventId, authorName, text: req.body?.text, replyTo: req.body?.replyTo || null, source: `dashboard (${authorName})`,
      });
      res.json({ ok: true, text: result.text, meetupCommentId: result.meetupCommentId });
    } catch (err) {
      throw httpError(400, err.message);
    }
  }));

  // Delete one of the bot account's own comments. Comments by anyone else are
  // refused, even if the account has organizer rights on Meetup.
  router.delete('/guilds/:guildId/events/:eventId/comments/:meetupCommentId', wrap(async (req, res) => {
    assertMeetupWritesAllowed();
    const { guildId, eventId, meetupCommentId } = req.params;
    const event = queries.getEventForGuild().get(eventId, guildId);
    if (!event) throw httpError(404, 'Event not stored for this server');
    const backend = getBackend();
    const meetup = require('../services/meetup-api/client');
    const self = await meetup.getSelf();
    const target = (await backend.getComments(event.url)).find((c) => c.meetup_comment_id === meetupCommentId);
    if (!target) throw httpError(404, 'That comment is no longer on Meetup');
    if (!self || target.author_id !== self.id) throw httpError(403, 'Only comments posted by the bot account can be deleted here');
    await backend.deleteComment(event.url, meetupCommentId, { isReply: target.is_reply });
    console.log(`[dashboard] Deleted the bot's ${target.is_reply ? 'reply' : 'comment'} on "${event.title}": ${JSON.stringify(target.content)}`);
    res.json({ ok: true });
  }));

  router.get('/guilds/:guildId/scrape-log', wrap(async (req, res) => {
    res.json(queries.getScrapeLog().all(req.params.guildId, Math.min(Number(req.query.limit) || 100, 500)));
  }));

  router.get('/guilds/:guildId/settings', wrap(async (req, res) => {
    const { guildId } = req.params;
    const settings = guildSettings(guildId);
    const creds = queries.getMeetupCredentials().get(guildId);
    const guild = client.guilds?.cache?.get(guildId);
    const channels = guild
      ? [...guild.channels.cache.values()]
        .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map((c) => ({ id: c.id, name: c.name, category: c.parent?.name || null }))
      : [];
    res.json({ guild: guildInfo(client, guildId), settings, credentialsEmail: creds?.email || null, channels });
  }));

  router.put('/guilds/:guildId/settings', wrap(async (req, res) => {
    const { guildId } = req.params;
    guildSettings(guildId);
    const changes = applySettings(client, guildId, req.body || {});
    console.log(`[dashboard] ${guildInfo(client, guildId).name}: settings updated (${changes.join(', ') || 'no changes'})`);
    res.json({ ok: true, changes, settings: queries.getGuildSettings().get(guildId) });
  }));

  router.get('/session', wrap(async (req, res) => res.json(await sessionStatus({ fresh: req.query.fresh === '1' }))));

  router.post('/session/refresh', wrap(async (req, res) => {
    if (getBackend().name !== 'graphql') throw httpError(400, 'Token refresh is handled by the browser in the browser backend');
    const client_ = require('../services/meetup-api/client');
    const before = client_.accessTokenClaims()?.iat;
    const ok = await client_.refreshTokens();
    if (!ok) throw httpError(502, 'Meetup rejected the refresh token — upload a new session');
    const after = client_.accessTokenClaims()?.iat;
    res.json({ ok, renewed: !!after && after !== before });
  }));

  router.post('/session/upload', wrap(async (req, res) => {
    const client_ = require('../services/meetup-api/client');
    const result = await client_.verifySession(req.body?.state);
    if (!result.ok) throw httpError(400, result.reason);
    const { backup } = client_.installSession(result.state);
    await getBackend().reloadSession();
    await client_.getSelf().catch(() => null); // record the new account for the status display
    console.log(`[dashboard] New Meetup session installed (${result.self.name}); previous saved to ${backup || 'nothing (no previous session)'}`);
    res.json({ ok: true, self: result.self, backup });
  }));

  router.post('/session/resume', wrap(async (req, res) => {
    await getBackend().reloadSession();
    res.json({ ok: true, session: await sessionStatus({ fresh: true }) });
  }));

  router.post('/health/check', wrap(async (req, res) => {
    const groupUrl = req.body?.groupUrl || queries.getAllGuildSettings().all().find((s) => s.meetup_group_url)?.meetup_group_url;
    res.json(await runHealthChecks({ groupUrl, eventUrl: req.body?.eventUrl || null, refresh: !!req.body?.refresh }));
  }));

  router.get('/logs', wrap(async (req, res) => {
    res.json(logBuffer.getLines(Number(req.query.after) || 0, Math.min(Number(req.query.limit) || 500, 2000)));
  }));

  // Dry-run mode only: what would have been posted to Discord.
  router.get('/outbox', wrap(async (req, res) => {
    res.json(outbox ? outbox.slice(-200) : []);
  }));

  return router;
}

module.exports = { createApi };
