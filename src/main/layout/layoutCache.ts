import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { Vec3 } from '@shared/types'
import { LAYOUT_VERSION, type CachedPosition } from './layoutEngine'

/**
 * Persists star positions per vault in the application support directory
 * (never inside the vault). Only paths and coordinates are stored — no note
 * content.
 */

export interface LayoutCacheData {
  version: number
  vaultPath: string
  positions: Record<string, CachedPosition>
  anchors: Record<string, Vec3>
}

export function vaultCacheDir(cacheRoot: string, vaultPath: string): string {
  const key = createHash('sha256').update(vaultPath).digest('hex').slice(0, 24)
  return join(cacheRoot, key)
}

export async function loadLayoutCache(cacheRoot: string, vaultPath: string): Promise<LayoutCacheData | null> {
  try {
    const raw = await fs.readFile(join(vaultCacheDir(cacheRoot, vaultPath), 'layout.json'), 'utf8')
    const data = JSON.parse(raw) as LayoutCacheData
    if (data.version !== LAYOUT_VERSION || data.vaultPath !== vaultPath) return null
    if (!data.positions || typeof data.positions !== 'object') return null
    return data
  } catch {
    return null
  }
}

let writeChain: Promise<void> = Promise.resolve()

export function saveLayoutCache(cacheRoot: string, data: LayoutCacheData): Promise<void> {
  // Serialise writes; each write goes to a temp file then atomically replaces the cache.
  writeChain = writeChain.then(async () => {
    const dir = vaultCacheDir(cacheRoot, data.vaultPath)
    await fs.mkdir(dir, { recursive: true })
    const file = join(dir, 'layout.json')
    const tmp = `${file}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(data), 'utf8')
    await fs.rename(tmp, file)
  }).catch(() => undefined)
  return writeChain
}

export async function clearAllCaches(cacheRoot: string): Promise<void> {
  await fs.rm(cacheRoot, { recursive: true, force: true })
}
