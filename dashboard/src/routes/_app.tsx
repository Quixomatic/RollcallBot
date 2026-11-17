import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/app-shell'
import { guildsQuery, meQuery } from '@/lib/api'

// Everything except /login lives under this authenticated layout.
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.fetchQuery(meQuery)
    if (!me.authenticated) throw redirect({ to: '/login', search: { redirect: location.href } })
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(guildsQuery),
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})
