import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/common'
import { CommandDocCard } from '@/components/command-doc'
import { commandsQuery } from '@/lib/docs'

export const Route = createFileRoute('/_app/docs/commands/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(commandsQuery),
  component: CommandsPage,
})

function CommandsPage() {
  const { data, error, isLoading } = useQuery(commandsQuery)
  if (isLoading) return <LoadingBlock rows={8} />
  if (error || !data) return <ErrorBlock error={error} />

  return (
    <>
      <PageHeader
        title="Discord commands"
        description="Generated from the commands this bot registers with Discord, so options, limits and permissions are always current. Admin-only commands are hidden from members without the permission."
      />
      <Card className="mb-8 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Command</TableHead><TableHead>What it does</TableHead><TableHead>Who can use it</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.name}>
                <TableCell className="whitespace-nowrap font-mono">
                  <Link to="/docs/commands/$name" params={{ name: c.name }} className="text-primary hover:underline">/{c.name}</Link>
                </TableCell>
                <TableCell>{c.description}</TableCell>
                <TableCell><Badge variant={c.permission === 'Everyone' ? 'secondary' : 'outline'}>{c.permission}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="space-y-6">
        {data.map((c) => <CommandDocCard key={c.name} cmd={c} linkTitle />)}
      </div>
    </>
  )
}
