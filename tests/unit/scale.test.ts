import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { VaultIndex } from '../../src/main/indexing/indexer'
import { computeLayout } from '../../src/main/layout/layoutEngine'
import { searchNotes } from '../../src/main/indexing/search'
import { rng } from '../../src/main/layout/layoutEngine'

async function generateVault(count: number): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'nexus-scale-'))
  const folders = ['Research', 'Projects', 'Reading', 'Ideas', 'Work', 'Learning', 'Archive', 'People']
  for (const f of folders) await fs.mkdir(join(dir, f))
  const r = rng(42)
  const writes: Promise<void>[] = []
  for (let i = 0; i < count; i++) {
    const folder = folders[i % folders.length]
    const links = Array.from({ length: 1 + Math.floor(r() * 4) }, () => `[[Note ${Math.floor(r() * count)}]]`).join(' ')
    const body = `---\ntags: [${folder.toLowerCase()}]\n---\n# Note ${i}\n\n## Section\nSome text about topic ${i % 97}. ${links}\n\n${'Lorem ipsum dolor sit amet. '.repeat(40)}\n`
    writes.push(fs.writeFile(join(dir, folder, `Note ${i}.md`), body))
  }
  await Promise.all(writes)
  return dir
}

describe('large vaults', () => {
  it('indexes, lays out and searches 5,000 notes', async () => {
    const dir = await generateVault(5000)
    const t0 = performance.now()
    const index = new VaultIndex(await fs.realpath(dir), false)
    await index.fullScan()
    const t1 = performance.now()
    const degree = new Map<string, number>()
    for (const e of index.edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
    }
    const layout = computeLayout({
      nodes: [...index.notes.values()].map((n) => ({ id: n.id, category: n.category, degree: degree.get(n.id) ?? 0 })),
      edges: index.edges,
      categories: index.categories.map((c) => ({ id: c.id, noteCount: c.noteCount })),
      previous: {},
      anchors: {}
    })
    const t2 = performance.now()
    const results = searchNotes(index.notes.values(), 'topic 42')
    const t3 = performance.now()
    console.log(
      `5000 notes: index ${(t1 - t0).toFixed(0)}ms, layout ${(t2 - t1).toFixed(0)}ms, search ${(t3 - t2).toFixed(1)}ms, edges ${index.edges.length}`
    )
    expect(index.notes.size).toBe(5000)
    expect(Object.keys(layout.positions)).toHaveLength(5000)
    expect(results.length).toBeGreaterThan(0)
    expect(t3 - t2).toBeLessThan(500)
    await fs.rm(dir, { recursive: true, force: true })
  }, 120000)
})
