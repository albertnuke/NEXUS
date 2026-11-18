import type { Category } from '@shared/types'

/**
 * Groups notes into constellations. Explicit information wins:
 *   1. frontmatter `category`
 *   2. folder structure (first meaningful folder level)
 *   3. for root-level notes: the majority category of linked notes
 *   4. otherwise the note's first tag (when shared by several notes)
 * Vaults without any folder structure fall back to link-graph communities
 * (deterministic label propagation).
 */

export interface CategorizableNote {
  id: string
  title: string
  folder: string
  tags: string[]
  frontmatterCategory?: string
  neighbors: string[] // undirected resolved neighbors
}

export interface CategoryAssignment {
  byNote: Map<string, string>
  categories: Category[]
}

export const MAX_CATEGORIES = 16
const UNFILED = 'Unfiled'
const OTHER = 'Other'

function titleCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toLocaleUpperCase() + w.slice(1))
    .join(' ')
}

/** Finds the folder prefix shared by (almost) every note, so we can descend into it. */
function commonFolderPrefix(notes: CategorizableNote[]): string[] {
  const prefix: string[] = []
  for (let depth = 0; depth < 3; depth++) {
    const counts = new Map<string, number>()
    let atThisLevel = 0
    for (const n of notes) {
      const segs = n.folder ? n.folder.split('/') : []
      if (segs.length <= depth) continue
      if (prefix.some((p, i) => segs[i] !== p)) continue
      atThisLevel++
      counts.set(segs[depth], (counts.get(segs[depth]) ?? 0) + 1)
    }
    if (counts.size !== 1 || atThisLevel < notes.length * 0.9) break
    const [only] = [...counts.keys()]
    // Only descend when the single folder actually has sub-structure.
    const deeper = notes.some((n) => {
      const segs = n.folder ? n.folder.split('/') : []
      return segs.length > depth + 1 && segs[depth] === only
    })
    if (!deeper) break
    prefix.push(only)
  }
  return prefix
}

function labelPropagation(notes: CategorizableNote[]): Map<string, string> {
  const ids = notes.map((n) => n.id).sort()
  const neighbors = new Map(notes.map((n) => [n.id, n.neighbors]))
  const label = new Map(ids.map((id) => [id, id]))
  for (let iter = 0; iter < 30; iter++) {
    let changed = 0
    for (const id of ids) {
      const counts = new Map<string, number>()
      for (const nb of neighbors.get(id) ?? []) {
        const l = label.get(nb)
        if (l) counts.set(l, (counts.get(l) ?? 0) + 1)
      }
      if (!counts.size) continue
      let best = label.get(id)!
      let bestCount = counts.get(best) ?? 0
      for (const [l, c] of counts) {
        if (c > bestCount || (c === bestCount && l < best)) {
          best = l
          bestCount = c
        }
      }
      if (best !== label.get(id)) {
        label.set(id, best)
        changed++
      }
    }
    if (!changed) break
  }
  return label
}

export function assignCategories(notes: CategorizableNote[]): CategoryAssignment {
  const byNote = new Map<string, string>()
  const source = new Map<string, Category['source']>()
  const prefix = commonFolderPrefix(notes)
  const byId = new Map(notes.map((n) => [n.id, n]))

  const folderCategory = (n: CategorizableNote): string | null => {
    if (!n.folder) return null
    const segs = n.folder.split('/')
    if (prefix.some((p, i) => segs[i] !== p)) return segs[0]
    return segs[prefix.length] ?? null
  }

  const pending: CategorizableNote[] = []
  for (const n of notes) {
    if (n.frontmatterCategory) {
      byNote.set(n.id, n.frontmatterCategory)
      source.set(n.frontmatterCategory, source.get(n.frontmatterCategory) ?? 'frontmatter')
      continue
    }
    const f = folderCategory(n)
    if (f) {
      byNote.set(n.id, f)
      source.set(f, 'folder')
    } else pending.push(n)
  }

  const distinct = new Set(byNote.values())
  if (distinct.size <= 1 && notes.length > 12) {
    // Flat vault: derive constellations from the link graph.
    byNote.clear()
    source.clear()
    const labels = labelPropagation(notes)
    const groups = new Map<string, string[]>()
    for (const [id, l] of labels) {
      const n = byId.get(id)!
      const key = n.neighbors.length === 0 ? '__unlinked__' : l
      const g = groups.get(key)
      if (g) g.push(id)
      else groups.set(key, [id])
    }
    const usedNames = new Set<string>()
    for (const [key, members] of groups) {
      let name: string
      if (key === '__unlinked__') name = 'Unlinked'
      else {
        // Prefer a tag shared by a good share of the members, else the hub note's title.
        const tagCounts = new Map<string, number>()
        for (const id of members) for (const t of byId.get(id)!.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
        const topTag = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
        if (topTag && topTag[1] >= Math.max(2, members.length * 0.3)) name = titleCase(topTag[0].split('/')[0])
        else {
          const hub = members
            .map((id) => byId.get(id)!)
            .sort((a, b) => b.neighbors.length - a.neighbors.length || a.id.localeCompare(b.id))[0]
          name = hub.title
        }
      }
      let unique = name
      let i = 2
      while (usedNames.has(unique)) unique = `${name} ${i++}`
      usedNames.add(unique)
      for (const id of members) byNote.set(id, unique)
      source.set(unique, key === '__unlinked__' ? 'other' : 'community')
    }
  } else {
    // Root-level notes: follow their links (two passes so chains propagate).
    for (let pass = 0; pass < 2; pass++) {
      for (const n of pending) {
        if (byNote.has(n.id)) continue
        const counts = new Map<string, number>()
        for (const nb of n.neighbors) {
          const c = byNote.get(nb)
          if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
        }
        const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
        if (best && (pass === 1 || best[1] >= 1)) byNote.set(n.id, best[0])
      }
    }
    const tagCounts = new Map<string, number>()
    for (const n of pending) if (!byNote.has(n.id) && n.tags[0]) {
      const t = n.tags[0].split('/')[0]
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
    }
    for (const n of pending) {
      if (byNote.has(n.id)) continue
      const t = n.tags[0]?.split('/')[0]
      if (t && (tagCounts.get(t) ?? 0) >= 3) {
        const name = titleCase(t)
        byNote.set(n.id, name)
        source.set(name, source.get(name) ?? 'tag')
      } else {
        byNote.set(n.id, UNFILED)
        source.set(UNFILED, 'other')
      }
    }
  }

  // Cap the number of constellations so labels stay readable.
  let counts = countBy(byNote)
  if (counts.size > MAX_CATEGORIES) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    const keep = new Set(ranked.slice(0, MAX_CATEGORIES - 1).map(([k]) => k))
    for (const [id, c] of byNote) if (!keep.has(c)) byNote.set(id, OTHER)
    source.set(OTHER, 'other')
    counts = countBy(byNote)
  }

  const categories: Category[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, noteCount]) => ({ id: name, name, noteCount, source: source.get(name) ?? 'folder' }))
  return { byNote, categories }
}

function countBy(map: Map<string, string>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const c of map.values()) counts.set(c, (counts.get(c) ?? 0) + 1)
  return counts
}
