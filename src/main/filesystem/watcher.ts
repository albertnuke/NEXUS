import { promises as fs, type Stats } from 'node:fs'
import { EventEmitter } from 'node:events'
import chokidar, { type FSWatcher } from 'chokidar'
import { isIgnoredDirName, isIndexableRelPath, toPosixRel, MAX_DEPTH } from './walk'
import { sep } from 'node:path'

/**
 * Watches a vault for note changes and emits debounced batches. Editors such
 * as Obsidian save atomically (write temp file, rename over original) and
 * often save several times per second, so raw events are coalesced: the
 * final state of each path is determined by checking the disk when the batch
 * is flushed rather than trusting the event sequence.
 */

export interface WatchBatch {
  /** Paths that exist now (created or modified), with fresh stats. */
  present: Map<string, Stats>
  /** Paths that no longer exist. */
  gone: Set<string>
}

export interface VaultWatcherEvents {
  batch: [WatchBatch]
  error: [Error]
  unavailable: [Error]
}

export class VaultWatcher extends EventEmitter<VaultWatcherEvents> {
  private watcher: FSWatcher | null = null
  private pending = new Set<string>()
  private timer: NodeJS.Timeout | null = null
  private healthTimer: NodeJS.Timeout | null = null
  private closed = false

  constructor(
    private readonly root: string,
    private readonly includeTxt: boolean,
    private readonly debounceMs = 220
  ) {
    super()
  }

  start(): void {
    const root = this.root
    this.watcher = chokidar.watch(root, {
      ignoreInitial: true,
      followSymlinks: false,
      persistent: true,
      depth: MAX_DEPTH,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
      ignored: (path: string, stats?: Stats) => {
        if (path === root) return false
        const rel = toPosixRel(root, path)
        const segs = rel.split('/')
        if (segs.some((s, i) => (i < segs.length - 1 || stats?.isDirectory()) && isIgnoredDirName(s))) return true
        if (stats?.isFile()) return !isIndexableRelPath(rel, this.includeTxt)
        // Unknown type (no stats yet): ignore hidden names early.
        return segs[segs.length - 1].startsWith('.')
      }
    })
    const onPath = (path: string) => {
      if (!path.startsWith(root + sep)) return
      const rel = toPosixRel(root, path)
      if (!isIndexableRelPath(rel, this.includeTxt)) return
      this.pending.add(rel)
      this.schedule()
    }
    const onDir = (path: string) => {
      // A folder rename/delete: rescan affected notes by marking the whole prefix.
      if (!path.startsWith(root + sep)) return
      this.pending.add(`${toPosixRel(root, path)}/`)
      this.schedule()
    }
    this.watcher.on('add', onPath).on('change', onPath).on('unlink', onPath)
    this.watcher.on('addDir', onDir).on('unlinkDir', onDir)
    this.watcher.on('error', (err) => this.emit('error', err as Error))

    // External drives and cloud folders can disappear; check periodically.
    this.healthTimer = setInterval(() => {
      fs.access(root).catch((err: Error) => this.emit('unavailable', err))
    }, 5000)
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), this.debounceMs)
  }

  /** Paths ending in `/` are folder markers that the caller expands. */
  private async flush(): Promise<void> {
    this.timer = null
    if (this.closed || !this.pending.size) return
    const paths = [...this.pending]
    this.pending.clear()
    const present = new Map<string, Stats>()
    const gone = new Set<string>()
    for (const rel of paths) {
      if (rel.endsWith('/')) {
        gone.add(rel) // marker; resolved by the vault service against its index
        continue
      }
      try {
        const st = await fs.lstat(`${this.root}${sep}${rel.split('/').join(sep)}`)
        if (st.isFile() && !st.isSymbolicLink()) present.set(rel, st)
        else gone.add(rel)
      } catch {
        gone.add(rel)
      }
    }
    if (present.size || gone.size) this.emit('batch', { present, gone })
  }

  async close(): Promise<void> {
    this.closed = true
    if (this.timer) clearTimeout(this.timer)
    if (this.healthTimer) clearInterval(this.healthTimer)
    await this.watcher?.close()
    this.watcher = null
  }
}
