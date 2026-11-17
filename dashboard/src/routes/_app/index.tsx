import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarClock, KeyRound, Loader2, RefreshCw, Server, Timer, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EventStatusBadge, ErrorBlock, LoadingBlock, PageHeader, Stat } from '@/components/common'
import { Heartbeats } from '@/components/heartbeats'
import { overviewQuery, usePollGuild, type Overview } from '@/lib/api'
import { duration, formatDateTime, formatEventDate, relative } from '@/lib/format'

export const Route = createFileRoute('/_app/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(overviewQuery),
  component: OverviewPage,
})

function OverviewPage() {
  const { data, error, isLoading } = useQuery(overviewQuery)
  if (isLoading) return <LoadingBlock rows={6} />
  if (error || !data) return <ErrorBlock error={error} />

  const { session, poller } = data
  const sessionOk = !session.dead && (session.backend !== 'graphql' || !!session.self)

  return (
    <>
      <PageHeader title="Overview" description={<>Rollcall v{data.version} · up since {formatDateTime(data.startedAt)} · Node {data.nodeVersion}</>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Meetup session"
          icon={<KeyRound className="size-4" />}
          tone={sessionOk ? 'ok' : 'bad'}
          value={sessionOk ? session.self?.name || 'Connected' : 'Needs login'}
          hint={sessionOk
            ? session.checkedAt ? `Working · verified with Meetup ${relative(session.checkedAt)}` : 'Working'
            : session.stateFileUpdatedAt ? 'Upload a new session on the Meetup session page' : 'No session file'}
        />
        <Stat label="Backend" icon={<Server className="size-4" />} value={session.backend === 'graphql' ? 'GraphQL' : 'Browser'} hint={session.backend === 'graphql' ? 'Meetup API (v2)' : 'Playwright scraper (v1)'} />
        <Stat
          label="Poller"
          icon={<Timer className="size-4" />}
          tone={poller.busy ? 'warn' : undefined}
          value={poller.busy ? 'Running' : 'Idle'}
          hint={poller.busy ? poller.busy : `Full poll every ${poller.fullIntervalMinutes ?? '—'} min`}
        />
        <Stat
          label="Next polls"
          icon={<CalendarClock className="size-4" />}
          value={<span className="text-base">Full {relative(poller.nextFullPollAt)}</span>}
          hint={poller.nextQuickPollAt ? `Quick ${relative(poller.nextQuickPollAt)} (every ${poller.quickIntervalMinutes} min)` : 'Quick polling idle (no event within 24h)'}
        />
      </div>

      <div className="mt-8 space-y-6">
        {data.guilds.map((g) => (
          <div key={g.id} className="space-y-6">
            <GuildCard guild={g} />
            <Heartbeats guildId={g.id} title={data.guilds.length > 1 ? `Monitors · ${g.name}` : 'Monitors'} />
          </div>
        ))}
        {data.guilds.length === 0 && (
          <Card><CardContent className="text-sm text-muted-foreground">No Discord server is configured yet. Run <code>/config meetup</code> in your server.</CardContent></Card>
        )}
      </div>
    </>
  )
}

function GuildCard({ guild }: { guild: Overview['guilds'][number] }) {
  const poll = usePollGuild(guild.id)
  const next = guild.nextEvent

  function runPoll() {
    toast.promise(poll.mutateAsync(), {
      loading: 'Polling Meetup…',
      success: (r) => `Poll complete in ${duration(r.durationMs)}`,
      error: (e) => e.message,
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            {guild.name}
            {!guild.enabled && <Badge variant="secondary">Polling disabled</Badge>}
          </CardTitle>
          <CardDescription className="break-all">{guild.groupUrl || 'No Meetup group set'}</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/g/$guildId/events" params={{ guildId: guild.id }}>{guild.upcomingCount} upcoming events <ArrowRight /></Link>
          </Button>
          <Button onClick={runPoll} disabled={poll.isPending}>
            {poll.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Poll now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        {next ? (
          <Link
            to="/g/$guildId/events/$eventId"
            params={{ guildId: guild.id, eventId: next.event_id }}
            className="group rounded-lg border bg-gradient-to-br from-accent/60 to-transparent p-4 transition-colors hover:border-primary/50"
          >
            <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Next event <EventStatusBadge event={next} />
            </div>
            <div className="mt-2 text-lg font-semibold group-hover:text-primary">{next.title}</div>
            <div className="text-sm text-muted-foreground">{formatEventDate(next.date_time)} · {relative(next.date_time)}</div>
            <div className="text-sm text-muted-foreground">{next.location || 'Location TBD'}</div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-1.5"><Users className="size-4 text-success" /><b className="tabular-nums">{next.rsvps.going}</b> going{next.rsvps.guests > 0 && <span className="text-muted-foreground"> (incl. {next.rsvps.guests} guests)</span>}</span>
              <span><b className="tabular-nums">{next.rsvps.waitlist}</b> waitlist</span>
              <span><b className="tabular-nums">{next.rsvps.notGoing}</b> not going</span>
              <span><b className="tabular-nums">{next.commentCount}</b> comments</span>
            </div>
          </Link>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No upcoming events stored.</div>
        )}

        <div className="space-y-2 text-sm">
          <div className="font-medium">Last scrape</div>
          {guild.lastScrape ? (
            <div className="text-muted-foreground">
              {guild.lastScrape.scrape_type} · <span className={guild.lastScrape.status === 'error' ? 'text-destructive' : 'text-success'}>{guild.lastScrape.status}</span> · {duration(guild.lastScrape.duration_ms)} · {relative(guild.lastScrape.scraped_at)}
            </div>
          ) : <div className="text-muted-foreground">None yet</div>}
          <div className="pt-2 font-medium">Recent errors</div>
          {guild.recentErrors.length ? (
            <ul className="space-y-1">
              {guild.recentErrors.map((e) => (
                <li key={e.id} className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive">
                  {e.scrape_type}: {e.error_message} <span className="text-muted-foreground">({relative(e.scraped_at)})</span>
                </li>
              ))}
            </ul>
          ) : <div className="text-muted-foreground">None in the last 10 scrapes</div>}
        </div>
      </CardContent>
    </Card>
  )
}
