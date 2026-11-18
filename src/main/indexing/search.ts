import type { SearchMatchKind, SearchResult } from '@shared/types'
import type { IndexedNote } from './indexer'

/**
 * Vault-wide search over titles, aliases, headings, tags, paths, link text and
 * content. Multi-word queries require every term to match somewhere in the
 * note; ranking favours title and heading matches.
 */

const KIND_WEIGHT: Record<SearchMatchKind, number> = {
  title: 1000,
  alias: 800,
  heading: 500,
  tag: 400,
  path: 300,
  link: 200,
  content: 100
}

function snippetAround(text: string, lowerText: string, term: string, radius = 70): { snippet: string; highlight: [number, number] } | null {
  let idx = lowerText.indexOf(term)
  let source = text
  if (idx < 0) return null
  if (lowerText.length !== text.length) {
    // Lower-casing changed the length (rare Unicode cases): fall back to the lowered text.
    source = lowerText
  }
  const start = Math.max(0, idx - radius)
  const end = Math.min(source.length, idx + term.length + radius)
  let snippet = source.slice(start, end).replace(/\s+/g, ' ')
  // Recompute highlight position after whitespace collapsing.
  const prefix = source.slice(start, idx).replace(/\s+/g, ' ')
  let offset = prefix.length
  if (start > 0) {
    snippet = `…${snippet}`
    offset += 1
  }
  if (end < source.length) snippet = `${snippet}…`
  idx = offset
  return { snippet, highlight: [idx, idx + term.length] }
}

export function searchNotes(notes: Iterable<IndexedNote>, rawQuery: string, limit = 40): SearchResult[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return []
  let tagQuery = false
  let q = query
  if (q.startsWith('#')) {
    tagQuery = true
    q = q.slice(1)
  }
  const terms = q.split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const phrase = terms.join(' ')

  const results: SearchResult[] = []
  for (const note of notes) {
    const title = note.title.toLowerCase()
    const tags = note.tags.map((t) => t.toLowerCase())
    if (tagQuery) {
      const hit = tags.find((t) => t === phrase || t.startsWith(`${phrase}/`) || t.startsWith(phrase))
      if (hit) {
        results.push({
          id: note.id,
          title: note.title,
          path: note.id,
          category: note.category,
          kind: 'tag',
          snippet: `#${hit}`,
          score: KIND_WEIGHT.tag + (hit === phrase ? 100 : 0)
        })
      }
      continue
    }

    const path = note.id.toLowerCase()
    const aliases = note.aliases.map((a) => a.toLowerCase())
    const headings = note.headings.map((h) => h.text.toLowerCase())
    const linkText = note.links.map((l) => `${l.target} ${l.display ?? ''}`.toLowerCase()).join(' \n ')

    let best: { kind: SearchMatchKind; score: number; snippet?: string; highlight?: [number, number] } | null = null
    let allTermsFound = true
    for (const term of terms) {
      const found =
        title.includes(term) ||
        aliases.some((a) => a.includes(term)) ||
        headings.some((h) => h.includes(term)) ||
        tags.some((t) => t.includes(term)) ||
        path.includes(term) ||
        linkText.includes(term) ||
        note.searchText.includes(term)
      if (!found) {
        allTermsFound = false
        break
      }
    }
    if (!allTermsFound) continue

    const consider = (kind: SearchMatchKind, bonus: number, snippet?: string, highlight?: [number, number]) => {
      const score = KIND_WEIGHT[kind] + bonus
      if (!best || score > best.score) best = { kind, score, snippet, highlight }
    }

    const titleIdx = title.indexOf(phrase)
    if (titleIdx >= 0) {
      const bonus = title === phrase ? 400 : titleIdx === 0 ? 200 : 50
      consider('title', bonus - Math.min(title.length, 100) * 0.5, undefined, [titleIdx, titleIdx + phrase.length])
    } else if (terms.every((t) => title.includes(t))) {
      consider('title', -100)
    }
    const alias = aliases.findIndex((a) => a.includes(phrase))
    if (alias >= 0) consider('alias', aliases[alias] === phrase ? 150 : 0, note.aliases[alias])
    const heading = headings.findIndex((h) => h.includes(phrase))
    if (heading >= 0) {
      const h = note.headings[heading].text
      const i = headings[heading].indexOf(phrase)
      consider('heading', headings[heading] === phrase ? 100 : 0, h, [i, i + phrase.length])
    }
    const tag = tags.find((t) => t.includes(phrase))
    if (tag) consider('tag', tag === phrase ? 100 : 0, `#${tag}`)
    const pathIdx = path.indexOf(phrase)
    if (pathIdx >= 0) consider('path', 0, note.id, [pathIdx, pathIdx + phrase.length])
    if (linkText.includes(phrase)) {
      const l = note.links.find((x) => `${x.target} ${x.display ?? ''}`.toLowerCase().includes(phrase))
      consider('link', 0, l ? `→ ${l.display ?? l.target}` : undefined)
    }
    if (!best || (best as { kind: SearchMatchKind }).kind === 'path') {
      const s = snippetAround(note.body, note.searchText, phrase) ?? snippetAround(note.body, note.searchText, terms[0])
      if (s) {
        let occurrences = 0
        let from = 0
        while (occurrences < 20) {
          const i = note.searchText.indexOf(terms[0], from)
          if (i < 0) break
          occurrences++
          from = i + terms[0].length
        }
        consider('content', occurrences * 4, s.snippet, s.highlight)
      }
    }
    if (!best) consider('content', 0)
    const b = best as unknown as { kind: SearchMatchKind; score: number; snippet?: string; highlight?: [number, number] }
    // Well-connected notes rank slightly higher among equals.
    const connectivity = Math.min(note.backlinks.length + note.outgoing.length, 50)
    results.push({
      id: note.id,
      title: note.title,
      path: note.id,
      category: note.category,
      kind: b.kind,
      snippet: b.snippet,
      highlight: b.highlight,
      score: b.score + connectivity
    })
  }
  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  return results.slice(0, limit)
}
