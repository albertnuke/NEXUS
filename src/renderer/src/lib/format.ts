/** Formatting helpers (all local, no network). */

const DAY = 86400000

export function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 5) return 'Good night.'
  if (h < 12) return 'Good morning.'
  if (h < 18) return 'Good afternoon.'
  return 'Good evening.'
}

export function relativeTime(ms: number, now = Date.now()): string {
  const diff = now - ms
  if (diff < 0) {
    const ahead = -diff
    if (ahead < DAY) return 'today'
    const days = Math.round(ahead / DAY)
    if (days === 1) return 'tomorrow'
    if (days < 14) return `in ${days} days`
    return `on ${shortDate(ms)}`
  }
  const s = Math.floor(diff / 1000)
  if (s < 45) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  return shortDate(ms)
}

export function shortDate(ms: number): string {
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

export function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n)
}

/** Parses an ISO date or a date-only (YYYY-MM-DD) string as local time. */
export function parseLocalDate(value: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Date.parse(`${value}T00:00:00`)
  return Date.parse(value)
}

export const DAY_MS = DAY
