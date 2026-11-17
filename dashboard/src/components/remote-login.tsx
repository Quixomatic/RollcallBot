import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ClipboardPaste, KeyRound, Loader2, Mail, MonitorPlay, RotateCw, Save, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, useInvalidateData } from '@/lib/api'
import { cn } from '@/lib/utils'

interface RemoteStatus {
  state: 'idle' | 'starting' | 'running' | 'stopping'
  available: boolean
  browser: 'chrome' | 'chromium' | null
  startedAt: string | null
  url: string | null
  error: string | null
  width: number
  height: number
}

const statusQuery = { queryKey: ['remote-login'] as const, queryFn: () => api<RemoteStatus>('/remote-login') }

/**
 * Log in to Meetup through a real Chrome running next to the bot, streamed
 * into this page. Mouse, scroll and keyboard go to the remote page.
 */
export function RemoteLogin() {
  const qc = useQueryClient()
  const invalidate = useInvalidateData()
  const { data: status } = useQuery(statusQuery)
  const setStatus = useCallback((s: RemoteStatus) => qc.setQueryData(statusQuery.queryKey, s), [qc])

  const start = useMutation({
    mutationFn: () => api<RemoteStatus>('/remote-login/start', { method: 'POST' }),
    onSuccess: setStatus,
    onError: (e) => toast.error(e.message),
  })
  const stop = useMutation({
    mutationFn: () => api<RemoteStatus>('/remote-login/stop', { method: 'POST' }),
    onSuccess: setStatus,
  })
  const save = useMutation({
    mutationFn: () => api<{ self: { name: string }; backup: string | null }>('/remote-login/save', { method: 'POST' }),
    onSuccess: (r) => {
      toast.success(`Session saved — logged in as ${r.self.name}. Polling resumes on the next cycle.`)
      qc.invalidateQueries({ queryKey: statusQuery.queryKey })
      invalidate()
    },
    onError: (e) => toast.error(e.message),
  })
  const type = useMutation({
    mutationFn: (field: 'email' | 'password') => api('/remote-login/type', { method: 'POST', json: { field } }),
    onError: (e) => toast.error(e.message),
  })

  const running = status?.state === 'running'

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><MonitorPlay className="size-4" /> Remote login</CardTitle>
        <CardDescription>
          Log in to Meetup through a real Chrome running next to the bot, right here. Use the bot's Meetup account,
          solve the captcha, then press <b>Save session</b>. The browser only runs while you're using it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!status ? null : !status.available ? (
          <p className="text-sm text-destructive">No Chrome or Chromium is installed where the bot runs, so remote login isn't available. Use the upload below instead.</p>
        ) : !running ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => start.mutate()} disabled={start.isPending || status.state === 'starting'}>
              {start.isPending || status.state === 'starting' ? <Loader2 className="animate-spin" /> : <MonitorPlay />} Start remote login
            </Button>
            <span className="text-xs text-muted-foreground">Opens meetup.com/login in a fresh, private browser profile.</span>
            {status.error && <span className="text-xs text-destructive">Last attempt: {status.error}</span>}
          </div>
        ) : (
          <div className="space-y-3">
            <Toolbar
              url={status.url}
              onSave={() => save.mutate()}
              saving={save.isPending}
              onStop={() => stop.mutate()}
              onType={(f) => type.mutate(f)}
            />
            <Viewer />
            <p className="text-xs text-muted-foreground">
              Click inside the screen to focus it, then type normally. <b>Type email</b> / <b>Type password</b> fill your stored
              credentials into the field that has focus. Closes by itself after 15 idle minutes.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Toolbar({ url, onSave, saving, onStop, onType }: { url: string | null; onSave: () => void; saving: boolean; onStop: () => void; onType: (f: 'email' | 'password') => void }) {
  const [address, setAddress] = useState(url || '')
  useEffect(() => setAddress(url || ''), [url])
  const send = (ev: object) => window.dispatchEvent(new CustomEvent('remote-login-send', { detail: ev }))

  async function paste() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) send({ type: 'text', text })
    } catch {
      toast.error('Clipboard access was blocked by the browser')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="icon" variant="outline" title="Back" onClick={() => send({ type: 'back' })}><ArrowLeft /></Button>
      <Button size="icon" variant="outline" title="Reload" onClick={() => send({ type: 'reload' })}><RotateCw /></Button>
      <form className="min-w-48 flex-1" onSubmit={(e) => { e.preventDefault(); send({ type: 'navigate', url: address }) }}>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-9 font-mono text-xs" aria-label="Address" />
      </form>
      <Button variant="outline" size="sm" onClick={() => onType('email')}><Mail /> Type email</Button>
      <Button variant="outline" size="sm" onClick={() => onType('password')}><KeyRound /> Type password</Button>
      <Button variant="outline" size="sm" onClick={paste}><ClipboardPaste /> Paste</Button>
      <Button size="sm" onClick={onSave} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save session</Button>
      <Button size="sm" variant="ghost" onClick={onStop}><Square /> Stop</Button>
    </div>
  )
}

/** The streamed screen: draws frames to a canvas, sends input back. */
function Viewer() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const ws = useRef<WebSocket | null>(null)
  const size = useRef({ width: 1280, height: 900 })
  const [connected, setConnected] = useState(false)
  const qc = useQueryClient()

  const send = useCallback((ev: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(ev))
  }, [])

  useEffect(() => {
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/remote-login/ws`)
    ws.current = socket
    socket.onopen = () => setConnected(true)
    socket.onclose = () => setConnected(false)
    socket.onmessage = (msg) => {
      const data = JSON.parse(msg.data)
      if (data.type === 'frame') {
        size.current = { width: data.width, height: data.height }
        const img = new Image()
        img.onload = () => {
          const c = canvas.current
          if (!c) return
          if (c.width !== data.width || c.height !== data.height) { c.width = data.width; c.height = data.height }
          c.getContext('2d')?.drawImage(img, 0, 0, data.width, data.height)
        }
        img.src = `data:image/jpeg;base64,${data.data}`
      } else if (data.type === 'status') {
        qc.setQueryData(['remote-login'], data.status)
      } else if (data.type === 'error') {
        toast.error(data.message)
      }
    }
    const relay = (e: Event) => send((e as CustomEvent).detail)
    window.addEventListener('remote-login-send', relay)
    return () => {
      window.removeEventListener('remote-login-send', relay)
      socket.close()
    }
  }, [qc, send])

  // Canvas pixel → remote page coordinates.
  const point = (e: React.MouseEvent | React.WheelEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * size.current.width),
      y: Math.round(((e.clientY - r.top) / r.height) * size.current.height),
    }
  }
  const mods = (e: React.MouseEvent | React.KeyboardEvent | React.WheelEvent) => ({ alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey })
  const button = (b: number) => (b === 2 ? 'right' : b === 1 ? 'middle' : 'left')
  const lastMove = useRef(0)

  return (
    <div className="relative overflow-hidden rounded-lg border bg-black">
      {!connected && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-sm text-white">
          <Loader2 className="mr-2 size-4 animate-spin" /> Connecting…
        </div>
      )}
      <canvas
        ref={canvas}
        width={1280}
        height={900}
        tabIndex={0}
        className={cn('block h-auto w-full cursor-default outline-none focus:ring-2 focus:ring-primary')}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => { canvas.current?.focus(); send({ type: 'mouse', action: 'down', ...point(e), button: button(e.button), clickCount: e.detail || 1, ...mods(e) }) }}
        onMouseUp={(e) => send({ type: 'mouse', action: 'up', ...point(e), button: button(e.button), clickCount: e.detail || 1, ...mods(e) })}
        onMouseMove={(e) => {
          const now = performance.now()
          if (now - lastMove.current < 40) return // ~25 moves/s is plenty
          lastMove.current = now
          send({ type: 'mouse', action: 'move', ...point(e), buttons: e.buttons, ...mods(e) })
        }}
        onWheel={(e) => send({ type: 'mouse', action: 'wheel', ...point(e), deltaX: e.deltaX, deltaY: e.deltaY, ...mods(e) })}
        onKeyDown={(e) => {
          // Let the dashboard keep Ctrl/Cmd+V for our own paste handling.
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            e.preventDefault()
            navigator.clipboard.readText().then((text) => text && send({ type: 'text', text })).catch(() => {})
            return
          }
          e.preventDefault()
          send({ type: 'key', action: 'down', key: e.key, code: e.code, keyCode: e.keyCode, ...mods(e) })
        }}
        onKeyUp={(e) => { e.preventDefault(); send({ type: 'key', action: 'up', key: e.key, code: e.code, keyCode: e.keyCode, ...mods(e) }) }}
      />
    </div>
  )
}
