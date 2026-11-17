import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Markdown } from '@/components/markdown'
import type { CommandDoc, CommandOption } from '@/lib/docs'

function limits(o: CommandOption) {
  const parts = []
  if (o.autocomplete) parts.push('suggestions as you type')
  if (o.choices) parts.push(`one of: ${o.choices.join(', ')}`)
  if (o.min != null && o.max != null) parts.push(o.type === 'text' ? `${o.min}–${o.max} characters` : `${o.min}–${o.max}`)
  else if (o.max != null) parts.push(o.type === 'text' ? `up to ${o.max} characters` : `max ${o.max}`)
  else if (o.min != null) parts.push(`min ${o.min}`)
  if (o.channelTypes) parts.push(o.channelTypes)
  return parts.join(' · ')
}

function OptionsTable({ options }: { options: CommandOption[] }) {
  if (!options.length) return null
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Option</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Limits</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {options.map((o) => (
          <TableRow key={o.name}>
            <TableCell className="whitespace-nowrap font-mono text-xs">{o.name}{o.required ? '' : <span className="text-muted-foreground"> (optional)</span>}</TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">{o.type}</TableCell>
            <TableCell>{o.description}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{limits(o)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** A slash command: generated reference (from the bot's own definition) + usage notes. */
export function CommandDocCard({ cmd, linkTitle = false }: { cmd: CommandDoc; linkTitle?: boolean }) {
  const title = <span className="font-mono text-lg font-semibold">/{cmd.name}</span>
  return (
    <Card id={cmd.name} className="scroll-mt-20">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {linkTitle ? <Link to="/docs/commands/$name" params={{ name: cmd.name }} className="hover:text-primary">{title}</Link> : title}
          <Badge variant={cmd.permission === 'Everyone' ? 'secondary' : 'outline'}>{cmd.permission === 'Everyone' ? 'Everyone' : `Requires ${cmd.permission}`}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{cmd.description}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {cmd.subcommands.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Subcommand</TableHead><TableHead>Description</TableHead><TableHead>Options</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {cmd.subcommands.map((s) => (
                <TableRow key={s.name}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">/{cmd.name} {s.name}</TableCell>
                  <TableCell>{s.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(s.options || []).map((o) => (
                      <div key={o.name}><span className="font-mono text-foreground">{o.name}</span>{o.required ? '' : ' (optional)'}: {o.type}{limits(o) ? ` · ${limits(o)}` : ''}</div>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <OptionsTable options={cmd.options} />
        {cmd.guide && <Markdown>{cmd.guide}</Markdown>}
      </CardContent>
    </Card>
  )
}
