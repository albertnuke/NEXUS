import { forceLink, forceManyBody, forceSimulation, type SimNode } from 'd3-force-3d'
import type { Vec3 } from '@shared/types'

/**
 * Deterministic force-directed layout of the knowledge constellation.
 *
 * Notes live in a thick, slightly flattened spherical shell around the black
 * hole. Each category gets an anchor direction on the shell; links and charge
 * shape clusters organically around those anchors. Layout is seeded from note
 * ids, never Math.random, and previously placed notes are pinned so the
 * universe stays recognisable as the vault evolves.
 */

export const LAYOUT_VERSION = 5
export const SHELL_MIN = 64
export const SHELL_MAX = 126
export const ANCHOR_RADIUS = 94
export const Y_SQUASH = 0.72

export interface LayoutNodeInput {
  id: string
  category: string
  degree: number
}

export interface CachedPosition {
  p: Vec3
  c: string
}

export interface LayoutInput {
  nodes: LayoutNodeInput[]
  edges: Array<{ source: string; target: string }>
  categories: Array<{ id: string; noteCount: number }>
  previous: Record<string, CachedPosition>
  anchors: Record<string, Vec3>
}

export interface LayoutOutput {
  positions: Record<string, CachedPosition>
  anchors: Record<string, Vec3>
  /** Ids of nodes that were (re)placed by this run. */
  placed: string[]
}

interface Node extends SimNode {
  id: string
  category: string
  degree: number
  ax: number
  ay: number
  az: number
  x: number
  y: number
  z: number
}

/** FNV-1a string hash → 32-bit unsigned. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Mulberry32 PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(r: () => number): number {
  const u = Math.max(r(), 1e-9)
  const v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Candidate anchor directions, avoiding the poles and the default line of sight. */
function candidateDirections(count = 600): Vec3[] {
  const out: Vec3[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = golden * i
    const d: Vec3 = [Math.cos(theta) * r, y, Math.sin(theta) * r]
    // Keep the view axis (±Z, where the default camera looks) and the poles clear,
    // so constellations frame the black hole instead of covering it.
    if (Math.abs(d[2]) > 0.72 || Math.abs(d[1]) > 0.78) continue
    out.push(d)
  }
  return out
}

function angularDistance(a: Vec3, b: Vec3): number {
  return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
}

export function placeAnchors(
  categories: Array<{ id: string; noteCount: number }>,
  existing: Record<string, Vec3>
): Record<string, Vec3> {
  const anchors: Record<string, Vec3> = {}
  const taken: Vec3[] = []
  for (const c of categories) {
    if (existing[c.id]) {
      anchors[c.id] = existing[c.id]
      taken.push(normalize([existing[c.id][0], existing[c.id][1] / Y_SQUASH, existing[c.id][2]]))
    }
  }
  const candidates = candidateDirections()
  const ordered = [...categories].sort((a, b) => b.noteCount - a.noteCount || a.id.localeCompare(b.id))
  for (const c of ordered) {
    if (anchors[c.id]) continue
    let best: Vec3
    if (!taken.length) {
      best = normalize([-0.78, 0.34, 0.32]) // first constellation: upper left, slightly forward
    } else {
      let bestScore = -Infinity
      best = candidates[0]
      const jitter = rng(hashString(c.id))
      for (const d of candidates) {
        let minD = Infinity
        for (const t of taken) minD = Math.min(minD, angularDistance(d, t))
        // Prefer directions on screen-left/right (|x| large) slightly, for a wide composition.
        const score = minD + Math.abs(d[0]) * 0.08 + jitter() * 0.01
        if (score > bestScore) {
          bestScore = score
          best = d
        }
      }
    }
    taken.push(best)
    anchors[c.id] = [best[0] * ANCHOR_RADIUS, best[1] * ANCHOR_RADIUS * Y_SQUASH, best[2] * ANCHOR_RADIUS]
  }
  return anchors
}

function shellForce(nodes: Node[]) {
  const f = (alpha: number) => {
    for (const n of nodes) {
      const yy = n.y / Y_SQUASH
      const r = Math.hypot(n.x, yy, n.z) || 1e-6
      let target = r
      if (r < SHELL_MIN) target = SHELL_MIN
      else if (r > SHELL_MAX) target = SHELL_MAX
      if (target === r) continue
      const k = ((target - r) / r) * Math.min(1, alpha * 4 + 0.25)
      n.vx = (n.vx ?? 0) + n.x * k
      n.vy = (n.vy ?? 0) + n.y * k
      n.vz = (n.vz ?? 0) + n.z * k
    }
  }
  return f
}

function anchorForce(nodes: Node[], strength: number) {
  return (alpha: number) => {
    const k = strength * alpha
    for (const n of nodes) {
      n.vx = (n.vx ?? 0) + (n.ax - n.x) * k
      n.vy = (n.vy ?? 0) + (n.ay - n.y) * k
      n.vz = (n.vz ?? 0) + (n.az - n.z) * k
    }
  }
}

function clusterSpread(count: number): number {
  return Math.min(46, 7 + Math.sqrt(count) * 3.1)
}

export function computeLayout(input: LayoutInput): LayoutOutput {
  const anchors = placeAnchors(input.categories, input.anchors)
  const catCount = new Map(input.categories.map((c) => [c.id, c.noteCount]))
  const nodes = [...input.nodes].sort((a, b) => a.id.localeCompare(b.id))
  const neighbors = new Map<string, string[]>()
  for (const e of input.edges) {
    if (!neighbors.has(e.source)) neighbors.set(e.source, [])
    if (!neighbors.has(e.target)) neighbors.set(e.target, [])
    neighbors.get(e.source)!.push(e.target)
    neighbors.get(e.target)!.push(e.source)
  }

  const positions: Record<string, CachedPosition> = {}
  const free: LayoutNodeInput[] = []
  for (const n of nodes) {
    const prev = input.previous[n.id]
    if (prev && prev.c === n.category && prev.p.every(Number.isFinite)) positions[n.id] = { p: prev.p, c: n.category }
    else free.push(n)
  }
  if (!free.length) return { positions, anchors, placed: [] }

  const incremental = Object.keys(positions).length > 0
  const simNodes: Node[] = []
  const byId = new Map<string, Node>()

  // Seed free nodes: near positioned neighbours in the same category, else around the anchor.
  for (const n of free) {
    const a = anchors[n.category] ?? [ANCHOR_RADIUS, 0, 0]
    const r = rng(hashString(n.id))
    const prev = input.previous[n.id]
    let seed: Vec3
    const placedNeighbors = (neighbors.get(n.id) ?? [])
      .map((id) => positions[id])
      .filter((p): p is CachedPosition => !!p && p.c === n.category)
    if (prev && prev.p.every(Number.isFinite)) {
      seed = prev.p // category changed: start from the old place and travel
    } else if (placedNeighbors.length) {
      const m: Vec3 = [0, 0, 0]
      for (const p of placedNeighbors) for (let i = 0; i < 3; i++) m[i] += p.p[i] / placedNeighbors.length
      seed = [m[0] + gaussian(r) * 3, m[1] + gaussian(r) * 3, m[2] + gaussian(r) * 3]
    } else {
      const s = clusterSpread(catCount.get(n.category) ?? 1) * 0.6
      seed = [a[0] + gaussian(r) * s, a[1] + gaussian(r) * s * Y_SQUASH, a[2] + gaussian(r) * s]
    }
    const node: Node = { id: n.id, category: n.category, degree: n.degree, ax: a[0], ay: a[1], az: a[2], x: seed[0], y: seed[1], z: seed[2] }
    simNodes.push(node)
    byId.set(n.id, node)
  }

  // Fixed context: pinned nodes near the free ones (incremental mode only).
  if (incremental) {
    const CONTEXT_RADIUS = 28
    const freeList = [...simNodes]
    for (const [id, pos] of Object.entries(positions)) {
      let near = false
      for (const f of freeList) {
        const dx = f.x - pos.p[0]
        const dy = f.y - pos.p[1]
        const dz = f.z - pos.p[2]
        if (dx * dx + dy * dy + dz * dz < CONTEXT_RADIUS * CONTEXT_RADIUS) {
          near = true
          break
        }
      }
      if (!near && !(neighbors.get(id) ?? []).some((nb) => byId.has(nb) && !positions[nb])) continue
      const a = anchors[pos.c] ?? [0, 0, 0]
      const node: Node = {
        id,
        category: pos.c,
        degree: 0,
        ax: a[0],
        ay: a[1],
        az: a[2],
        x: pos.p[0],
        y: pos.p[1],
        z: pos.p[2],
        fx: pos.p[0],
        fy: pos.p[1],
        fz: pos.p[2]
      }
      simNodes.push(node)
      byId.set(id, node)
    }
  }

  const links = input.edges
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }))
  const n = simNodes.length
  const charge = n > 2500 ? -6 : n > 800 ? -8 : -10
  const ticks = incremental ? 140 : n > 3000 ? 260 : 320

  const sim = forceSimulation<Node>(simNodes, 3)
    .randomSource(rng(0x5eed))
    .velocityDecay(0.42)
    .alphaDecay(1 - Math.pow(0.001, 1 / ticks))
    .force(
      'link',
      forceLink<Node>(links)
        .id((d) => d.id)
        .distance((l) => {
          const s = l.source as Node
          const t = l.target as Node
          return s.category === t.category ? 7 : 26
        })
        .strength((l) => {
          const s = l.source as Node
          const t = l.target as Node
          const deg = Math.max(1, Math.min(s.degree || 1, t.degree || 1))
          return s.category === t.category ? 0.5 / Math.sqrt(deg) : 0.006
        })
    )
    .force('charge', forceManyBody<Node>().strength(charge).theta(0.9).distanceMax(45))
    .force('anchor', anchorForce(simNodes, n > 800 ? 0.11 : 0.07))
    .force('shell', shellForce(simNodes))
    .stop()
  sim.tick(ticks)

  const placed: string[] = []
  for (const node of simNodes) {
    if (node.fx != null) continue
    positions[node.id] = {
      p: [round(node.x), round(node.y), round(node.z)],
      c: node.category
    }
    placed.push(node.id)
  }
  return { positions, anchors, placed }
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}
