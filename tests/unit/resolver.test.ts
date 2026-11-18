import { describe, expect, it } from 'vitest'
import { LinkResolver } from '../../src/main/indexing/resolver'

const notes = [
  { id: 'Cybersecurity/Network Security.md', aliases: ['NetSec'] },
  { id: 'Cybersecurity/Firewalls.md', aliases: [] },
  { id: 'Programming/Duplicate.md', aliases: [] },
  { id: 'Personal/Duplicate.md', aliases: [] },
  { id: 'Personal/Deep/Nested/Leaf.md', aliases: ['Shared Alias'] },
  { id: 'Other/Leaf2.md', aliases: ['Shared Alias'] },
  { id: 'Café Notes.md', aliases: [] },
  { id: 'Version 1.2.md', aliases: [] },
  { id: 'Root.md', aliases: [] }
]
const r = new LinkResolver(notes)

describe('LinkResolver', () => {
  it('resolves bare names, paths, case and unicode forms', () => {
    expect(r.resolve('Network Security', 'Root.md', 'wiki')).toBe('Cybersecurity/Network Security.md')
    expect(r.resolve('network security', 'Root.md', 'wiki')).toBe('Cybersecurity/Network Security.md')
    expect(r.resolve('Cybersecurity/Network Security', 'Root.md', 'wiki')).toBe('Cybersecurity/Network Security.md')
    expect(r.resolve('Cybersecurity/Network Security.md', 'Root.md', 'wiki')).toBe('Cybersecurity/Network Security.md')
    expect(r.resolve('Nested/Leaf', 'Root.md', 'wiki')).toBe('Personal/Deep/Nested/Leaf.md')
    expect(r.resolve('Café Notes', 'Root.md', 'wiki')).toBe('Café Notes.md')
    expect(r.resolve('Version 1.2', 'Root.md', 'wiki')).toBe('Version 1.2.md')
  })

  it('disambiguates duplicate filenames by proximity', () => {
    expect(r.resolve('Duplicate', 'Programming/Other.md', 'wiki')).toBe('Programming/Duplicate.md')
    expect(r.resolve('Duplicate', 'Personal/Deep/Nested/Leaf.md', 'wiki')).toBe('Personal/Duplicate.md')
    expect(r.resolve('Programming/Duplicate', 'Personal/Duplicate.md', 'wiki')).toBe('Programming/Duplicate.md')
    // Same result regardless of order: deterministic tie-break (alphabetical).
    expect(r.resolve('Duplicate', 'Root.md', 'wiki')).toBe('Personal/Duplicate.md')
  })

  it('never fuzzy-matches similar names', () => {
    expect(r.resolve('Network', 'Root.md', 'wiki')).toBeNull()
    expect(r.resolve('Network Securit', 'Root.md', 'wiki')).toBeNull()
    expect(r.resolve('Security/Network Security', 'Root.md', 'wiki')).toBeNull()
  })

  it('resolves markdown links relative to the source note', () => {
    expect(r.resolve('../Programming/Duplicate.md', 'Personal/Duplicate.md', 'markdown')).toBe('Programming/Duplicate.md')
    expect(r.resolve('Firewalls.md', 'Cybersecurity/Network Security.md', 'markdown')).toBe('Cybersecurity/Firewalls.md')
    expect(r.resolve('../../outside.md', 'Root.md', 'markdown')).toBeNull()
  })

  it('uses frontmatter aliases only when unambiguous', () => {
    expect(r.resolve('NetSec', 'Root.md', 'wiki')).toBe('Cybersecurity/Network Security.md')
    expect(r.resolve('Shared Alias', 'Root.md', 'wiki')).toBeNull()
  })
})
