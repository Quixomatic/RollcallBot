import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorBlock, LoadingBlock } from '@/components/common'
import { CodeBlock } from '@/components/code-block'
import { siteOpQuery, siteOpsQuery } from '@/lib/docs'

export const Route = createFileRoute('/_app/docs/api/site/$name')({
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(siteOpQuery(params.name)),
    context.queryClient.ensureQueryData(siteOpsQuery),
  ]),
  component: SiteOpPage,
})

function SiteOpPage() {
  const { name } = Route.useParams()
  const { data, error, isLoading } = useQuery(siteOpQuery(name))
  const { data: index } = useQuery(siteOpsQuery)
  const meta = index?.operations.find((o) => o.name === name)

  if (isLoading) return <LoadingBlock rows={6} />
  if (error || !data) return <ErrorBlock error={error} />

  // Fragment spreads ("...Name") link to that fragment's page.
  const fragments = [...new Set([...data.text.matchAll(/\.\.\.(\w+)/g)].map((m) => m[1]))]
    .filter((f) => index?.operations.some((o) => o.name === f))

  return (
    <>
      <Link to="/docs/api/site" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All operations
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-xl font-semibold">{name}</h1>
        {meta && <Badge variant={meta.kind === 'mutation' ? 'destructive' : 'secondary'}>{meta.kind}</Badge>}
        {meta?.usedBy && <Badge variant="outline">✅ Rollcall: {meta.usedBy}</Badge>}
      </div>
      {meta && (meta.observed || meta.variables) && (
        <Card className="mb-4 py-4">
          <CardContent className="space-y-1 px-4 text-sm">
            {meta.observed && <div>Seen in live traffic{meta.hash ? <> · persisted hash <code className="text-xs">{meta.hash}</code></> : ''}</div>}
            {meta.variables && <div className="break-all">Example variables: <code className="text-xs">{meta.variables}</code></div>}
          </CardContent>
        </Card>
      )}
      <CodeBlock code={data.text} />
      {fragments.length > 0 && (
        <div className="mt-4 text-sm">
          Uses fragments:{' '}
          {fragments.map((f, i) => (
            <span key={f}>{i > 0 && ', '}<Link to="/docs/api/site/$name" params={{ name: f }} className="font-mono text-primary hover:underline">{f}</Link></span>
          ))}
          <span className="text-muted-foreground"> (shown as <code>{'${…}'}</code> placeholders above)</span>
        </div>
      )}
    </>
  )
}
