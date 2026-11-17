import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import {
  Activity, CalendarDays, ClipboardList, KeyRound, LayoutDashboard, LogOut, Menu, Monitor, Moon, Send, Settings, Sun, Terminal, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { api, guildsQuery, overviewQuery, qk } from '@/lib/api'
import { cn } from '@/lib/utils'

/** The guild in the URL, else the first configured one. */
export function useCurrentGuildId(): string | undefined {
  const params = useParams({ strict: false }) as { guildId?: string }
  const { data: guilds } = useQuery(guildsQuery)
  return params.guildId || guilds?.[0]?.id
}

function NavItem({ to, params, icon: Icon, label, onClick }: { to: string; params?: Record<string, string>; icon: typeof Activity; label: string; onClick?: () => void }) {
  return (
    <Link
      to={to}
      params={params as never}
      onClick={onClick}
      activeOptions={{ exact: to === '/' }}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      activeProps={{ className: '!bg-sidebar-accent !text-sidebar-accent-foreground' }}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const guildId = useCurrentGuildId()
  const { data: guilds = [] } = useQuery(guildsQuery)
  const { data: overview } = useQuery(overviewQuery)
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const guild = guilds.find((g) => g.id === guildId)
  const close = () => setOpen(false)

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    qc.setQueryData(qk.me, { authenticated: false })
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    navigate({ to: '/login', search: { redirect: undefined } })
  }

  const session = overview?.session
  const sessionOk = session && !session.dead && (session.backend !== 'graphql' || session.self)

  const sidebar = (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2 px-1">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ClipboardList className="size-4" />
        </div>
        <div className="leading-tight">
          <div className="font-semibold">Rollcall</div>
          <div className="text-xs text-muted-foreground">{overview ? `v${overview.version}` : ' '}</div>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto md:hidden" onClick={close}><X /></Button>
      </div>

      {guilds.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-start truncate">{guild?.name || 'Choose server'}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Discord server</DropdownMenuLabel>
            {guilds.map((g) => (
              <DropdownMenuItem key={g.id} onSelect={() => navigate({ to: '/g/$guildId/events', params: { guildId: g.id } })}>{g.name}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : guild ? (
        <div className="truncate rounded-md border bg-card px-3 py-2 text-sm">{guild.name}</div>
      ) : null}

      <nav className="flex flex-col gap-1">
        <NavItem to="/" icon={LayoutDashboard} label="Overview" onClick={close} />
        {guildId && <NavItem to="/g/$guildId/events" params={{ guildId }} icon={CalendarDays} label="Events" onClick={close} />}
        <NavItem to="/health" icon={Activity} label="API health" onClick={close} />
        <NavItem to="/session" icon={KeyRound} label="Meetup session" onClick={close} />
        <NavItem to="/logs" icon={Terminal} label="Logs" onClick={close} />
        {overview?.dryRun && <NavItem to="/outbox" icon={Send} label="Discord outbox" onClick={close} />}
        {guildId && <NavItem to="/g/$guildId/settings" params={{ guildId }} icon={Settings} label="Settings" onClick={close} />}
      </nav>

      <div className="mt-auto space-y-3">
        {session && (
          <Link to="/session" onClick={close} className="block rounded-md border bg-card p-3 text-xs transition-colors hover:bg-accent/50">
            <div className="flex items-center gap-2">
              <span className={cn('size-2 rounded-full', sessionOk ? 'bg-success' : 'bg-destructive')} />
              <span className="font-medium">{sessionOk ? `Meetup: ${session.self?.name || 'connected'}` : 'Meetup session needs attention'}</span>
            </div>
            <div className="mt-1 text-muted-foreground">Backend: {session.backend}</div>
          </Link>
        )}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Theme">
                {theme === 'dark' ? <Moon /> : theme === 'light' ? <Sun /> : <Monitor />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setTheme('light')}><Sun /> Light</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTheme('dark')}><Moon /> Dark</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTheme('system')}><Monitor /> System</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" className="ml-auto text-muted-foreground" onClick={logout}><LogOut /> Sign out</Button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-svh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-svh border-r bg-sidebar md:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r bg-sidebar shadow-xl">{sidebar}</aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/80 px-4 py-2 backdrop-blur md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Menu"><Menu /></Button>
          <span className="font-semibold">Rollcall</span>
        </header>
        {overview?.dryRun && (
          <div className="border-b bg-warning/15 px-4 py-1.5 text-center text-xs font-medium md:px-8">
            Dry run — Discord posts are recorded in the <Link to="/outbox" className="underline">outbox</Link>, not sent.
            <Badge variant="outline" className="ml-2">local</Badge>
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  )
}
