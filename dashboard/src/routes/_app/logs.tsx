import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Pause, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common'
import { api, type LogLine } from '@/lib/api'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/logs')({ component: LogsPage })

const MAX = 2000

function LogsPage() {
  const [lines, setLines] = useState<LogLine[]>([])
  const [paused, setPaused] = useState(false)
  const [level, setLevel] = useState<'all' | 'warn' | 'error'>('all')
  const [filter, setFilter] = useState('')
  const lastId = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  // Incremental tail: ask only for lines newer than the last one we have.
  useEffect(() => {
    if (paused) return
    let cancelled = false
    const tick = async () => {
      try {
        const next = await api<LogLine[]>(`/logs?after=${lastId.current}&limit=1000`)
        if (cancelled || !next.length) return
        lastId.current = next[next.length - 1].id
        setLines((prev) => [...prev, ...next].slice(-MAX))
      } catch { /* shown on next tick */ }
    }
    tick()
    const t = setInterval(tick, 2000)
    return () => { cancelled = true; clearInterval(t) }
  }, [paused])

  const shown = useMemo(() => {
    const q = filter.toLowerCase()
    return lines.filter((l) => (level === 'all' || (level === 'warn' ? l.level !== 'info' : l.level === 'error')) && (!q || l.msg.toLowerCase().includes(q)))
  }, [lines, level, filter])

  useEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [shown])

  return (
    <>
      <PageHeader
        title="Logs"
        description="Live output from the bot (last 2,000 lines kept in memory)."
        actions={
          <>
            <Button variant="outline" onClick={() => setPaused((p) => !p)}>{paused ? <><Play /> Resume</> : <><Pause /> Pause</>}</Button>
            <Button variant="outline" onClick={() => setLines([])}><Trash2 /> Clear view</Button>
          </>
        }
      />
      <div className="mb-3 flex flex-col gap-3 sm:flex-row">
        <Tabs value={level} onValueChange={(v) => setLevel(v as typeof level)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="warn">Warnings+</TabsTrigger>
            <TabsTrigger value="error">Errors</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:max-w-xs" />
      </div>
      <Card className="overflow-hidden p-0">
        <div
          ref={box}
          onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 }}
          className="h-[65vh] overflow-auto bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-200"
        >
          {shown.length === 0 ? <div className="text-zinc-500">No log lines yet.</div> : shown.map((l) => (
            <div key={l.id} className={cn('whitespace-pre-wrap break-words', l.level === 'warn' && 'text-amber-300', l.level === 'error' && 'text-red-400')}>
              <span className="select-none text-zinc-500">{new Date(l.t).toLocaleTimeString()} </span>{l.msg}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
