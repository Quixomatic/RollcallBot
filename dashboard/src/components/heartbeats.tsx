import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { heartbeatsQuery, type Heartbeat, type Monitor, type UptimeWindow } from '@/lib/api'
import { duration, formatDateTime, relative } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Uptime Kuma-style status board: one row of heartbeat ticks per check type. */
export function Heartbeats({ guildId, slots = 60, title = 'Monitors', compact = false }: { guildId: string; slots?: number; title?: string; compact?: boolean }) {
  const { data, isLoading } = useQuery(heartbeatsQuery(guildId, slots))

  return (
    <Card className={compact ? 'gap-4 py-4' : undefined}>
      <CardHeader className={compact ? 'px-4' : undefined}>
        <CardTitle className="text-base">{title}</CardTitle>
        {!compact && <CardDescription>Every Meetup check the bot runs, newest on the right. Hover a tick for details.</CardDescription>}
      </CardHeader>
      <CardContent className={cn('space-y-5', compact && 'px-4')}>
        {isLoading || !data
          ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)
          : data.map((m) => <MonitorRow key={m.type} monitor={m} slots={slots} />)}
      </CardContent>
    </Card>
  )
}

function MonitorRow({ monitor, slots }: { monitor: Monitor; slots: number }) {
  const last = monitor.beats[monitor.beats.length - 1]
  const up = last ? last.status === 'success' : null
  const empty = Math.max(0, slots - monitor.beats.length)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className={cn(
          'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
          up === null ? 'bg-muted text-muted-foreground' : up ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
        )}>
          {formatPct(monitor.day)}
        </span>
        <span className="font-medium">{monitor.label}</span>
        <span className="text-xs text-muted-foreground">
          {last ? <>last check {relative(last.scraped_at)}</> : 'no checks yet'}
        </span>
        <span className="ml-auto flex gap-3 text-xs text-muted-foreground tabular-nums">
          <span title="Success rate, last 24 hours">24h {formatPct(monitor.day)}</span>
          <span title="Success rate, last 7 days">7d {formatPct(monitor.week)}</span>
          <span title="Average duration of successful checks, last 24 hours">avg {monitor.day.avgMs == null ? '—' : duration(monitor.day.avgMs)}</span>
        </span>
      </div>
      <div className="flex h-7 items-stretch gap-[3px]">
        {Array.from({ length: empty }, (_, i) => <div key={`e${i}`} className="flex-1 rounded-full bg-muted" />)}
        {monitor.beats.map((b) => <Tick key={b.id} beat={b} />)}
      </div>
    </div>
  )
}

function Tick({ beat }: { beat: Heartbeat }) {
  const ok = beat.status === 'success'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          'flex-1 cursor-default rounded-full transition-transform hover:scale-y-110',
          ok ? 'bg-success hover:bg-success/80' : 'bg-destructive hover:bg-destructive/80',
        )} />
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <div className="font-medium">{ok ? 'OK' : 'Failed'} · {duration(beat.duration_ms)}</div>
        <div className="opacity-80">{formatDateTime(beat.scraped_at)} ({relative(beat.scraped_at)})</div>
        {beat.error_message && <div className="mt-1 break-words">{beat.error_message}</div>}
      </TooltipContent>
    </Tooltip>
  )
}

function formatPct(w: UptimeWindow) {
  if (w.pct == null) return '—'
  return `${w.pct === 100 ? '100' : w.pct.toFixed(1)}%`
}
