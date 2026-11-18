import { promises as fs, type Stats } from 'node:fs'
import { basename, join, sep } from 'node:path'
import type { Category, ChangeSummary, GraphEdge, NoteContent, NoteMeta, ParsedLink } from '@shared/types'
import { parseNote, splitFrontmatter } from './parser'
import { LinkResolver } from './resolver'
import { assignCategories } from './categories'
import { discoverNotes, MAX_NOTE_BYTES, isIndexableRelPath, type DiscoveredFile } from '../filesystem/walk'
import { resolveVaultFile } from '../filesystem/pathGuard'

/**
 * In-memory index of a vault. The index is strictly read-only with respect
 * to the vault: files are only ever opened for reading.
 */

export interface IndexedNote {
  id: string
  name: string
  title: string
  folder: string
  ext: string
  links: ParsedLink[]
  externalLinkCount: number
  headings: NoteMeta['headings']
  tags: string[]
  aliases: string[]
  frontmatterCategory?: string
  description?: string
  excerpt: string
  wordCount: number
  dates: NoteMeta['dates']
  mtime: number
  ctime: number | null
  ctimeSource: NoteMeta['ctimeSource']
  size: number
  ino: number
  error?: string
  /** Lower-cased searchable body text (kept in memory only). */
  searchText: string
  body: string
  // Derived by resolveAll()
  outgoing: string[]
  backlinks: string[]
  unresolved: string[]
  category: string
}

export interface IndexProgress {
  phase: 'scanning' | 'indexing'
  done: number
  total: number
}

const READ_CONCURRENCY = 24

function folderOf(id: string): string {
  const i = id.lastIndexOf('/')
  return i < 0 ? '' : id.slice(0, i)
}

function stripExt(name: string): { name: string; ext: string } {
  const i = name.lastIndexOf('.')
  if (i <= 0) return { name, ext: '' }
  return { name: name.slice(0, i), ext: name.slice(i).toLowerCase() }
}

function birthTime(stats: Stats): number | null {
  // APFS/HFS+ report a real birth time; some network/cloud filesystems report 0 or mtime.
  const b = stats.birthtimeMs
  if (!b || b <= 0 || Number.isNaN(b)) return null
  return b
}

export class VaultIndex {
  readonly notes = new Map<string, IndexedNote>()
  edges: GraphEdge[] = []
  categories: Category[] = []
  /** Image attachments (vault-relative paths), used to preview embeds. */
  attachments: string[] = []
  private resolver: LinkResolver | null = null

  constructor(
    readonly rootReal: string,
    readonly includeTxt: boolean
  ) {}

  absPath(id: string): string {
    return join(this.rootReal, ...id.split('/'))
  }

  async fullScan(onProgress?: (p: IndexProgress) => void): Promise<void> {
    onProgress?.({ phase: 'scanning', done: 0, total: 0 })
    const attachments: string[] = []
    const files = await discoverNotes(this.rootReal, this.includeTxt, attachments)
    this.attachments = attachments
    this.notes.clear()
    let done = 0
    const queue = [...files]
    const worker = async () => {
      while (queue.length) {
        const file = queue.shift()!
        const note = await this.readAndParse(file.relPath, file.stats)
        this.notes.set(note.id, note)
        done++
        if (done % 50 === 0) {
          onProgress?.({ phase: 'indexing', done, total: files.length })
          await new Promise((r) => setImmediate(r)) // keep the main process responsive
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, files.length || 1) }, worker))
    onProgress?.({ phase: 'indexing', done, total: files.length })
    this.resolveAll()
  }

  private async readAndParse(id: string, stats: Stats): Promise<IndexedNote> {
    const fileName = id.slice(id.lastIndexOf('/') + 1)
    const { name, ext } = stripExt(fileName)
    const base: IndexedNote = {
      id,
      name,
      title: name,
      folder: folderOf(id),
      ext,
      links: [],
      externalLinkCount: 0,
      headings: [],
      tags: [],
      aliases: [],
      excerpt: '',
      wordCount: 0,
      dates: [],
      mtime: stats.mtimeMs,
      ctime: birthTime(stats),
      ctimeSource: birthTime(stats) ? 'filesystem' : 'unknown',
      size: stats.size,
      ino: stats.ino,
      searchText: name.toLowerCase(),
      body: '',
      outgoing: [],
      backlinks: [],
      unresolved: [],
      category: ''
    }
    if (stats.size > MAX_NOTE_BYTES) {
      base.error = 'This note is too large to index (over 8 MB).'
      return base
    }
    let raw: string
    try {
      raw = await fs.readFile(this.absPath(id), 'utf8')
    } catch (err) {
      base.error = describeFsError(err)
      return base
    }
    try {
      if (ext === '.txt') {
        base.body = raw
        base.searchText = raw.toLowerCase()
        base.wordCount = raw.split(/\s+/).filter(Boolean).length
        base.excerpt = raw.replace(/\s+/g, ' ').trim().slice(0, 280)
        return base
      }
      const parsed = parseNote(raw)
      base.title = parsed.title ?? name
      base.links = parsed.links
      base.externalLinkCount = parsed.externalLinks.length
      base.headings = parsed.headings
      base.tags = parsed.tags
      base.aliases = parsed.aliases
      base.frontmatterCategory = parsed.category
      base.description = parsed.description
      base.excerpt = parsed.excerpt
      base.wordCount = parsed.wordCount
      base.dates = parsed.dates
      base.body = parsed.body
      base.searchText = parsed.body.toLowerCase()
      if (parsed.createdFromFrontmatter) {
        base.ctime = parsed.createdFromFrontmatter
        base.ctimeSource = 'frontmatter'
      }
      if (parsed.frontmatterError) base.error = parsed.frontmatterError
    } catch (err) {
      base.error = `Could not parse this note: ${(err as Error).message}`
    }
    return base
  }

  /** Re-resolves every link. Cheap (map lookups), so it runs after any structural change. */
  resolveAll(): void {
    const resolver = new LinkResolver(this.notes.values())
    this.resolver = resolver
    const backlinks = new Map<string, Set<string>>()
    const pairWeights = new Map<string, number>()
    for (const note of this.notes.values()) {
      const outgoing = new Set<string>()
      const unresolved = new Set<string>()
      for (const link of note.links) {
        const target = resolver.resolve(link.target, note.id, link.kind)
        if (target) {
          if (target === note.id) continue
          outgoing.add(target)
          const key = note.id < target ? `${note.id}\u0000${target}` : `${target}\u0000${note.id}`
          pairWeights.set(key, (pairWeights.get(key) ?? 0) + 1)
        } else if (!(link.kind === 'embed' && /\.[a-z0-9]{2,5}$/i.test(link.target) && !/\.(md|txt)$/i.test(link.target))) {
          unresolved.add(link.target)
        }
      }
      note.outgoing = [...outgoing].sort()
      note.unresolved = [...unresolved].sort()
      for (const t of outgoing) {
        const set = backlinks.get(t)
        if (set) set.add(note.id)
        else backlinks.set(t, new Set([note.id]))
      }
    }
    for (const note of this.notes.values()) note.backlinks = [...(backlinks.get(note.id) ?? [])].sort()

    this.edges = [...pairWeights.entries()]
      .map(([key, weight]) => {
        const [source, target] = key.split('\u0000')
        return { source, target, weight }
      })
      .sort((a, b) => (a.source === b.source ? a.target.localeCompare(b.target) : a.source.localeCompare(b.source)))

    const neighborMap = new Map<string, Set<string>>()
    for (const e of this.edges) {
      if (!neighborMap.has(e.source)) neighborMap.set(e.source, new Set())
      if (!neighborMap.has(e.target)) neighborMap.set(e.target, new Set())
      neighborMap.get(e.source)!.add(e.target)
      neighborMap.get(e.target)!.add(e.source)
    }
    const assignment = assignCategories(
      [...this.notes.values()].map((n) => ({
        id: n.id,
        title: n.title,
        folder: n.folder,
        tags: n.tags,
        frontmatterCategory: n.frontmatterCategory,
        neighbors: [...(neighborMap.get(n.id) ?? [])].sort()
      }))
    )
    for (const note of this.notes.values()) note.category = assignment.byNote.get(note.id) ?? 'Unfiled'
    this.categories = assignment.categories
  }

  /**
   * Applies a batch of filesystem changes. `present` contains paths that
   * exist (new or modified); `gone` contains removed paths or folder markers
   * (ending in `/`). Renames are detected by matching inode numbers.
   */
  async applyChanges(present: Map<string, Stats>, gone: Set<string>): Promise<ChangeSummary> {
    const change: ChangeSummary = { added: [], removed: [], modified: [], renamed: [] }
    const toRemove = new Set<string>()
    const toUpsert = new Map<string, Stats>(present)

    for (const g of gone) {
      if (!g.endsWith('/')) {
        if (this.notes.has(g)) toRemove.add(g)
        continue
      }
      // Folder marker: verify notes under it, discover new ones.
      const prefix = g
      for (const id of this.notes.keys()) {
        if (!id.startsWith(prefix)) continue
        try {
          const st = await fs.lstat(this.absPath(id))
          if (!st.isFile()) toRemove.add(id)
        } catch {
          toRemove.add(id)
        }
      }
      const dirAbs = join(this.rootReal, ...prefix.slice(0, -1).split('/'))
      try {
        const st = await fs.lstat(dirAbs)
        if (st.isDirectory() && !st.isSymbolicLink()) {
          const found: DiscoveredFile[] = await discoverNotes(dirAbs, this.includeTxt)
          for (const f of found) {
            const id = `${prefix}${f.relPath}`
            if (isIndexableRelPath(id, this.includeTxt) && !this.notes.has(id)) toUpsert.set(id, f.stats)
          }
        }
      } catch {
        /* folder is gone */
      }
    }

    // Rename detection: a removed note and an added note sharing an inode.
    const removedByIno = new Map<number, string>()
    for (const id of toRemove) {
      const note = this.notes.get(id)
      if (note && note.ino) removedByIno.set(note.ino, id)
    }

    for (const [id, stats] of toUpsert) {
      const existing = this.notes.get(id)
      if (existing && existing.mtime === stats.mtimeMs && existing.size === stats.size && !toRemove.has(id)) continue
      const note = await this.readAndParse(id, stats)
      if (existing) {
        change.modified.push(id)
      } else {
        const from = removedByIno.get(stats.ino)
        if (from && from !== id) {
          change.renamed.push({ from, to: id })
          removedByIno.delete(stats.ino)
          toRemove.delete(from)
          this.notes.delete(from)
        } else change.added.push(id)
      }
      this.notes.set(id, note)
    }
    for (const id of toRemove) {
      if (toUpsert.has(id)) continue
      this.notes.delete(id)
      change.removed.push(id)
    }
    if (change.added.length || change.removed.length || change.modified.length || change.renamed.length) {
      this.resolveAll()
    }
    return change
  }

  toMeta(note: IndexedNote): NoteMeta {
    return {
      id: note.id,
      title: note.title,
      name: note.name,
      path: note.id,
      folder: note.folder,
      category: note.category,
      tags: note.tags,
      aliases: note.aliases,
      headings: note.headings,
      outgoing: note.outgoing,
      backlinks: note.backlinks,
      unresolved: note.unresolved,
      externalLinkCount: note.externalLinkCount,
      mtime: note.mtime,
      ctime: note.ctime,
      ctimeSource: note.ctimeSource,
      wordCount: note.wordCount,
      description: note.description,
      excerpt: note.excerpt,
      dates: note.dates,
      size: note.size,
      error: note.error
    }
  }

  metas(): NoteMeta[] {
    return [...this.notes.values()].sort((a, b) => a.id.localeCompare(b.id)).map((n) => this.toMeta(n))
  }

  /** Reads a note's current content from disk, through the path guard. */
  async getContent(id: string): Promise<NoteContent> {
    const note = this.notes.get(id)
    if (!note) return { id, body: '', frontmatter: {}, mtime: 0, linkMap: {}, error: 'This note is no longer part of the vault.' }
    const linkMap: Record<string, string | null> = {}
    try {
      const abs = await resolveVaultFile(this.rootReal, id)
      const st = await fs.stat(abs)
      if (st.size > MAX_NOTE_BYTES) {
        return { id, body: '', frontmatter: {}, mtime: st.mtimeMs, linkMap, error: 'This note is too large to preview (over 8 MB).' }
      }
      const raw = await fs.readFile(abs, 'utf8')
      if (note.ext === '.txt') return { id, body: raw, frontmatter: {}, mtime: st.mtimeMs, linkMap }
      const { data, body, error } = splitFrontmatter(raw)
      // Resolve links against the current content (it may be newer than the index).
      const parsed = parseNote(raw)
      const resolver = this.resolver ?? new LinkResolver(this.notes.values())
      for (const link of parsed.links) {
        const key = `${link.kind === 'markdown' ? 'm' : 'w'}:${link.target}`
        if (key in linkMap) continue
        const target = resolver.resolve(link.target, id, link.kind)
        linkMap[key] = target
      }
      return { id, body, frontmatter: data, mtime: st.mtimeMs, linkMap, error }
    } catch (err) {
      return { id, body: '', frontmatter: {}, mtime: note.mtime, linkMap, error: describeFsError(err) }
    }
  }

  /** Resolves an embedded image target (as written in `fromId`) to a vault-relative path. */
  resolveAttachment(target: string, fromId: string): string | null {
    const t = target.normalize('NFC').replace(/\\/g, '/').replace(/^\/+/, '').trim()
    if (!t || t.split('/').includes('..')) return null
    const lower = t.toLowerCase()
    const folder = fromId.includes('/') ? fromId.slice(0, fromId.lastIndexOf('/')) : ''
    const relative = (folder ? `${folder}/${t}` : t).toLowerCase()
    let byName: string[] = []
    for (const a of this.attachments) {
      const al = a.toLowerCase()
      if (al === lower || al === relative) return a
      if (!t.includes('/') && al.slice(al.lastIndexOf('/') + 1) === lower) byName.push(a)
      else if (t.includes('/') && al.endsWith(`/${lower}`)) byName.push(a)
    }
    if (!byName.length) return null
    byName = byName.sort((a, b) => {
      const fa = a.startsWith(folder ? `${folder}/` : '') ? 0 : 1
      const fb = b.startsWith(folder ? `${folder}/` : '') ? 0 : 1
      return fa - fb || a.split('/').length - b.split('/').length || a.localeCompare(b)
    })
    return byName[0]
  }

  get vaultName(): string {
    return basename(this.rootReal.endsWith(sep) ? this.rootReal.slice(0, -1) : this.rootReal)
  }
}

export function describeFsError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException)?.code
  switch (code) {
    case 'ENOENT':
      return 'The file could not be found. It may have been moved or deleted.'
    case 'EACCES':
    case 'EPERM':
      return 'NEXUS does not have permission to read this file.'
    case 'ETIMEDOUT':
    case 'EIO':
      return 'The file is on storage that is currently unavailable.'
    case 'SYMLINK':
      return 'Symbolic links are not followed for your security.'
    default:
      return (err as Error)?.message ? `The file could not be read: ${(err as Error).message}` : 'The file could not be read.'
  }
}
