import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/common'
import { CodeBlock } from '@/components/code-block'
import { rollcallQueriesQuery } from '@/lib/docs'

export const Route = createFileRoute('/_app/docs/api/queries')({
  loader: ({ context }) => context.queryClient.ensureQueryData(rollcallQueriesQuery),
  component: QueriesPage,
})

function QueriesPage() {
  const { data, error, isLoading } = useQuery(rollcallQueriesQuery)
  if (isLoading) return <LoadingBlock rows={8} />
  if (error || !data) return <ErrorBlock error={error} />
  return (
    <>
      <PageHeader
        title="Rollcall's queries"
        description={<>Every GraphQL document the bot sends to Meetup, read from the running code (<code>src/services/meetup-api/queries.js</code>), so this is exactly what's deployed.</>}
      />
      <nav className="mb-6 flex flex-wrap gap-2">
        {data.map((q) => <a key={q.constant} href={`#${q.operation}`} className="rounded-md border px-2 py-1 font-mono text-xs hover:bg-accent">{q.operation}</a>)}
      </nav>
      <div className="space-y-8">
        {data.map((q) => (
          <section key={q.constant} id={q.operation} className="scroll-mt-20 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-base font-semibold">{q.operation}</h2>
              <Badge variant={q.kind === 'mutation' ? 'destructive' : 'secondary'}>{q.kind === 'mutation' ? 'mutation (writes)' : 'query'}</Badge>
              <span className="text-xs text-muted-foreground">{q.constant}</span>
            </div>
            <CodeBlock code={q.text} />
          </section>
        ))}
      </div>
    </>
  )
}
