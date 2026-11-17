import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/common'
import { api, qk, settingsQuery, type GuildSettings, type SettingsResponse } from '@/lib/api'

export const Route = createFileRoute('/_app/g/$guildId/settings')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(settingsQuery(params.guildId)),
  component: SettingsPage,
})

type Form = Omit<GuildSettings, 'guild_id' | 'enabled' | 'reminder_day_before'> & { enabled: boolean; reminder_day_before: boolean }
const NONE = '__none__'

function toForm(s: GuildSettings): Form {
  return { ...s, enabled: !!s.enabled, reminder_day_before: !!s.reminder_day_before, reminder_hours_before: s.reminder_hours_before ?? '', timezone: s.timezone || 'America/New_York' }
}

function SettingsPage() {
  const { guildId } = Route.useParams()
  const { data, error, isLoading } = useQuery(settingsQuery(guildId))
  const [form, setForm] = useState<Form | null>(null)
  const qc = useQueryClient()

  useEffect(() => { if (data) setForm(toForm(data.settings)) }, [data])

  const save = useMutation({
    mutationFn: (body: Partial<Form>) => api<{ changes: string[]; settings: GuildSettings }>(`/guilds/${guildId}/settings`, { method: 'PUT', json: body }),
    onSuccess: (r) => {
      toast.success(r.changes.length ? `Saved: ${r.changes.join(', ')}` : 'No changes')
      qc.setQueryData<SettingsResponse>(qk.settings(guildId), (old) => old && { ...old, settings: r.settings })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading || !form) return error ? <ErrorBlock error={error} /> : <LoadingBlock rows={8} />
  if (!data) return <ErrorBlock error={error} />

  const original = toForm(data.settings)
  const dirty = (Object.keys(form) as (keyof Form)[]).filter((k) => form[k] !== original[k])
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => f && { ...f, [k]: v })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    save.mutate(Object.fromEntries(dirty.map((k) => [k, form[k]])) as Partial<Form>)
  }

  const channelSelect = (key: 'events_channel_id' | 'rsvp_channel_id' | 'comments_channel_id' | 'reminders_channel_id', label: string, hint: string) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={form[key] || NONE} onValueChange={(v) => set(key, v === NONE ? null : v)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not set</SelectItem>
          {data.channels.map((c) => <SelectItem key={c.id} value={c.id}>#{c.name}{c.category ? ` · ${c.category}` : ''}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )

  return (
    <form onSubmit={submit}>
      <PageHeader
        title="Settings"
        description={<>Same settings as <code>/config</code> in Discord, for <b>{data.guild.name}</b>.</>}
        actions={
          <Button type="submit" disabled={!dirty.length || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save{dirty.length ? ` (${dirty.length})` : ''}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meetup</CardTitle>
            <CardDescription>The group to monitor{data.credentialsEmail && <> · credentials saved for {data.credentialsEmail}</>}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Polling enabled</div>
                <div className="text-xs text-muted-foreground">Turn off to pause all Meetup checks for this server.</div>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => set('enabled', v)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">Group URL</Label>
              <Input id="url" value={form.meetup_group_url || ''} onChange={(e) => set('meetup_group_url', e.target.value)} placeholder="https://www.meetup.com/your-group/" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="botname">Bot's Meetup name</Label>
              <Input id="botname" value={form.bot_meetup_name || ''} onChange={(e) => set('bot_meetup_name', e.target.value)} placeholder="Eventer" />
              <p className="text-xs text-muted-foreground">Hidden from RSVP lists.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Polling</CardTitle>
            <CardDescription>Quick polls (RSVPs, comments) speed up automatically as an event approaches.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="poll">Full poll every (minutes)</Label>
              <Input id="poll" type="number" min={5} max={60} value={form.poll_interval_minutes} onChange={(e) => set('poll_interval_minutes', Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="horizon">Track events (days ahead)</Label>
              <Input id="horizon" type="number" min={7} max={90} value={form.event_horizon_days} onChange={(e) => set('event_horizon_days', Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="threshold">RSVP edit window (minutes)</Label>
              <Input id="threshold" type="number" min={0} max={60} value={form.rsvp_edit_threshold_minutes} onChange={(e) => set('rsvp_edit_threshold_minutes', Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Edit the RSVP post in place within this window, otherwise repost. 0 = always repost.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tz">Timezone</Label>
              <Input id="tz" value={form.timezone || ''} onChange={(e) => set('timezone', e.target.value)} placeholder="America/New_York" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Discord channels</CardTitle>
            <CardDescription>Where each kind of update is posted.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {channelSelect('events_channel_id', 'Events', 'Changes and cancellations')}
            {channelSelect('rsvp_channel_id', 'RSVPs', 'RSVP summaries')}
            {channelSelect('comments_channel_id', 'Comments', 'New comments')}
            {channelSelect('reminders_channel_id', 'Reminders', 'Event reminders')}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reminders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Day-before reminder</div>
                <div className="text-xs text-muted-foreground">Posted when the event is within 24 hours.</div>
              </div>
              <Switch checked={form.reminder_day_before} onCheckedChange={(v) => set('reminder_day_before', v)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hours">Hours-before reminders</Label>
              <Input id="hours" value={form.reminder_hours_before || ''} onChange={(e) => set('reminder_hours_before', e.target.value)} placeholder="2,1" />
              <p className="text-xs text-muted-foreground">Comma-separated, e.g. "2,1" for reminders 2 hours and 1 hour before. Leave empty for none.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
