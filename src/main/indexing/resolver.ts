import { posix } from 'node:path'
import type { LinkKind } from '@shared/types'

/**
 * Obsidian-compatible link resolution.
 *
 * Resolution never uses fuzzy matching: a link resolves only to a file whose
 * path or exact basename (case-insensitive, Unicode NFC normalised) matches.
 * When several files share a basename, the candidate closest to the source
 * note wins (same folder, then deepest shared folder, then shortest path),
 * which mirrors how Obsidian disambiguates `[[Name]]`.
 */

export interface ResolvableNote {
  id: string // vault-relative POSIX path including extension
  aliases: string[]
}

const NOTE_EXTENSIONS = ['.md', '.txt']

export function normalizeKey(value: string): string {
  return value.normalize('NFC').toLowerCase()
}

function stripNoteExt(p: string): string {
  const lower = p.toLowerCase()
  for (const ext of NOTE_EXTENSIONS) if (lower.endsWith(ext)) return p.slice(0, -ext.length)
  return p
}

function folderOf(id: string): string {
  const i = id.lastIndexOf('/')
  return i < 0 ? '' : id.slice(0, i)
}

function sharedPrefixDepth(a: string, b: string): number {
  if (!a || !b) return 0
  const as = a.split('/')
  const bs = b.split('/')
  let n = 0
  while (n < as.length && n < bs.length && as[n] === bs[n]) n++
  return n
}

export class LinkResolver {
  private byPath = new Map<string, string>() // normalized path (with ext) → id
  private byPathNoExt = new Map<string, string[]>() // normalized path without ext → ids
  private byName = new Map<string, string[]>() // normalized basename without ext → ids
  private byAlias = new Map<string, string[]>()

  constructor(notes: Iterable<ResolvableNote>) {
    for (const note of notes) {
      const key = normalizeKey(note.id)
      this.byPath.set(key, note.id)
      const noExt = normalizeKey(stripNoteExt(note.id))
      push(this.byPathNoExt, noExt, note.id)
      const base = noExt.slice(noExt.lastIndexOf('/') + 1)
      push(this.byName, base, note.id)
      for (const alias of note.aliases) {
        const a = normalizeKey(alias.trim())
        if (a) push(this.byAlias, a, note.id)
      }
    }
    for (const list of [this.byPathNoExt, this.byName, this.byAlias]) {
      for (const ids of list.values()) ids.sort()
    }
  }

  /**
   * Resolves a link target written in `sourceId` to a note id, or null when the
   * target is not a note in the vault (unresolved link or attachment).
   */
  resolve(rawTarget: string, sourceId: string, kind: LinkKind): string | null {
    let target = rawTarget.normalize('NFC').replace(/\\/g, '/').trim()
    if (!target) return null
    const sourceFolder = folderOf(sourceId)

    const isRelative = target.startsWith('./') || target.startsWith('../')
    if (target.startsWith('/')) target = target.replace(/^\/+/, '')

    const candidatesInOrder: string[] = []
    const relativeToSource = posix.normalize(posix.join(sourceFolder, target))
    if (kind === 'markdown' || isRelative) {
      // Markdown links are relative to the source note first.
      candidatesInOrder.push(relativeToSource, target)
    } else {
      candidatesInOrder.push(target, relativeToSource)
    }

    for (const candidate of candidatesInOrder) {
      if (candidate.startsWith('../')) continue // outside the vault
      const key = normalizeKey(candidate)
      const exact = this.byPath.get(key)
      if (exact) return exact
      const withMd = this.byPath.get(`${key}.md`)
      if (withMd) return withMd
      const withTxt = this.byPath.get(`${key}.txt`)
      if (withTxt) return withTxt
    }
    if (isRelative) return null

    const cleaned = normalizeKey(stripNoteExt(target))
    if (!cleaned) return null

    if (cleaned.includes('/')) {
      // Partial path: match notes whose path ends with `/<target>`.
      const matches: string[] = []
      for (const [noExt, ids] of this.byPathNoExt) {
        if (noExt === cleaned || noExt.endsWith(`/${cleaned}`)) matches.push(...ids)
      }
      if (matches.length) return pickClosest(matches, sourceId)
      return null
    }

    const byName = this.byName.get(cleaned)
    if (byName?.length) return pickClosest(byName, sourceId)

    // Explicit frontmatter aliases are honoured only when unambiguous.
    const byAlias = this.byAlias.get(normalizeKey(target))
    if (byAlias && byAlias.length === 1) return byAlias[0]
    return null
  }
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key)
  if (list) {
    if (!list.includes(value)) list.push(value)
  } else map.set(key, [value])
}

export function pickClosest(candidates: string[], sourceId: string): string {
  if (candidates.length === 1) return candidates[0]
  const sourceFolder = folderOf(sourceId)
  let best = candidates[0]
  let bestScore = -Infinity
  for (const id of candidates) {
    const folder = folderOf(id)
    const sameFolder = folder === sourceFolder ? 1 : 0
    const shared = sharedPrefixDepth(folder, sourceFolder)
    const depth = id.split('/').length
    // Same folder dominates, then deeper shared ancestry, then shallower files.
    const score = sameFolder * 1e6 + shared * 1e3 - depth
    if (score > bestScore || (score === bestScore && id < best)) {
      best = id
      bestScore = score
    }
  }
  return best
}
