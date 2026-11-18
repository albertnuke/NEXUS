import { promises as fs } from 'node:fs'
import { EventEmitter } from 'node:events'
import type { ChangeSummary, GraphSnapshot, NoteContent, SearchResult, Vec3, VaultStatus } from '@shared/types'
import { VaultIndex, describeFsError } from '../indexing/indexer'
import { searchNotes } from '../indexing/search'
import { VaultWatcher, type WatchBatch } from '../filesystem/watcher'
import type { LayoutInput, LayoutOutput, CachedPosition } from '../layout/layoutEngine'
import { loadLayoutCache, saveLayoutCache } from '../layout/layoutCache'
import { LAYOUT_VERSION } from '../layout/layoutEngine'

/**
 * Owns the connected vault: indexing, watching, layout and snapshots. The
 * renderer only ever sees snapshots and requests content through IPC.
 */

export type LayoutRunner = (input: LayoutInput) => Promise<LayoutOutput>

export interface VaultServiceOptions {
  cacheDir: string
  runLayout: LayoutRunner
  watch?: boolean
}

export interface OpenOptions {
  isDemo?: boolean
  includeTxt?: boolean
}

export class VaultService extends EventEmitter<{ status: [VaultStatus]; snapshot: [GraphSnapshot] }> {
  private index: VaultIndex | null = null
  private watcher: VaultWatcher | null = null
  private status: VaultStatus = { kind: 'none' }
  private snapshot: GraphSnapshot | null = null
  private positions: Record<string, CachedPosition> = {}
  private anchors: Record<string, Vec3> = {}
  private revision = 0
  private isDemo = false
  private openToken = 0
  private batchChain: Promise<void> = Promise.resolve()

  constructor(private readonly options: VaultServiceOptions) {
    super()
  }

  getStatus(): VaultStatus {
    return this.status
  }

  getSnapshot(): GraphSnapshot | null {
    return this.snapshot
  }

  get rootPath(): string | null {
    return this.index?.rootReal ?? null
  }

  get demo(): boolean {
    return this.isDemo
  }

  private setStatus(status: VaultStatus): void {
    this.status = status
    this.emit('status', status)
  }

  async open(vaultPath: string, opts: OpenOptions = {}): Promise<void> {
    const token = ++this.openToken
    await this.close()
    this.isDemo = !!opts.isDemo
    this.setStatus({ kind: 'loading', vaultPath, phase: 'scanning', progress: 0 })

    let rootReal: string
    try {
      rootReal = await fs.realpath(vaultPath)
      const st = await fs.stat(rootReal)
      if (!st.isDirectory()) throw Object.assign(new Error('Not a folder'), { code: 'ENOTDIR' })
      await fs.access(rootReal, fs.constants.R_OK)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      const message =
        code === 'ENOENT'
          ? 'This vault folder could not be found. It may have been moved, renamed, or be on a disconnected drive.'
          : code === 'EACCES' || code === 'EPERM'
            ? 'NEXUS no longer has permission to read this folder. Choose it again to grant access.'
            : code === 'ENOTDIR'
              ? 'The selected item is not a folder.'
              : describeFsError(err)
      this.setStatus({ kind: 'error', vaultPath, message, code })
      return
    }

    const index = new VaultIndex(rootReal, !!opts.includeTxt)
    try {
      await index.fullScan((p) => {
        if (token !== this.openToken) return
        this.setStatus({
          kind: 'loading',
          vaultPath,
          phase: p.phase,
          progress: p.total ? p.done / p.total : 0
        })
      })
    } catch (err) {
      if (token !== this.openToken) return
      this.setStatus({ kind: 'error', vaultPath, message: describeFsError(err), code: (err as NodeJS.ErrnoException).code })
      return
    }
    if (token !== this.openToken) return
    this.index = index

    const cache = await loadLayoutCache(this.options.cacheDir, rootReal)
    this.positions = cache?.positions ?? {}
    this.anchors = cache?.anchors ?? {}

    if (index.notes.size === 0) {
      this.snapshot = null
      this.setStatus({ kind: 'empty', vaultPath: rootReal })
      this.startWatching(index)
      return
    }

    this.setStatus({ kind: 'loading', vaultPath, phase: 'layout', progress: 0 })
    await this.layout()
    if (token !== this.openToken) return
    this.publish()
    this.setStatus({ kind: 'ready' })
    this.startWatching(index)
  }

  private startWatching(index: VaultIndex): void {
    if (this.options.watch === false || this.isDemo) return
    const watcher = new VaultWatcher(index.rootReal, index.includeTxt)
    watcher.on('batch', (batch) => {
      this.batchChain = this.batchChain
        .then(async () => {
          await this.applyBatch(batch)
        })
        .catch(() => undefined)
    })
    watcher.on('unavailable', (err) => {
      this.setStatus({
        kind: 'error',
        vaultPath: index.rootReal,
        message: `The vault is no longer available (${describeFsError(err)}). Reconnect the drive or choose another vault.`,
        code: (err as NodeJS.ErrnoException).code
      })
      void this.watcher?.close()
      this.watcher = null
    })
    watcher.on('error', () => {
      /* transient watcher errors are ignored; the health check reports real outages */
    })
    watcher.start()
    this.watcher = watcher
  }

  /** Exposed for tests: waits until queued watcher batches are processed. */
  idle(): Promise<void> {
    return this.batchChain
  }

  async applyBatch(batch: WatchBatch): Promise<ChangeSummary | null> {
    const index = this.index
    if (!index) return null
    const change = await index.applyChanges(batch.present, batch.gone)
    if (index !== this.index) return null
    const touched = change.added.length + change.removed.length + change.modified.length + change.renamed.length
    if (!touched) return change
    // Carry positions across renames so a renamed star does not jump.
    for (const { from, to } of change.renamed) {
      if (this.positions[from]) {
        this.positions[to] = this.positions[from]
        delete this.positions[from]
      }
    }
    for (const id of change.removed) delete this.positions[id]
    if (index.notes.size === 0) {
      this.snapshot = null
      this.setStatus({ kind: 'empty', vaultPath: index.rootReal })
      return change
    }
    await this.layout()
    if (index !== this.index) return null
    this.publish(change)
    if (this.status.kind !== 'ready') this.setStatus({ kind: 'ready' })
    return change
  }

  private async layout(): Promise<void> {
    const index = this.index!
    const degree = new Map<string, number>()
    for (const e of index.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
    }
    const input: LayoutInput = {
      nodes: [...index.notes.values()].map((n) => ({ id: n.id, category: n.category, degree: degree.get(n.id) ?? 0 })),
      edges: index.edges.map((e) => ({ source: e.source, target: e.target })),
      categories: index.categories.map((c) => ({ id: c.id, noteCount: c.noteCount })),
      previous: this.positions,
      anchors: this.anchors
    }
    const out = await this.options.runLayout(input)
    // Drop positions of notes that no longer exist.
    const positions: Record<string, CachedPosition> = {}
    for (const id of index.notes.keys()) if (out.positions[id]) positions[id] = out.positions[id]
    this.positions = positions
    this.anchors = { ...this.anchors, ...out.anchors }
    void saveLayoutCache(this.options.cacheDir, {
      version: LAYOUT_VERSION,
      vaultPath: index.rootReal,
      positions: this.positions,
      anchors: this.anchors
    })
  }

  private publish(change?: ChangeSummary): void {
    const index = this.index!
    const positions: Record<string, Vec3> = {}
    for (const [id, p] of Object.entries(this.positions)) positions[id] = p.p
    this.snapshot = {
      vault: {
        name: this.isDemo ? 'Demo Universe' : index.vaultName,
        path: index.rootReal,
        isDemo: this.isDemo,
        noteCount: index.notes.size,
        indexedAt: Date.now(),
        includeTxt: index.includeTxt
      },
      notes: index.metas(),
      edges: index.edges,
      categories: index.categories,
      positions,
      change,
      revision: ++this.revision
    }
    this.emit('snapshot', this.snapshot)
  }

  async getNote(id: string): Promise<NoteContent> {
    if (!this.index) return { id, body: '', frontmatter: {}, mtime: 0, linkMap: {}, error: 'No vault is connected.' }
    return this.index.getContent(id)
  }

  search(query: string, limit?: number): SearchResult[] {
    if (!this.index) return []
    return searchNotes(this.index.notes.values(), query, limit)
  }

  resolveAttachment(target: string, fromId: string): string | null {
    return this.index?.resolveAttachment(target, fromId) ?? null
  }

  hasNote(id: string): boolean {
    return !!this.index?.notes.has(id)
  }

  async reindex(): Promise<void> {
    if (!this.index) return
    const path = this.index.rootReal
    await this.open(path, { isDemo: this.isDemo, includeTxt: this.index.includeTxt })
  }

  async close(): Promise<void> {
    await this.watcher?.close()
    this.watcher = null
    this.index = null
    this.snapshot = null
    this.positions = {}
    this.anchors = {}
  }

  async disconnect(): Promise<void> {
    this.openToken++
    await this.close()
    this.isDemo = false
    this.setStatus({ kind: 'none' })
  }
}
