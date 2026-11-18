import { describe, expect, it, beforeAll } from 'vitest'
import { promises as fs } from 'node:fs'
import { VaultIndex } from '../../src/main/indexing/indexer'
import { searchNotes } from '../../src/main/indexing/search'
import { FIXTURE_VAULT, hashTree } from './helpers'

const EXPECTED_NOTES = [
  'Cybersecurity/Category Override.md',
  'Cybersecurity/Encryption.md',
  'Cybersecurity/Firewalls.md',
  'Cybersecurity/Network Security.md',
  'Personal/Duplicate.md',
  'Personal/Isolated.md',
  'Personal/Journal/2024-01-01.md',
  'Personal/Unicode Café.md',
  'Programming/Duplicate.md',
  'Programming/Python Basics.md',
  'Programming/Similar Names.md',
  'Programming/Table Note.md',
  'Welcome.md'
]

const EXPECTED_EDGES = [
  ['Welcome.md', 'Cybersecurity/Network Security.md'],
  ['Welcome.md', 'Programming/Python Basics.md'],
  ['Welcome.md', 'Personal/Unicode Café.md'],
  ['Cybersecurity/Network Security.md', 'Cybersecurity/Firewalls.md'],
  ['Cybersecurity/Network Security.md', 'Cybersecurity/Encryption.md'],
  ['Cybersecurity/Network Security.md', 'Programming/Python Basics.md'],
  ['Cybersecurity/Firewalls.md', 'Cybersecurity/Encryption.md'],
  ['Cybersecurity/Category Override.md', 'Cybersecurity/Encryption.md'],
  ['Programming/Python Basics.md', 'Programming/Duplicate.md'],
  ['Programming/Table Note.md', 'Programming/Python Basics.md'],
  ['Programming/Similar Names.md', 'Programming/Python Basics.md'],
  ['Personal/Journal/2024-01-01.md', 'Personal/Duplicate.md']
]

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

describe('VaultIndex on the fixture vault', () => {
  let index: VaultIndex
  let before: Record<string, string>

  beforeAll(async () => {
    before = await hashTree(FIXTURE_VAULT)
    index = new VaultIndex(await fs.realpath(FIXTURE_VAULT), false)
    await index.fullScan()
  })

  it('creates exactly one node per Markdown note and skips hidden, temp, .obsidian and symlinked files', () => {
    expect([...index.notes.keys()].sort()).toEqual(EXPECTED_NOTES)
    const metas = index.metas()
    expect(new Set(metas.map((m) => m.id)).size).toBe(metas.length)
  })

  it('creates the expected edges from every valid internal link and nothing else', () => {
    const actual = index.edges.map((e) => pairKey(e.source, e.target)).sort()
    const expected = EXPECTED_EDGES.map(([a, b]) => pairKey(a, b)).sort()
    expect(actual).toEqual(expected)
    const wns = index.edges.find((e) => pairKey(e.source, e.target) === pairKey('Welcome.md', 'Cybersecurity/Network Security.md'))
    expect(wns?.weight).toBe(2) // direct link + alias link
  })

  it('derives backlinks and tracks unresolved links', () => {
    const ns = index.notes.get('Cybersecurity/Network Security.md')!
    expect(ns.backlinks).toEqual(['Cybersecurity/Firewalls.md', 'Welcome.md'])
    expect(index.notes.get('Welcome.md')!.unresolved).toEqual(['Missing Note'])
    expect(index.notes.get('Programming/Similar Names.md')!.unresolved).toEqual(['Python'])
    // Embedded image attachments are not reported as unresolved notes.
    expect(index.notes.get('Cybersecurity/Firewalls.md')!.unresolved).toEqual([])
  })

  it('keeps unlinked notes', () => {
    const iso = index.notes.get('Personal/Isolated.md')!
    expect(iso.outgoing).toEqual([])
    expect(iso.backlinks).toEqual([])
  })

  it('extracts metadata', () => {
    const w = index.notes.get('Welcome.md')!
    expect(w.title).toBe('Welcome Home')
    expect(w.tags.sort()).toEqual(['home', 'intro', 'start'])
    expect(w.description).toBe('Entry point of the test vault.')
    expect(w.dates).toEqual([{ key: 'due', date: new Date('2099-03-01T00:00:00').toISOString() }])
    expect(w.headings).toEqual([{ level: 1, text: 'Welcome' }])
    expect(w.externalLinkCount).toBe(2)
    const j = index.notes.get('Personal/Journal/2024-01-01.md')!
    expect(j.ctimeSource).toBe('frontmatter')
    expect(index.notes.get('Cybersecurity/Network Security.md')!.aliases).toEqual(['NetSec'])
  })

  it('assigns categories from folders and frontmatter', () => {
    const cat = (id: string) => index.notes.get(id)!.category
    expect(cat('Cybersecurity/Firewalls.md')).toBe('Cybersecurity')
    expect(cat('Programming/Python Basics.md')).toBe('Programming')
    expect(cat('Personal/Journal/2024-01-01.md')).toBe('Personal')
    expect(cat('Cybersecurity/Category Override.md')).toBe('Research')
    expect(cat('Welcome.md')).toBe('Cybersecurity') // root note follows its links
    const counts = Object.fromEntries(index.categories.map((c) => [c.name, c.noteCount]))
    expect(counts).toEqual({ Cybersecurity: 4, Programming: 4, Personal: 4, Research: 1 })
  })

  it('indexes .txt only when enabled', async () => {
    const withTxt = new VaultIndex(await fs.realpath(FIXTURE_VAULT), true)
    await withTxt.fullScan()
    expect(withTxt.notes.has('Programming/notes.txt')).toBe(true)
    expect(withTxt.notes.size).toBe(EXPECTED_NOTES.length + 1)
  })

  it('finds image attachments for embeds', () => {
    expect(index.resolveAttachment('diagram.png', 'Cybersecurity/Firewalls.md')).toBe('Cybersecurity/diagram.png')
    expect(index.resolveAttachment('../secret.png', 'Welcome.md')).toBeNull()
  })

  it('reads note content through the path guard', async () => {
    const c = await index.getContent('Programming/Python Basics.md')
    expect(c.body).toContain('# Python Basics')
    const missing = await index.getContent('Nope.md')
    expect(missing.error).toBeTruthy()
  })

  it('searches titles, headings, tags, paths and content', () => {
    const notes = [...index.notes.values()]
    expect(searchNotes(notes, 'network security')[0].id).toBe('Cybersecurity/Network Security.md')
    expect(searchNotes(notes, 'Rules').map((r) => r.id)).toContain('Cybersecurity/Firewalls.md')
    expect(searchNotes(notes, '#security').map((r) => r.id).sort()).toEqual([
      'Cybersecurity/Encryption.md',
      'Cybersecurity/Network Security.md'
    ])
    expect(searchNotes(notes, 'asymmetric ciphers')[0].id).toBe('Cybersecurity/Encryption.md')
    expect(searchNotes(notes, 'journal')[0].id).toBe('Personal/Journal/2024-01-01.md')
    expect(searchNotes(notes, 'zzzz-no-match')).toEqual([])
  })

  it('never modifies the vault', async () => {
    expect(await hashTree(FIXTURE_VAULT)).toEqual(before)
  })
})
