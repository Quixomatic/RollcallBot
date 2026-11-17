import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, FileUp, KeyRound, Loader2, Play, RefreshCw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { LoadingBlock, PageHeader, Stat } from '@/components/common'
import { RemoteLogin } from '@/components/remote-login'
import { api, sessionQuery, useInvalidateData } from '@/lib/api'
import { formatDateTime, relative } from '@/lib/format'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/session')({ component: SessionPage })

function SessionPage() {
  const { data: session, isLoading } = useQuery(sessionQuery)
  const invalidate = useInvalidateData()

  const refresh = useMutation({
    mutationFn: () => api<{ renewed: boolean }>('/session/refresh', { method: 'POST' }),
    onSuccess: (r) => toast.success(r.renewed ? 'Meetup issued a new access token' : 'Meetup returned the current token — the session is fine as it is'),
    onError: (e) => toast.error(e.message),
    onSettled: invalidate,
  })
  const resume = useMutation({
    mutationFn: () => api('/session/resume', { method: 'POST' }),
    onSuccess: () => toast.success('Session re-read; polling resumes on the next cycle'),
    onSettled: invalidate,
  })

  return (
    <>
      <PageHeader title="Meetup session" description="The logged-in Meetup account Rollcall reads data as. A session keeps working until Meetup ends it on their side (typically weeks); when that happens, polling pauses and you upload a new one below." />

      {isLoading || !session ? <LoadingBlock /> : (
        <>
          {session.dead && (
            <Alert variant="destructive" className="mb-4">
              <KeyRound />
              <AlertTitle>Session is no longer valid</AlertTitle>
              <AlertDescription>Polling is paused. Log in with export-session.js and upload the new state.json below.</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Logged in as" value={session.self?.name || (session.backend === 'browser' ? 'n/a (browser)' : '—')} hint={session.self ? `Member ${session.self.id}` : undefined} tone={session.self ? 'ok' : session.backend === 'graphql' ? 'bad' : undefined} />
            <Stat
              label="Status"
              value={session.dead ? 'Needs login' : session.self ? 'Working' : session.backend === 'browser' ? 'n/a' : 'Not logged in'}
              tone={session.dead || (session.backend === 'graphql' && !session.self) ? 'bad' : session.self ? 'ok' : undefined}
              hint={session.checkedAt ? `Verified with Meetup ${relative(session.checkedAt)}` : undefined}
            />
            <Stat
              label="Logged in"
              value={<span className="text-base">{relative(session.tokenIssuedAt || session.stateFileUpdatedAt)}</span>}
              hint={`Token issued ${formatDateTime(session.tokenIssuedAt)} · file saved ${relative(session.stateFileUpdatedAt)}`}
            />
            <Stat label="Backend" value={session.backend === 'graphql' ? 'GraphQL' : 'Browser'} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending || session.backend !== 'graphql'}>
              {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh token now
            </Button>
            <Button variant="outline" onClick={() => resume.mutate()} disabled={resume.isPending}>
              <Play /> Re-read session & resume
            </Button>
          </div>
        </>
      )}

      <RemoteLogin />
      <UploadCard />
    </>
  )
}

function UploadCard() {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const invalidate = useInvalidateData()
  const upload = useMutation({
    mutationFn: async (file: File) => {
      let state: unknown
      try {
        state = JSON.parse(await file.text())
      } catch {
        throw new Error(`${file.name} is not valid JSON`)
      }
      return api<{ self: { id: string; name: string }; backup: string | null }>('/session/upload', { method: 'POST', json: { state } })
    },
    onSuccess: (r) => toast.success(`Session installed — logged in as ${r.self.name}`),
    onError: (e) => toast.error(e.message),
    onSettled: invalidate,
  })

  function onFiles(files: FileList | null) {
    const file = files?.[0]
    if (file) upload.mutate(file)
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Upload className="size-4" /> Upload a new session</CardTitle>
        <CardDescription>
          The <code>state.json</code> from <code>node src/export-session.js</code>. It's checked live against Meetup before it replaces anything;
          the current session is backed up first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files) }}
          disabled={upload.isPending}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:bg-accent/40',
            dragging && 'border-primary bg-accent/60',
          )}
        >
          {upload.isPending ? <Loader2 className="size-8 animate-spin" /> : <FileUp className="size-8" />}
          {upload.isPending ? 'Verifying with Meetup…' : <>Drop <b>state.json</b> here, or click to choose</>}
        </button>
        <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />

        {upload.data && (
          <Alert>
            <CheckCircle2 className="text-success" />
            <AlertTitle>Installed — logged in as {upload.data.self.name}</AlertTitle>
            <AlertDescription>{upload.data.backup ? <>Previous session saved as <code className="break-all">{upload.data.backup}</code></> : 'There was no previous session.'}</AlertDescription>
          </Alert>
        )}

        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">How to get a fresh state.json</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>On your computer, start Chrome with a clean profile: <code>chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\meetup-login https://www.meetup.com/login/</code></li>
            <li>Log in with the bot's Meetup account and solve the captcha.</li>
            <li>Run <code>node src/export-session.js</code> in the Rollcall repo — it writes <code>data/browser-state/state.json</code>.</li>
            <li>Drop that file here. Close Chrome without logging out.</li>
          </ol>
        </details>
      </CardContent>
    </Card>
  )
}
