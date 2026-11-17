import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Empty, LoadingBlock, PageHeader } from '@/components/common'
import { outboxQuery, type OutboxEntry } from '@/lib/api'
import { relative } from '@/lib/format'

export const Route = createFileRoute('/_app/outbox')({ component: OutboxPage })

function OutboxPage() {
  const { data, isLoading } = useQuery(outboxQuery)
  const entries = [...(data || [])].reverse()
  return (
    <>
      <PageHeader title="Discord outbox" description="Dry run: everything the bot would have posted, edited or deleted in Discord, newest first." />
      {isLoading ? <LoadingBlock /> : entries.length === 0 ? <Empty>Nothing yet — run a poll or a rescan.</Empty> : (
        <div className="space-y-4">
          {entries.map((e, i) => <OutboxItem key={i} entry={e} />)}
        </div>
      )}
    </>
  )
}

/** Renders like a Discord embed so posts can be checked before going live. */
function OutboxItem({ entry }: { entry: OutboxEntry }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={entry.action === 'delete' ? 'destructive' : entry.action === 'edit' ? 'secondary' : 'default'}>{entry.action}</Badge>
        <span className="font-medium text-foreground">#{entry.channel}</span>
        <span>message {entry.messageId}</span>
        <span className="ml-auto">{relative(entry.at)}</span>
      </div>
      {entry.content && <p className="mb-2 text-sm">{entry.content}</p>}
      {entry.embeds.map((em, i) => (
        <div key={i} className="max-w-xl rounded-md border-l-4 bg-[#2b2d31] p-3 text-sm text-[#dbdee1]" style={{ borderLeftColor: em.color != null ? `#${em.color.toString(16).padStart(6, '0')}` : '#5865f2' }}>
          {em.title && (em.url ? <a href={em.url} target="_blank" rel="noreferrer" className="font-semibold text-[#00a8fc] hover:underline">{em.title}</a> : <div className="font-semibold text-white">{em.title}</div>)}
          {em.description && <div className="mt-1 whitespace-pre-wrap"><DiscordMarkdown text={em.description} /></div>}
          {em.fields && em.fields.length > 0 && (
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {em.fields.map((f, j) => (
                <div key={j} className={f.inline ? '' : 'sm:col-span-3'}>
                  <div className="text-xs font-semibold text-white">{f.name}</div>
                  <div className="whitespace-pre-wrap text-[13px]"><DiscordMarkdown text={f.value} /></div>
                </div>
              ))}
            </div>
          )}
          {em.footer && <div className="mt-2 text-xs text-[#949ba4]">{em.footer.text}</div>}
        </div>
      ))}
    </div>
  )
}

/** Just enough of Discord's markdown for our embeds: **bold**, *italic*, `code`, > quotes. */
function DiscordMarkdown({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const quote = line.startsWith('> ')
        const parts = (quote ? line.slice(2) : line).split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g)
        const rendered = parts.map((p, j) => {
          if (p.startsWith('**') && p.endsWith('**')) return <b key={j} className="text-white">{p.slice(2, -2)}</b>
          if (p.startsWith('`') && p.endsWith('`')) return <code key={j} className="rounded bg-[#1e1f22] px-1 text-[12px]">{p.slice(1, -1)}</code>
          if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <i key={j}>{p.slice(1, -1)}</i>
          return <span key={j}>{p}</span>
        })
        return quote
          ? <div key={i} className="border-l-4 border-[#4e5058] pl-2">{rendered}</div>
          : <div key={i}>{rendered.length ? rendered : ' '}</div>
      })}
    </>
  )
}
