import { promises as fs } from 'node:fs'
import { join, sep, isAbsolute } from 'node:path'
import { isNoteId } from '@shared/validation'

/**
 * Every filesystem access requested on behalf of the renderer goes through
 * this guard. It rejects traversal, absolute paths and symbolic links, and
 * verifies that the real (resolved) path still lies inside the vault.
 */

export class PathGuardError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_PATH' | 'OUTSIDE_VAULT' | 'SYMLINK' | 'NOT_FOUND' | 'NOT_A_FILE'
  ) {
    super(message)
  }
}

export function isInside(rootReal: string, candidateReal: string): boolean {
  const root = rootReal.endsWith(sep) ? rootReal : rootReal + sep
  return candidateReal.startsWith(root)
}

/**
 * Resolves a vault-relative POSIX path to an absolute path that is guaranteed
 * to be a regular file inside the vault (no symlink anywhere on the way).
 */
export async function resolveVaultFile(rootReal: string, relPath: unknown): Promise<string> {
  if (!isNoteId(relPath) || isAbsolute(relPath)) throw new PathGuardError('Invalid path', 'INVALID_PATH')
  const abs = join(rootReal, ...relPath.split('/'))
  if (!isInside(rootReal, abs)) throw new PathGuardError('Path escapes the vault', 'OUTSIDE_VAULT')

  // Walk every segment with lstat so a symlinked folder cannot redirect us.
  const segments = relPath.split('/')
  let current = rootReal
  for (let i = 0; i < segments.length; i++) {
    current = join(current, segments[i])
    let st
    try {
      st = await fs.lstat(current)
    } catch {
      throw new PathGuardError('File not found', 'NOT_FOUND')
    }
    if (st.isSymbolicLink()) throw new PathGuardError('Symbolic links are not followed', 'SYMLINK')
    if (i === segments.length - 1 && !st.isFile()) throw new PathGuardError('Not a file', 'NOT_A_FILE')
  }
  const real = await fs.realpath(abs)
  if (!isInside(rootReal, real)) throw new PathGuardError('Path escapes the vault', 'OUTSIDE_VAULT')
  return real
}
