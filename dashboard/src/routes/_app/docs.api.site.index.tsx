import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/common'
import { siteOpsQuery, type SiteOperation } from '@/lib/docs'

export const Route = createFileRoute('/_app/docs/api/site/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(siteOpsQuery),
  component: SiteOpsPage,
})

type Kind = 'all' | SiteOperation['kind']

function SiteOpsPage() {
  const { data, error, isLoading } = useQuery(siteOpsQuery)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [onlyUsed, setOnlyUsed] = useState(false)

  const ops = useMemo(() => (data?.operations || []).filter((o) =>
    (kind === 'all' || o.kind === kind)
    && (!onlyUsed || o.usedBy)
    && (!q || o.name.toLowerCase().includes(q.toLowerCase()))), [data, q, kind, onlyUsed])

  if (isLoading) return <LoadingBlock rows={10} />
  if (error || !data) return <ErrorBlock error={error} />

  const count = (k: Kind) => (k === 'all' ? data.operations.length : data.operations.filter((o) => o.kind === k).length)
  const build = data.intro.match(/build `([^`]+)`/)?.[1]
  const date = data.intro.match(/on (\d{4}-\d{2}-\d{2})/)?.[1]

  return (
    <>
      <PageHeader
        title="meetup.com's operations"
        description={<>Every GraphQL operation and fragment in meetup.com's web app{build ? <> (build <code>{build.slice(0, 10)}</code>{date ? `, captured ${date}` : ''})</> : ''}. Recapture and diff this snapshot to see what Meetup changed. ✅ marks the ones Rollcall's own queries are based on.</>}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input placeholder="Search operations…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs" />
        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <TabsList>
            {(['all', 'query', 'mutation', 'fragment'] as Kind[]).map((k) => (
              <TabsTrigger key={k} value={k}>{k === 'all' ? 'All' : `${k[0].toUpperCase()}${k.slice(1)}s`} <span className="ml-1 text-xs text-muted-foreground">{count(k)}</span></TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <label className="flex items-center gap-2 text-sm"><Switch checked={onlyUsed} onCheckedChange={setOnlyUsed} /> Used by Rollcall</label>
      </div>
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Operation</TableHead><TableHead>Kind</TableHead><TableHead>Rollcall</TableHead><TableHead className="hidden md:table-cell">Seen live</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {ops.map((o) => (
              <TableRow key={o.name}>
                <TableCell className="font-mono text-xs">
                  <Link to="/docs/api/site/$name" params={{ name: o.name }} className="text-primary hover:underline">{o.name}</Link>
                </TableCell>
                <TableCell><Badge variant={o.kind === 'mutation' ? 'destructive' : o.kind === 'fragment' ? 'outline' : 'secondary'}>{o.kind}</Badge></TableCell>
                <TableCell className="text-xs">{o.usedBy ? `✅ ${o.usedBy}` : ''}</TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{o.observed ? 'yes' : ''}</TableCell>
              </TableRow>
            ))}
            {ops.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No matches</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
