import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, ExternalLink, Loader2, MapPin, MessageSquare, RefreshCw, Send, UserCheck, UserMinus, UserX, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Empty, ErrorBlock, EventStatusBadge, LikesTag, LoadingBlock, PageHeader, PinnedTag, Stat } from '@/components/common'
import { eventQuery, liveEventQuery, usePostRsvps, useRescanEvent, type LiveComment, type LiveRsvp, type PollEventSummary, type StoredComment, type StoredRsvp } from '@/lib/api'
import { formatDateTime, formatEventDate, relative } from '@/lib/format'

export const Route = createFileRoute('/_app/g/$guildId/events/$eventId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(eventQuery(params.guildId, params.eventId)),
  component: EventPage,
})

const TABS = [
  { status: 'going', label: 'Going', icon: UserCheck, tone: 'text-success' },
  { status: 'waitlist', label: 'Waitlist', icon: UserMinus, tone: 'text-warning' },
  { status: 'not_going', label: 'Not going', icon: UserX, tone: 'text-destructive' },
] as const

function EventPage() {
  const { guildId, eventId } = Route.useParams()
  const { data, error, isLoading } = useQuery(eventQuery(guildId, eventId))
  const [tab, setTab] = useState('rsvps')
  const rescan = useRescanEvent(guildId, eventId)
  const postRsvps = usePostRsvps(guildId, eventId)

  if (isLoading) return <LoadingBlock rows={8} />
  if (error || !data) return <ErrorBlock error={error} />
  const { event, rsvps, comments } = data

  function doRescan() {
    toast.promise(rescan.mutateAsync(), {
      loading: 'Rescanning this event on Meetup…',
      success: (s) => describeRescan(s),
      error: (e) => e.message,
    })
  }

  return (
    <>
      <Link to="/g/$guildId/events" params={{ guildId }} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Events
      </Link>
      <PageHeader
        title={event.title}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={event.url} target="_blank" rel="noreferrer"><ExternalLink /> Meetup</a>
            </Button>
            <Button
              variant="outline"
              disabled={postRsvps.isPending || rsvps.length === 0}
              onClick={() => toast.promise(postRsvps.mutateAsync(), { loading: 'Posting RSVP summary…', success: 'RSVP summary posted to Discord', error: (e) => e.message })}
            >
              {postRsvps.isPending ? <Loader2 className="animate-spin" /> : <Send />} Post RSVP summary
            </Button>
            <Button onClick={doRescan} disabled={rescan.isPending}>
              {rescan.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Rescan now
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><CalendarDays className="size-4" /> {formatEventDate(event.date_time)} ({relative(event.date_time)})</span>
          <span className="flex items-center gap-1.5"><MapPin className="size-4" /> {event.location || 'TBD'}</span>
          <EventStatusBadge event={event} />
        </div>
      </PageHeader>

      {rescan.data && <RescanResult summary={rescan.data} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Going" icon={<Users className="size-4" />} value={event.rsvps.tracked ? event.rsvps.going : event.rsvp_count} hint={event.rsvps.tracked ? `${event.rsvps.goingMembers} members + ${event.rsvps.guests} guests` : 'From the event listing'} />
        <Stat label="Waitlist" value={event.rsvps.tracked ? event.rsvps.waitlist : '—'} hint={!event.rsvps.tracked ? 'Not fetched yet — rescan or wait for the 24h window' : undefined} />
        <Stat label="Not going" value={event.rsvps.tracked ? event.rsvps.notGoing : '—'} />
        <Stat label="Comments" icon={<MessageSquare className="size-4" />} value={comments.length} hint={data.rsvpMessage ? `RSVP summary last posted ${relative(data.rsvpMessage.updated_at)}` : 'No RSVP summary posted yet'} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="rsvps">RSVPs</TabsTrigger>
          <TabsTrigger value="comments">Comments ({comments.length})</TabsTrigger>
          <TabsTrigger value="live">Live from Meetup</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="rsvps" className="mt-4">
          {rsvps.length === 0 ? (
            <Empty>No RSVPs stored for this event yet. They're fetched once it's within 24 hours, or press <b>Rescan now</b>.</Empty>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {TABS.map((t) => <StoredRsvpColumn key={t.status} {...t} rows={rsvps.filter((r) => r.rsvp_status === t.status)} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="comments" className="mt-4">
          {comments.length === 0 ? <Empty>No comments stored for this event.</Empty> : <StoredComments comments={comments} />}
        </TabsContent>

        <TabsContent value="live" className="mt-4">
          {tab === 'live' && <LiveTab guildId={guildId} eventId={eventId} storedRsvps={rsvps} storedComments={comments} />}
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardContent className="space-y-4 text-sm">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted-foreground">Meetup event ID</dt><dd className="font-mono">{event.event_id}</dd>
                <dt className="text-muted-foreground">Starts</dt><dd className="font-mono">{event.date_time}</dd>
                <dt className="text-muted-foreground">First seen</dt><dd>{formatDateTime(event.first_seen_at)}</dd>
                <dt className="text-muted-foreground">Last updated</dt><dd>{formatDateTime(event.updated_at)}</dd>
                <dt className="text-muted-foreground">Reminders sent</dt>
                <dd>{data.reminders.length ? data.reminders.map((r) => `${r.reminder_type.replace('_', ' ')} (${relative(r.sent_at)})`).join(', ') : 'None'}</dd>
              </dl>
              {event.description && (
                <div>
                  <div className="mb-1 font-medium">Description</div>
                  <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-muted-foreground">{event.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}

function describeRescan(s: PollEventSummary) {
  if (s.cancelled) return 'Meetup reports this event as cancelled — cancellation posted'
  const parts = []
  if (s.diffs.length) parts.push(`${s.diffs.length} detail change(s) posted`)
  if (s.rsvps) parts.push(`${s.rsvps.total} RSVPs (${s.rsvps.added.length} added, ${s.rsvps.removed.length} removed, ${s.rsvps.changed.length} changed)`)
  if (s.comments) parts.push(`${s.comments.new} new comment(s)`)
  if (s.errors.length) parts.push(`errors: ${s.errors.join('; ')}`)
  return `Rescan done — ${parts.join(', ') || 'no changes'}`
}

function RescanResult({ summary: s }: { summary: PollEventSummary }) {
  return (
    <Card className="mb-4 border-primary/30 bg-accent/40 py-3">
      <CardContent className="space-y-1 px-4 text-sm">
        <div className="font-medium">Last rescan ({(s.durationMs / 1000).toFixed(1)}s)</div>
        {s.cancelled && <div className="text-destructive">Meetup reports this event as CANCELLED.</div>}
        {s.diffs.map((d) => <div key={d.field}>Changed <b>{d.field}</b>: {d.old || '—'} → {d.new}</div>)}
        {s.rsvps && (
          <div>
            RSVPs: {s.rsvps.total} total
            {s.rsvps.added.length > 0 && <> · added <b>{s.rsvps.added.join(', ')}</b></>}
            {s.rsvps.removed.length > 0 && <> · removed <b>{s.rsvps.removed.join(', ')}</b></>}
            {s.rsvps.changed.length > 0 && <> · changed <b>{s.rsvps.changed.join(', ')}</b></>}
            {s.rsvps.posted ? ' · summary posted to Discord' : ' · no changes, nothing posted'}
          </div>
        )}
        {s.comments && <div>Comments: {s.comments.total} total, {s.comments.new} new{s.comments.new ? ' (posted to Discord)' : ''}</div>}
        {s.errors.map((e) => <div key={e} className="text-destructive">{e}</div>)}
      </CardContent>
    </Card>
  )
}

function StoredRsvpColumn({ label, icon: Icon, tone, rows }: { label: string; icon: typeof Users; tone: string; rows: StoredRsvp[] }) {
  const people = rows.reduce((n, r) => n + 1 + (r.guests || 0), 0)
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
        <Icon className={`size-4 ${tone}`} /> {label}
        <Badge variant="secondary" className="ml-auto tabular-nums">{people}{rows.some((r) => r.guests) && ` (${rows.length}+${people - rows.length})`}</Badge>
      </div>
      {rows.length === 0 ? <div className="p-4 text-sm text-muted-foreground">None</div> : (
        <Table>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.member_name}>
                <TableCell className="w-8 text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell>
                  {r.member_url ? <a href={r.member_url} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">{r.member_name}</a> : r.member_name}
                  <div className="text-xs text-muted-foreground">since {relative(r.first_seen_at)}</div>
                </TableCell>
                <TableCell className="text-right">{r.guests > 0 && <Badge variant="outline">+{r.guests} guest{r.guests > 1 ? 's' : ''}</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

function StoredComments({ comments }: { comments: StoredComment[] }) {
  const threads = useMemo(() => {
    const top = comments.filter((c) => !c.parent_comment_id)
    return top.map((t) => ({ top: t, replies: comments.filter((c) => c.parent_comment_id === t.comment_id) }))
  }, [comments])
  return (
    <div className="space-y-3">
      {threads.map(({ top, replies }) => (
        <Card key={top.comment_id} className="gap-3 py-4">
          <CardContent className="space-y-3 px-4">
            <CommentLine author={top.author_name} text={top.content} likes={top.likes} when={top.posted_at} seen={top.first_seen_at} />
            {replies.map((r) => (
              <div key={r.comment_id} className="ml-6 border-l-2 pl-4">
                <CommentLine author={r.author_name} text={r.content} likes={r.likes} when={r.posted_at} seen={r.first_seen_at} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function CommentLine({ author, text, likes, when, seen, pinned }: { author: string; text: string; likes: number; when?: string | null; seen?: string; pinned?: boolean }) {
  const posted = when && /^\d{4}-/.test(when) ? relative(when) : when
  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{author}</span>
        {posted && <span className="text-xs text-muted-foreground">{posted}</span>}
        {pinned && <PinnedTag />}
        <LikesTag likes={likes} />
        {seen && <span className="ml-auto text-xs text-muted-foreground">seen by Rollcall {relative(seen)}</span>}
      </div>
      <p className="mt-1 whitespace-pre-wrap">{text}</p>
    </div>
  )
}

function LiveTab({ guildId, eventId, storedRsvps, storedComments }: { guildId: string; eventId: string; storedRsvps: StoredRsvp[]; storedComments: StoredComment[] }) {
  const { data, error, isFetching, refetch } = useQuery(liveEventQuery(guildId, eventId))
  if (!data && isFetching) return <LoadingBlock rows={6} />
  if (error) return <ErrorBlock error={error} />
  if (!data) return null

  const storedKey = new Set(storedRsvps.map((r) => `${r.rsvp_status}|${r.member_name}`))
  const liveKey = new Set(data.rsvps.map((r) => `${r.rsvp_status}|${r.member_name}`))
  const notStored = data.rsvps.filter((r) => !storedKey.has(`${r.rsvp_status}|${r.member_name}`))
  const gone = storedRsvps.filter((r) => !liveKey.has(`${r.rsvp_status}|${r.member_name}`))
  const storedIds = new Set(storedComments.map((c) => c.comment_id))
  const newComments = data.comments.filter((c) => !storedIds.has(c.comment_id))

  return (
    <div className="space-y-4">
      <Card className="py-4">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 text-sm">
          <span>Fetched {relative(data.fetchedAt)} via <b>{data.backend}</b></span>
          <span>Meetup status: <b>{data.details.status || 'n/a'}</b></span>
          <span className={notStored.length || gone.length ? 'text-warning' : 'text-success'}>
            {notStored.length || gone.length ? `${notStored.length} RSVP change(s) not yet stored, ${gone.length} gone` : 'Stored RSVPs match Meetup'}
          </span>
          <span className={newComments.length ? 'text-warning' : 'text-success'}>{newComments.length ? `${newComments.length} comment(s) not yet stored` : 'Stored comments match Meetup'}</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refetch
          </Button>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">This is a read-only look at Meetup right now — nothing is stored or posted. Use <b>Rescan now</b> to apply changes and notify Discord.</p>

      <div className="grid gap-4 lg:grid-cols-3">
        {TABS.map((t) => <LiveRsvpColumn key={t.status} label={t.label} rows={data.rsvps.filter((r) => r.rsvp_status === t.status)} storedKey={storedKey} />)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comments on Meetup ({data.comments.length})</CardTitle>
          <CardDescription>As they'd be posted to Discord, oldest first. Highlighted ones haven't been stored yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.comments.length === 0 ? <div className="text-sm text-muted-foreground">No comments.</div> : data.comments.map((c: LiveComment) => (
            <div key={c.comment_id} className={`${c.is_reply ? 'ml-6 border-l-2 pl-4' : ''} ${!storedIds.has(c.comment_id) ? 'rounded-md bg-warning/10 p-2' : ''}`}>
              <CommentLine author={c.author_name} text={c.content} likes={c.likes} when={c.created} pinned={c.is_pinned} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function LiveRsvpColumn({ label, rows, storedKey }: { label: string; rows: LiveRsvp[]; storedKey: Set<string> }) {
  const people = rows.reduce((n, r) => n + 1 + r.guests, 0)
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center border-b px-4 py-3 text-sm font-medium">
        {label}
        <Badge variant="secondary" className="ml-auto tabular-nums">{people}</Badge>
      </div>
      {rows.length === 0 ? <div className="p-4 text-sm text-muted-foreground">None</div> : (
        <Table>
          <TableHeader><TableRow><TableHead>Member</TableHead><TableHead className="text-right">Guests</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.member_id} className={storedKey.has(`${r.rsvp_status}|${r.member_name}`) ? '' : 'bg-warning/10'}>
                <TableCell>
                  <a href={r.member_url} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">{r.member_name}</a>
                  <div className="font-mono text-xs text-muted-foreground">{r.member_id}</div>
                </TableCell>
                <TableCell className="text-right">{r.guests > 0 ? `+${r.guests}` : ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
