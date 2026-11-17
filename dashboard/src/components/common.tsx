import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, Pin, ThumbsUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { StoredEvent } from '@/lib/api'
import { isPast } from '@/lib/format'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, actions, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
          {icon}
        </div>
        <div className={cn('mt-2 text-2xl font-semibold tabular-nums', tone === 'ok' && 'text-success', tone === 'warn' && 'text-warning', tone === 'bad' && 'text-destructive')}>{value}</div>
        {hint && <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}

export function EventStatusBadge({ event }: { event: Pick<StoredEvent, 'is_cancelled' | 'date_time' | 'quickPollMinutes'> & { is_full?: number } }) {
  if (event.is_cancelled) return <Badge variant="destructive">Cancelled</Badge>
  if (isPast(event.date_time) && !event.quickPollMinutes) return <Badge variant="secondary">Past</Badge>
  if (event.is_full) return <Badge className="bg-warning/20 text-warning hover:bg-warning/20">Full</Badge>
  if (event.quickPollMinutes) return <Badge className="bg-success/15 text-success hover:bg-success/15">Live · every {event.quickPollMinutes}m</Badge>
  return <Badge variant="outline">Upcoming</Badge>
}

export function ResultIcon({ level }: { level: 'ok' | 'warn' | 'fail' }) {
  if (level === 'ok') return <CheckCircle2 className="size-4 shrink-0 text-success" />
  if (level === 'warn') return <AlertTriangle className="size-4 shrink-0 text-warning" />
  return <CircleAlert className="size-4 shrink-0 text-destructive" />
}

export function PinnedTag() {
  return <Badge variant="outline" className="gap-1 border-primary/40 text-primary"><Pin className="size-3" /> Pinned</Badge>
}

export function LikesTag({ likes }: { likes: number }) {
  if (!likes) return null
  return <Badge variant="secondary" className="gap-1"><ThumbsUp className="size-3" /> {likes}</Badge>
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  )
}

export function ErrorBlock({ error }: { error: unknown }) {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="flex items-center gap-2 text-sm text-destructive">
        <CircleAlert className="size-4" /> {error instanceof Error ? error.message : 'Something went wrong'}
      </CardContent>
    </Card>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>
}
