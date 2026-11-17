import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

// ---- Types (mirror src/dashboard/api.js) ----

export interface RsvpCounts {
  going: number
  goingMembers: number
  guests: number
  waitlist: number
  notGoing: number
  tracked: boolean
}

export interface StoredEvent {
  event_id: string
  guild_id: string
  title: string
  url: string
  date_time: string | null
  location: string | null
  description: string | null
  rsvp_count: number
  waitlist_count: number
  is_cancelled: number
  first_seen_at: string
  updated_at: string
  rsvps: RsvpCounts
  commentCount: number
  quickPollMinutes: number | null
}

export interface StoredRsvp {
  event_id: string
  member_name: string
  member_url: string | null
  member_id: string | null
  rsvp_status: 'going' | 'waitlist' | 'not_going'
  guests: number
  first_seen_at: string
  updated_at: string
}

export interface StoredComment {
  comment_id: string
  meetup_comment_id: string | null
  event_id: string
  author_name: string
  content: string
  posted_at: string | null
  likes: number
  parent_comment_id: string | null
  first_seen_at: string
}

export interface ScrapeLogEntry {
  id: number
  guild_id: string
  scrape_type: string
  status: 'success' | 'error'
  error_message: string | null
  duration_ms: number
  scraped_at: string
}

export interface GuildSummary {
  id: string
  name: string
  iconUrl: string | null
  inDiscord: boolean
  enabled: boolean
  groupUrl: string | null
}

export interface PollerStatus {
  busy: string | null
  busySince: string | null
  lastFullPollAt: string | null
  lastQuickPollAt: string | null
  nextFullPollAt: string | null
  nextQuickPollAt: string | null
  fullIntervalMinutes: number | null
  quickIntervalMinutes: number | null
}

export interface SessionStatus {
  backend: 'graphql' | 'browser'
  dead: boolean
  self: { id: string; name: string } | null
  /** When `self` was last confirmed live against Meetup. */
  checkedAt: string | null
  /** From the token's JWT. Informational: Meetup doesn't enforce this expiry. */
  tokenMinutesLeft: number | null
  tokenIssuedAt: string | null
  stateFileUpdatedAt: string | null
}

export interface Overview {
  version: string
  startedAt: string
  nodeVersion: string
  dryRun: boolean
  poller: PollerStatus
  session: SessionStatus
  guilds: (GuildSummary & {
    upcomingCount: number
    nextEvent: StoredEvent | null
    lastScrape: ScrapeLogEntry | null
    recentErrors: ScrapeLogEntry[]
  })[]
}

export interface EventDetail {
  event: StoredEvent
  rsvps: StoredRsvp[]
  comments: StoredComment[]
  rsvpMessage: { channel_id: string; message_id: string; updated_at: string } | null
  reminders: { reminder_type: string; sent_at: string }[]
}

export interface LiveRsvp {
  member_name: string
  member_id: string
  member_url: string
  rsvp_status: 'going' | 'waitlist' | 'not_going'
  guests: number
}

export interface LiveComment {
  comment_id: string
  meetup_comment_id: string
  author_name: string
  author_id: string | null
  content: string
  created: string
  likes: number
  is_reply: boolean
  is_pinned: boolean
  parent_comment_id: string | null
}

export interface LiveEvent {
  backend: string
  fetchedAt: string
  details: { title: string; date_time: string; location: string | null; status?: string; rsvp_count: number; url?: string }
  rsvps: LiveRsvp[]
  comments: LiveComment[]
}

export interface GuildSettings {
  guild_id: string
  meetup_group_url: string | null
  events_channel_id: string | null
  rsvp_channel_id: string | null
  comments_channel_id: string | null
  reminders_channel_id: string | null
  poll_interval_minutes: number
  event_horizon_days: number
  reminder_day_before: number
  reminder_hours_before: string | null
  bot_meetup_name: string | null
  rsvp_edit_threshold_minutes: number
  timezone: string | null
  enabled: number
}

export interface SettingsResponse {
  guild: GuildSummary
  settings: GuildSettings
  credentialsEmail: string | null
  channels: { id: string; name: string; category: string | null }[]
}

export interface PollEventSummary {
  eventId: string
  diffs: { field: string; old: string | null; new: string }[]
  cancelled: boolean
  rsvps: { total: number; added: string[]; removed: string[]; changed: string[]; posted: boolean } | null
  comments: { total: number; new: number } | null
  errors: string[]
  durationMs: number
}

export interface Heartbeat {
  id: number
  status: 'success' | 'error'
  error_message: string | null
  duration_ms: number
  scraped_at: string
}

export interface UptimeWindow {
  total: number
  ok: number
  pct: number | null
  avgMs: number | null
}

export interface Monitor {
  type: 'events' | 'rsvps' | 'comments'
  label: string
  beats: Heartbeat[]
  day: UptimeWindow
  week: UptimeWindow
}

export interface HealthResult {
  section: string
  level: 'ok' | 'warn' | 'fail'
  msg: string
}

export interface LogLine {
  id: number
  t: string
  level: 'info' | 'warn' | 'error'
  msg: string
}

export interface OutboxEntry {
  at: string
  action: 'send' | 'edit' | 'delete'
  channel: string
  messageId: string
  content?: string | null
  embeds: { title?: string; description?: string; url?: string; color?: number; fields?: { name: string; value: string; inline?: boolean }[]; footer?: { text: string } }[]
}

// ---- Fetch ----

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(init?.json !== undefined ? { 'content-type': 'application/json' } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    credentials: 'same-origin',
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 401 && !path.startsWith('/auth/')) {
    // Session expired or logged out elsewhere: back to the login page.
    window.location.href = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`
  }
  if (!res.ok) throw new ApiError(res.status, body.error || `Request failed (${res.status})`)
  return body as T
}

// ---- Queries ----

export const qk = {
  me: ['me'] as const,
  overview: ['overview'] as const,
  guilds: ['guilds'] as const,
  events: (guildId: string, scope: string) => ['events', guildId, scope] as const,
  event: (guildId: string, eventId: string) => ['event', guildId, eventId] as const,
  live: (guildId: string, eventId: string) => ['live', guildId, eventId] as const,
  settings: (guildId: string) => ['settings', guildId] as const,
  scrapeLog: (guildId: string) => ['scrape-log', guildId] as const,
  session: ['session'] as const,
  logs: ['logs'] as const,
  outbox: ['outbox'] as const,
}

export const meQuery = queryOptions({
  queryKey: qk.me,
  queryFn: () => api<{ authenticated: boolean }>('/auth/me'),
  staleTime: 60_000,
})

export const overviewQuery = queryOptions({
  queryKey: qk.overview,
  queryFn: () => api<Overview>('/overview'),
  refetchInterval: 10_000,
})

export const guildsQuery = queryOptions({
  queryKey: qk.guilds,
  queryFn: () => api<GuildSummary[]>('/guilds'),
  staleTime: 60_000,
})

export const eventsQuery = (guildId: string, scope: 'upcoming' | 'all') => queryOptions({
  queryKey: qk.events(guildId, scope),
  queryFn: () => api<StoredEvent[]>(`/guilds/${guildId}/events?scope=${scope}`),
  refetchInterval: 30_000,
})

export const eventQuery = (guildId: string, eventId: string) => queryOptions({
  queryKey: qk.event(guildId, eventId),
  queryFn: () => api<EventDetail>(`/guilds/${guildId}/events/${eventId}`),
  refetchInterval: 30_000,
})

export const liveEventQuery = (guildId: string, eventId: string) => queryOptions({
  queryKey: qk.live(guildId, eventId),
  queryFn: () => api<LiveEvent>(`/guilds/${guildId}/events/${eventId}/live`),
  staleTime: 60_000,
})

export const settingsQuery = (guildId: string) => queryOptions({
  queryKey: qk.settings(guildId),
  queryFn: () => api<SettingsResponse>(`/guilds/${guildId}/settings`),
})

export const scrapeLogQuery = (guildId: string) => queryOptions({
  queryKey: qk.scrapeLog(guildId),
  queryFn: () => api<ScrapeLogEntry[]>(`/guilds/${guildId}/scrape-log?limit=100`),
  refetchInterval: 15_000,
})

export const heartbeatsQuery = (guildId: string, limit = 60) => queryOptions({
  queryKey: ['heartbeats', guildId, limit] as const,
  queryFn: () => api<Monitor[]>(`/guilds/${guildId}/heartbeats?limit=${limit}`),
  refetchInterval: 15_000,
})

export const sessionQuery = queryOptions({
  queryKey: qk.session,
  queryFn: () => api<SessionStatus>('/session'),
  refetchInterval: 30_000,
})

export const outboxQuery = queryOptions({
  queryKey: qk.outbox,
  queryFn: () => api<OutboxEntry[]>('/outbox'),
  refetchInterval: 5_000,
})

// ---- Mutations ----

/** Invalidate everything that a poll could have changed. */
export function useInvalidateData() {
  const qc = useQueryClient()
  return () => Promise.all(['overview', 'events', 'event', 'scrape-log', 'heartbeats', 'outbox', 'session'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

export function usePollGuild(guildId: string) {
  const invalidate = useInvalidateData()
  return useMutation({
    mutationFn: () => api<{ ok: true; durationMs: number }>(`/guilds/${guildId}/poll`, { method: 'POST' }),
    onSettled: invalidate,
  })
}

export function useRescanEvent(guildId: string, eventId: string) {
  const invalidate = useInvalidateData()
  return useMutation({
    mutationFn: () => api<PollEventSummary>(`/guilds/${guildId}/events/${eventId}/rescan`, { method: 'POST' }),
    onSettled: invalidate,
  })
}

export function usePostRsvps(guildId: string, eventId: string) {
  const invalidate = useInvalidateData()
  return useMutation({
    mutationFn: () => api<{ ok: true }>(`/guilds/${guildId}/events/${eventId}/post-rsvps`, { method: 'POST' }),
    onSettled: invalidate,
  })
}

export function usePostComment(guildId: string, eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { authorName: string; text: string; replyTo?: string | null }) =>
      api<{ ok: true; text: string; meetupCommentId: string | null }>(`/guilds/${guildId}/events/${eventId}/comments`, { method: 'POST', json: body }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.live(guildId, eventId) }),
  })
}

export function useDeleteComment(guildId: string, eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (meetupCommentId: string) =>
      api<{ ok: true }>(`/guilds/${guildId}/events/${eventId}/comments/${meetupCommentId}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.live(guildId, eventId) }),
  })
}
