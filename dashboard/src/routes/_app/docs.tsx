import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { docsIndexQuery } from '@/lib/docs'

export const Route = createFileRoute('/_app/docs')({
  loader: ({ context }) => context.queryClient.ensureQueryData(docsIndexQuery),
  component: DocsLayout,
})

function DocLink({ to, params, children }: { to: string; params?: Record<string, string>; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      params={params as never}
      activeOptions={{ exact: true }}
      className="block whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      activeProps={{ className: '!bg-accent !text-accent-foreground font-medium' }}
    >
      {children}
    </Link>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">{title}</div>
      {children}
    </div>
  )
}

function DocsLayout() {
  const { data } = useQuery(docsIndexQuery)
  return (
    <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-8">
      <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b px-4 pb-3 lg:sticky lg:top-6 lg:mx-0 lg:mb-0 lg:block lg:h-[calc(100svh-6rem)] lg:overflow-y-auto lg:border-b-0 lg:px-0 lg:pb-0">
        <Section title="Guide">
          {data?.guide.map((p) => <DocLink key={p.slug} to="/docs/$slug" params={{ slug: p.slug }}>{p.title}</DocLink>)}
        </Section>
        <Section title="Discord">
          <DocLink to="/docs/commands">Commands</DocLink>
        </Section>
        <Section title="Meetup API">
          <DocLink to="/docs/api">API guide</DocLink>
          <DocLink to="/docs/api/queries">Rollcall's queries</DocLink>
          <DocLink to="/docs/api/site">Site operations</DocLink>
        </Section>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
