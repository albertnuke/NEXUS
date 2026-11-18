import { join } from 'node:path'
import type { ObsidianOpenMode } from '@shared/types'

/**
 * Builds an Obsidian URI for a note. We use the `path` parameter (absolute
 * file path), which lets Obsidian locate the most specific vault containing
 * the file — this also works when NEXUS was pointed at a sub-folder of a
 * vault. Every component is percent-encoded.
 */
export function buildObsidianUri(vaultRoot: string, noteId: string, mode: ObsidianOpenMode): string {
  const absolute = join(vaultRoot, ...noteId.split('/'))
  let uri = `obsidian://open?path=${encodeURIComponent(absolute)}`
  if (mode === 'tab') uri += '&paneType=tab'
  return uri
}
