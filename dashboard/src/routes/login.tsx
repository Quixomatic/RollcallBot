import { useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, meQuery, qk } from '@/lib/api'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' && search.redirect.startsWith('/') ? search.redirect : undefined,
  }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQuery)
    if (me.authenticated) throw redirect({ to: '/' })
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: to } = Route.useSearch()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/auth/login', { method: 'POST', json: { password } })
      qc.setQueryData(qk.me, { authenticated: true })
      await navigate({ to: to || '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-background via-background to-accent/40 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ClipboardList className="size-6" />
          </div>
          <CardTitle className="text-xl">Rollcall</CardTitle>
          <CardDescription>Sign in to the dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !password}>
              {busy && <Loader2 className="animate-spin" />} Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
