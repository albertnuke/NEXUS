import { describe, expect, it } from 'vitest'
import { computeLayout, SHELL_MAX, SHELL_MIN, Y_SQUASH, type LayoutInput } from '../../src/main/layout/layoutEngine'

function makeGraph(n: number, cats: number): LayoutInput {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `C${i % cats}/note-${i}.md`, category: `C${i % cats}`, degree: 2 }))
  const edges = nodes.slice(1).map((node, i) => ({ source: nodes[i].id, target: node.id }))
  const categories = Array.from({ length: cats }, (_, i) => ({ id: `C${i}`, noteCount: Math.ceil(n / cats) }))
  return { nodes, edges, categories, previous: {}, anchors: {} }
}

describe('layout engine', () => {
  it('is deterministic', () => {
    const a = computeLayout(makeGraph(120, 5))
    const b = computeLayout(makeGraph(120, 5))
    expect(a.positions).toEqual(b.positions)
  })

  it('keeps every star in the shell around the black hole', () => {
    const out = computeLayout(makeGraph(300, 6))
    for (const { p } of Object.values(out.positions)) {
      const r = Math.hypot(p[0], p[1] / Y_SQUASH, p[2])
      expect(r).toBeGreaterThan(SHELL_MIN * 0.85)
      expect(r).toBeLessThan(SHELL_MAX * 1.15)
    }
  })

  it('pins existing stars when nodes are added', () => {
    const base = makeGraph(80, 4)
    const first = computeLayout(base)
    const grown = makeGraph(81, 4)
    grown.previous = first.positions
    grown.anchors = first.anchors
    const second = computeLayout(grown)
    for (const [id, pos] of Object.entries(first.positions)) expect(second.positions[id]).toEqual(pos)
    expect(second.placed).toEqual(['C0/note-80.md'])
  })

  it('keeps related notes clustered by category', () => {
    const out = computeLayout(makeGraph(200, 4))
    const centroid = (cat: string) => {
      const ps = Object.values(out.positions).filter((p) => p.c === cat).map((p) => p.p)
      return [0, 1, 2].map((i) => ps.reduce((s, p) => s + p[i], 0) / ps.length)
    }
    const c0 = centroid('C0')
    const c1 = centroid('C1')
    const distBetween = Math.hypot(c0[0] - c1[0], c0[1] - c1[1], c0[2] - c1[2])
    const spread0 =
      Object.values(out.positions)
        .filter((p) => p.c === 'C0')
        .reduce((s, p) => s + Math.hypot(p.p[0] - c0[0], p.p[1] - c0[1], p.p[2] - c0[2]), 0) / 50
    expect(distBetween).toBeGreaterThan(spread0)
  })
})
