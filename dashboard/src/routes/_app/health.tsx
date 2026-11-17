import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCurrentGuildId } from '@/components/app-shell'
import { Empty, LoadingBlock, PageHeader, ResultIcon } from '@/components/common'
import { api, scrapeLogQuery, type HealthResult } from '@/lib/api'
import { duration, formatDateTime } from '@/lib/format'

export const Route = createFileRoute('/_app/health')({ component: HealthPage })

function HealthPage() {
  const guildId = useCurrentGuildId()
  const [eventUrl, setEventUrl] = useState('')
  const [refresh, setRefresh] = useState(false)
  const check = useMutation({
    mutationFn: () => api<{ results: HealthResult[]; failures: number; eventUrl: string | null }>('/health/check', {
      method: 'POST', json: { eventUrl: eventUrl.trim() || null, refresh },
    }),
  })

  const sections = check.data
    ? [...new Set(check.data.results.map((r) => r.section))].map((s) => ({ name: s, results: check.data!.results.filter((r) => r.section === s) }))
    : []

  return (
    <>
      <PageHeader title="API health" description="Runs every Meetup GraphQL query Rollcall depends on and checks each field and value it reads. If Meetup changes something, the failing check names the exact operation and field." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run checks</CardTitle>
          <CardDescription>Uses the configured Meetup group. Leave the event blank to use the next upcoming one.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="event-url">Event URL (optional)</Label>
            <Input id="event-url" placeholder="https://www.meetup.com/your-group/events/123456789/" value={eventUrl} onChange={(e) => setEventUrl(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={refresh} onCheckedChange={setRefresh} /> Also test token refresh
          </label>
          <Button onClick={() => check.mutate()} disabled={check.isPending}>
            {check.isPending ? <Loader2 className="animate-spin" /> : <Play />} Run checks
          </Button>
        </CardContent>
      </Card>

      {check.error && <p className="mt-4 text-sm text-destructive">{check.error.message}</p>}
      {check.data && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2">
            {check.data.failures ? <Badge variant="destructive">{check.data.failures} failed</Badge> : <Badge className="bg-success text-white">All checks passed</Badge>}
            {check.data.eventUrl && <a className="truncate text-sm text-muted-foreground hover:underline" href={check.data.eventUrl} target="_blank" rel="noreferrer">{check.data.eventUrl}</a>}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {sections.map((s) => (
              <Card key={s.name} className="gap-3 py-4">
                <CardHeader className="px-4"><CardTitle className="flex items-center gap-2 text-sm"><ResultIcon level={s.results.some((r) => r.level === 'fail') ? 'fail' : s.results.some((r) => r.level === 'warn') ? 'warn' : 'ok'} /> {s.name}</CardTitle></CardHeader>
                <CardContent className="space-y-1.5 px-4">
                  {s.results.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm"><ResultIcon level={r.level} /><span className="break-words">{r.msg}</span></div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {guildId && <ScrapeLog guildId={guildId} />}
    </>
  )
}

function ScrapeLog({ guildId }: { guildId: string }) {
  const { data, isLoading } = useQuery(scrapeLogQuery(guildId))
  return (
    <div className="mt-10">
      <h2 className="mb-3 text-lg font-semibold">Scrape history</h2>
      {isLoading ? <LoadingBlock /> : !data?.length ? <Empty>No scrapes recorded yet.</Empty> : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>Result</TableHead><TableHead className="text-right">Duration</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(s.scraped_at)}</TableCell>
                  <TableCell>{s.scrape_type}</TableCell>
                  <TableCell>{s.status === 'success' ? <span className="text-success">success</span> : <span className="text-destructive">{s.error_message || 'error'}</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{duration(s.duration_ms)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
