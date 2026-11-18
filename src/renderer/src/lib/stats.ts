import type { Category, NoteMeta } from '@shared/types'
import { DAY_MS, parseLocalDate } from './format'

/**
 * Vault analytics computed from real indexed data. Nothing here is estimated
 * or invented: when history is unavailable we report current-period counts.
 */

export interface VaultStats {
  totalNotes: number
  createdLast30: number
  createdWeekly: number[] // last 12 weeks, oldest first
  totalHeadings: number
  headingLevels: number[] // H1..H6
  avgHeadings: number
  totalLinks: number
  unresolvedLinks: number
  degreeBuckets: number[]
  degreeLabels: string[]
  updatedThisWeek: number
  updatedPriorWeek: number
  updatedDaily: number[] // last 7 days, oldest first
  updatedWeeks: number[] // last 26 weeks, oldest first
  groups: Array<{ id: string; name: string; count: number }>
  mostConnected: Array<{ id: string; title: string; degree: number; category: string }>
  recentActivity: Array<{ id: string; title: string; kind: 'created' | 'updated'; at: number; category: string }>
  recentNotes: Array<{ id: string; title: string; at: number; summary: string; category: string }>
  upcoming: Array<{ id: string; title: string; key: string; at: number }>
  totalWords: number
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function computeStats(notes: NoteMeta[], categories: Category[], now = Date.now()): VaultStats {
  const today = startOfDay(now)
  const createdWeekly = new Array(12).fill(0)
  const updatedDaily = new Array(7).fill(0)
  const updatedWeeks = new Array(26).fill(0)
  const headingLevels = new Array(6).fill(0)
  const degreeLabels = ['0', '1', '2', '3–4', '5–8', '9–16', '17+']
  const degreeBuckets = new Array(degreeLabels.length).fill(0)
  let createdLast30 = 0
  let totalHeadings = 0
  let totalLinks = 0
  let unresolvedLinks = 0
  let updatedThisWeek = 0
  let updatedPriorWeek = 0
  let totalWords = 0

  for (const n of notes) {
    totalWords += n.wordCount
    if (n.ctime !== null) {
      const age = now - n.ctime
      if (age >= 0 && age < 30 * DAY_MS) createdLast30++
      const w = Math.floor(age / (7 * DAY_MS))
      if (age >= 0 && w < 12) createdWeekly[11 - w]++
    }
    totalHeadings += n.headings.length
    for (const h of n.headings) headingLevels[Math.min(6, Math.max(1, h.level)) - 1]++
    totalLinks += n.outgoing.length
    unresolvedLinks += n.unresolved.length
    const degree = new Set([...n.outgoing, ...n.backlinks]).size
    const bucket = degree === 0 ? 0 : degree === 1 ? 1 : degree === 2 ? 2 : degree <= 4 ? 3 : degree <= 8 ? 4 : degree <= 16 ? 5 : 6
    degreeBuckets[bucket]++
    const age = now - n.mtime
    if (age < 7 * DAY_MS) updatedThisWeek++
    else if (age < 14 * DAY_MS) updatedPriorWeek++
    const dayIdx = Math.floor((today - startOfDay(n.mtime)) / DAY_MS)
    if (dayIdx >= 0 && dayIdx < 7) updatedDaily[6 - dayIdx]++
    const wk = Math.floor(age / (7 * DAY_MS))
    if (age >= 0 && wk < 26) updatedWeeks[25 - wk]++
  }

  const degreeOf = (n: NoteMeta) => new Set([...n.outgoing, ...n.backlinks]).size
  const mostConnected = [...notes]
    .map((n) => ({ id: n.id, title: n.title, degree: degreeOf(n), category: n.category }))
    .filter((n) => n.degree > 0)
    .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title))
    .slice(0, 8)

  const activity: VaultStats['recentActivity'] = []
  for (const n of notes) {
    activity.push({ id: n.id, title: n.title, kind: 'updated', at: n.mtime, category: n.category })
    if (n.ctime !== null && Math.abs(n.ctime - n.mtime) > 60000) {
      activity.push({ id: n.id, title: n.title, kind: 'created', at: n.ctime, category: n.category })
    }
  }
  activity.sort((a, b) => b.at - a.at)

  const recentNotes = [...notes]
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 6)
    .map((n) => ({
      id: n.id,
      title: n.title,
      at: n.mtime,
      category: n.category,
      summary: n.description || n.excerpt || (n.headings[0]?.text ?? '')
    }))

  const upcoming: VaultStats['upcoming'] = []
  for (const n of notes) {
    for (const d of n.dates) {
      const at = parseLocalDate(d.date)
      if (!Number.isNaN(at) && at >= today && at < today + 45 * DAY_MS) upcoming.push({ id: n.id, title: n.title, key: d.key, at })
    }
  }
  upcoming.sort((a, b) => a.at - b.at)

  return {
    totalNotes: notes.length,
    createdLast30,
    createdWeekly,
    totalHeadings,
    headingLevels,
    avgHeadings: notes.length ? totalHeadings / notes.length : 0,
    totalLinks,
    unresolvedLinks,
    degreeBuckets,
    degreeLabels,
    updatedThisWeek,
    updatedPriorWeek,
    updatedDaily,
    updatedWeeks,
    groups: categories.map((c) => ({ id: c.id, name: c.name, count: c.noteCount })),
    mostConnected,
    recentActivity: activity.slice(0, 9),
    recentNotes,
    upcoming: upcoming.slice(0, 5),
    totalWords
  }
}
