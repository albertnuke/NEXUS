import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { VaultService } from '../../src/main/vault/vaultService'
import { computeLayout } from '../../src/main/layout/layoutEngine'
import type { GraphSnapshot } from '../../src/shared/types'
import { copyFixtureVault, waitFor } from './helpers'

let service: VaultService | null = null

async function openService(watch = true) {
  const vault = await copyFixtureVault()
  const cacheDir = await fs.mkdtemp(join(tmpdir(), 'nexus-cache-'))
  const snapshots: GraphSnapshot[] = []
  service = new VaultService({ cacheDir, runLayout: async (input) => computeLayout(input), watch })
  service.on('snapshot', (s) => snapshots.push(s))
  await service.open(vault)
  return { vault, cacheDir, snapshots, service }
}

afterEach(async () => {
  await service?.close()
  service = null
})

describe('VaultService', () => {
  it('publishes a snapshot with a position for every note', async () => {
    const { snapshots } = await openService(false)
    const snap = snapshots.at(-1)!
    expect(snap.notes).toHaveLength(13)
    for (const n of snap.notes) {
      const p = snap.positions[n.id]
      expect(p).toBeDefined()
      expect(p.every(Number.isFinite)).toBe(true)
    }
    expect(service!.getStatus()).toEqual({ kind: 'ready' })
  })

  it('reopening reuses cached positions (stable universe)', async () => {
    const { vault, cacheDir, snapshots } = await openService(false)
    const first = snapshots.at(-1)!.positions
    await service!.close()
    await new Promise((r) => setTimeout(r, 100)) // allow cache write
    const again = new VaultService({ cacheDir, runLayout: async (i) => computeLayout(i), watch: false })
    const got: GraphSnapshot[] = []
    again.on('snapshot', (s) => got.push(s))
    await again.open(vault)
    expect(got.at(-1)!.positions).toEqual(first)
    await again.close()
  })

  it('reacts to created, modified, renamed and deleted notes', async () => {
    const { vault, snapshots } = await openService(true)
    const latest = () => snapshots.at(-1)!
    const initialRevision = latest().revision
    await new Promise((r) => setTimeout(r, 400)) // let the watcher settle

    // Create
    await fs.writeFile(join(vault, 'Programming', 'New Idea.md'), '# New Idea\n\nLinks to [[Python Basics]].\n')
    await waitFor(() => latest().notes.some((n) => n.id === 'Programming/New Idea.md'))
    const created = latest()
    expect(created.revision).toBeGreaterThan(initialRevision)
    expect(created.change?.added).toContain('Programming/New Idea.md')
    expect(created.positions['Programming/New Idea.md']).toBeDefined()
    expect(created.edges.some((e) => e.source.includes('New Idea') || e.target.includes('New Idea'))).toBe(true)
    // Existing stars did not move.
    expect(created.positions['Welcome.md']).toEqual(snapshots[0].positions['Welcome.md'])

    // Modify
    await fs.writeFile(join(vault, 'Programming', 'New Idea.md'), '# New Idea\n\nNow links to [[Encryption]] instead.\n')
    await waitFor(() => latest().notes.find((n) => n.id === 'Programming/New Idea.md')?.outgoing.includes('Cybersecurity/Encryption.md'))
    expect(latest().change?.modified).toContain('Programming/New Idea.md')
    expect(latest().notes.find((n) => n.id === 'Programming/New Idea.md')!.outgoing).toEqual(['Cybersecurity/Encryption.md'])

    // Rename keeps the star's position
    const posBefore = latest().positions['Programming/New Idea.md']
    await fs.rename(join(vault, 'Programming', 'New Idea.md'), join(vault, 'Programming', 'Renamed Idea.md'))
    await waitFor(() => latest().notes.some((n) => n.id === 'Programming/Renamed Idea.md') && !latest().notes.some((n) => n.id === 'Programming/New Idea.md'))
    expect(latest().positions['Programming/Renamed Idea.md']).toEqual(posBefore)

    // Delete
    await fs.rm(join(vault, 'Programming', 'Renamed Idea.md'))
    await waitFor(() => !latest().notes.some((n) => n.id === 'Programming/Renamed Idea.md'))
    expect(latest().change?.removed).toContain('Programming/Renamed Idea.md')
    expect(latest().notes).toHaveLength(13)
    expect(latest().edges.some((e) => e.source.includes('Renamed') || e.target.includes('Renamed'))).toBe(false)
  }, 30000)

  it('coalesces rapid saves into consistent state', async () => {
    const { vault, snapshots } = await openService(true)
    await new Promise((r) => setTimeout(r, 400))
    const file = join(vault, 'Burst.md')
    for (let i = 0; i < 8; i++) {
      await fs.writeFile(file, `# Burst ${i}\n`)
      await new Promise((r) => setTimeout(r, 15))
    }
    await waitFor(() => snapshots.at(-1)!.notes.find((n) => n.id === 'Burst.md')?.headings[0]?.text === 'Burst 7')
    // Atomic replace (write temp + rename over) is treated as a modification.
    const tmp = join(vault, '.Burst.md.tmp')
    await fs.writeFile(tmp, '# Burst atomic\n')
    await fs.rename(tmp, file)
    await waitFor(() => snapshots.at(-1)!.notes.find((n) => n.id === 'Burst.md')?.headings[0]?.text === 'Burst atomic')
    expect(snapshots.at(-1)!.notes.filter((n) => n.id === 'Burst.md')).toHaveLength(1)
  }, 30000)

  it('reports a missing vault gracefully', async () => {
    const cacheDir = await fs.mkdtemp(join(tmpdir(), 'nexus-cache-'))
    service = new VaultService({ cacheDir, runLayout: async (i) => computeLayout(i), watch: false })
    await service.open('/definitely/not/a/real/vault')
    const status = service.getStatus()
    expect(status.kind).toBe('error')
  })

  it('reports empty vaults', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'nexus-empty-'))
    const cacheDir = await fs.mkdtemp(join(tmpdir(), 'nexus-cache-'))
    service = new VaultService({ cacheDir, runLayout: async (i) => computeLayout(i), watch: false })
    await service.open(dir)
    expect(service.getStatus().kind).toBe('empty')
  })
})
