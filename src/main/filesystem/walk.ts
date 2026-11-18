import { promises as fs, type Stats } from 'node:fs'
import { join, sep } from 'node:path'

/**
 * Recursive vault discovery. Symbolic links are never followed (neither files
 * nor directories), so a vault cannot be used to reach files outside of it.
 */

export interface DiscoveredFile {
  /** Vault-relative POSIX path. */
  relPath: string
  absPath: string
  stats: Stats
}

const IGNORED_DIRS = new Set(['.obsidian', '.trash', '.git', '.svn', 'node_modules', '.DS_Store'])
const TEMP_FILE_RE = /(~$|\.(tmp|temp|swp|swo|crdownload|part|bak)$|^~\$)/i

export const MAX_FILES = 60000
export const MAX_DEPTH = 48
/** Markdown notes larger than this are indexed by metadata only. */
export const MAX_NOTE_BYTES = 8 * 1024 * 1024

export function isIgnoredDirName(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRS.has(name)
}

export function isNoteFileName(name: string, includeTxt: boolean): boolean {
  if (name.startsWith('.')) return false // hidden files, iCloud placeholders (.Note.md.icloud)
  if (TEMP_FILE_RE.test(name)) return false
  const lower = name.toLowerCase()
  if (lower.endsWith('.md')) return true
  return includeTxt && lower.endsWith('.txt')
}

/** Checks a vault-relative path against the ignore rules used by discovery. */
export function isIndexableRelPath(relPath: string, includeTxt: boolean): boolean {
  const segs = relPath.split('/')
  if (segs.length > MAX_DEPTH) return false
  for (let i = 0; i < segs.length - 1; i++) if (isIgnoredDirName(segs[i])) return false
  return isNoteFileName(segs[segs.length - 1], includeTxt)
}

export function toPosixRel(root: string, abs: string): string {
  const rel = abs.slice(root.length + (root.endsWith(sep) ? 0 : 1))
  return (sep === '/' ? rel : rel.split(sep).join('/')).normalize('NFC')
}

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp']

function isImageName(name: string): boolean {
  if (name.startsWith('.')) return false
  const lower = name.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * Discovers notes (and, optionally, image attachments for embed previews).
 */
export async function discoverNotes(
  root: string,
  includeTxt: boolean,
  attachments?: string[]
): Promise<DiscoveredFile[]> {
  const out: DiscoveredFile[] = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]
  while (queue.length) {
    const { dir, depth } = queue.shift()!
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (err) {
      if (dir === root) throw err
      continue // unreadable sub-folder: skip, keep indexing the rest
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const abs = join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (!isIgnoredDirName(entry.name) && depth < MAX_DEPTH) queue.push({ dir: abs, depth: depth + 1 })
        continue
      }
      if (!entry.isFile()) continue
      if (!isNoteFileName(entry.name, includeTxt)) {
        if (attachments && attachments.length < MAX_FILES && isImageName(entry.name)) attachments.push(toPosixRel(root, abs))
        continue
      }
      try {
        const stats = await fs.lstat(abs)
        if (!stats.isFile()) continue
        out.push({ relPath: toPosixRel(root, abs), absPath: abs, stats })
      } catch {
        continue
      }
      if (out.length >= MAX_FILES) return out
    }
  }
  return out
}
