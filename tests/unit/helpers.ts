import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

export const FIXTURE_VAULT = resolve(__dirname, '../fixtures/test-vault')

/** Copies the fixture vault into a fresh temp directory (symlinks preserved). */
export async function copyFixtureVault(): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'nexus-vault-'))
  await fs.cp(FIXTURE_VAULT, dir, { recursive: true, verbatimSymlinks: true })
  return fs.realpath(dir)
}

/** Hashes every file in a directory tree (used to prove the vault is never modified). */
export async function hashTree(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const walk = async (dir: string) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) await walk(abs)
      else if (entry.isSymbolicLink()) out[abs.slice(root.length)] = `link:${await fs.readlink(abs)}`
      else {
        const st = await fs.stat(abs)
        out[abs.slice(root.length)] = `${createHash('sha256').update(await fs.readFile(abs)).digest('hex')}:${st.mtimeMs}`
      }
    }
  }
  await walk(root)
  return out
}

export function waitFor<T>(fn: () => T | undefined | null | false, timeoutMs = 8000, interval = 50): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const start = Date.now()
    const tick = () => {
      let v: T | undefined | null | false
      try {
        v = fn()
      } catch {
        v = undefined
      }
      if (v) return resolvePromise(v)
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'))
      setTimeout(tick, interval)
    }
    tick()
  })
}
