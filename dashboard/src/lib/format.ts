/** SQLite stores UTC as "YYYY-MM-DD HH:MM:SS" without a zone. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

export function formatEventDate(value: string | null | undefined, timeZone?: string) {
  const d = parseDate(value)
  if (!d) return 'TBD'
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone })
}

export function formatDateTime(value: string | null | undefined) {
  const d = parseDate(value)
  if (!d) return '—'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "in 5 minutes", "3 hours ago". */
export function relative(value: string | null | undefined, now = Date.now()) {
  const d = parseDate(value)
  if (!d) return '—'
  const diff = (d.getTime() - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return diff >= 0 ? 'in a few seconds' : 'just now'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

export function duration(ms: number | null | undefined) {
  if (ms == null) return '—'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

export function isPast(value: string | null | undefined) {
  const d = parseDate(value)
  return !!d && d.getTime() < Date.now()
}
