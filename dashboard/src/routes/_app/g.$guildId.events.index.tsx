import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Loader2, MessageSquare, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Empty, ErrorBlock, EventStatusBadge, LoadingBlock, PageHeader } from '@/components/common'
import { eventsQuery, usePollGuild } from '@/lib/api'
import { duration, formatEventDate, relative } from '@/lib/format'

type Scope = 'upcoming' | 'all'

export const Route = createFileRoute('/_app/g/$guildId/events/')({
  validateSearch: (s: Record<string, unknown>): { scope?: Scope } => (s.scope === 'all' ? { scope: 'all' } : {}),
  loaderDeps: ({ search }) => ({ scope: search.scope ?? 'upcoming' }),
  loader: ({ context, params, deps }) => context.queryClient.ensureQueryData(eventsQuery(params.guildId, deps.scope)),
  component: EventsPage,
})

function EventsPage() {
  const { guildId } = Route.useParams()
  const scope = Route.useSearch().scope ?? 'upcoming'
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: events, error, isLoading } = useQuery(eventsQuery(guildId, scope))
  const poll = usePollGuild(guildId)

  return (
    <>
      <PageHeader
        title="Events"
        description="Events Rollcall is tracking. Click one to see its RSVPs and comments."
        actions={
          <Button
            onClick={() => toast.promise(poll.mutateAsync(), { loading: 'Polling Meetup…', success: (r) => `Poll complete in ${duration(r.durationMs)}`, error: (e) => e.message })}
            disabled={poll.isPending}
          >
            {poll.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Poll now
          </Button>
        }
      />

      <Tabs value={scope} onValueChange={(v) => navigate({ search: v === 'all' ? { scope: 'all' } : {} })} className="mb-4">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="all">All stored</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? <LoadingBlock rows={8} /> : error ? <ErrorBlock error={error} /> : !events?.length ? (
        <Empty>No events stored yet. Run a poll to fetch them from Meetup.</Empty>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead className="text-right">Going</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Waitlist</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Not going</TableHead>
                <TableHead className="hidden text-right md:table-cell"><MessageSquare className="ml-auto size-4" /></TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow
                  key={e.event_id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: '/g/$guildId/events/$eventId', params: { guildId, eventId: e.event_id } })}
                >
                  <TableCell className="whitespace-nowrap">
                    <div className="font-medium">{formatEventDate(e.date_time)}</div>
                    <div className="text-xs text-muted-foreground">{relative(e.date_time)}</div>
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/g/$guildId/events/$eventId"
                      params={{ guildId, eventId: e.event_id }}
                      className="font-medium hover:text-primary hover:underline"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {e.title}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{e.event_id}</div>
                  </TableCell>
                  <TableCell className="hidden max-w-64 truncate text-muted-foreground lg:table-cell" title={e.location || ''}>{e.location || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.rsvps.tracked ? <><b>{e.rsvps.going}</b>{e.rsvps.guests > 0 && <span className="text-xs text-muted-foreground"> +{e.rsvps.guests}g</span>}</> : <span className="text-muted-foreground" title="RSVPs are fetched when the event is within 24 hours">{e.rsvp_count}</span>}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{e.rsvps.tracked ? e.rsvps.waitlist : '—'}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{e.rsvps.tracked ? e.rsvps.notGoing : '—'}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{e.commentCount || '—'}</TableCell>
                  <TableCell><EventStatusBadge event={e} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  )
}
