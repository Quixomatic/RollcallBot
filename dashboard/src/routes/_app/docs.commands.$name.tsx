import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { ErrorBlock, LoadingBlock } from '@/components/common'
import { CommandDocCard } from '@/components/command-doc'
import { commandsQuery } from '@/lib/docs'

export const Route = createFileRoute('/_app/docs/commands/$name')({
  loader: ({ context }) => context.queryClient.ensureQueryData(commandsQuery),
  component: CommandPage,
})

function CommandPage() {
  const { name } = Route.useParams()
  const { data, error, isLoading } = useQuery(commandsQuery)
  if (isLoading) return <LoadingBlock rows={6} />
  if (error || !data) return <ErrorBlock error={error} />
  const cmd = data.find((c) => c.name === name)
  if (!cmd) return <ErrorBlock error={new Error(`There's no /${name} command`)} />
  return (
    <>
      <Link to="/docs/commands" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All commands
      </Link>
      <CommandDocCard cmd={cmd} />
    </>
  )
}
