import type { GraphSnapshot, NoteMeta } from '@shared/types'

/**
 * GPU-facing representation of the knowledge graph. All arrays are typed and
 * shared directly with Three.js buffer attributes; the render loop mutates
 * them in place (positions interpolate, emphasis eases) without React.
 */

export interface CategoryModel {
  id: string
  name: string
  count: number
  members: number[]
  /** Current centroid (updated as nodes move). */
  cx: number
  cy: number
  cz: number
  radius: number
  /** Indices of the most connected notes, used for labels in focus mode. */
  hubs: number[]
}

export class GraphModel {
  version = 0
  count = 0
  ids: string[] = []
  notes: NoteMeta[] = []
  index = new Map<string, number>()

  pos = new Float32Array(0)
  target = new Float32Array(0)
  size = new Float32Array(0)
  bright = new Float32Array(0)
  phase = new Float32Array(0)
  birth = new Float32Array(0)
  warm = new Float32Array(0)
  emph = new Float32Array(0)
  emphTarget = new Float32Array(0)
  hover = new Float32Array(0)
  hoverTarget = new Float32Array(0)
  degree = new Uint32Array(0)
  categoryOf = new Int32Array(0)

  edgeCount = 0
  edgeA = new Uint32Array(0)
  edgeB = new Uint32Array(0)
  edgePos = new Float32Array(0)
  edgeAlpha = new Float32Array(0)
  edgeBase = new Float32Array(0)
  edgePhase = new Float32Array(0)
  adjacency: number[][] = []

  categories: CategoryModel[] = []
  categoryIndex = new Map<string, number>()

  moving = false
  emphMoving = true
  hoverMoving = false
  edgesDirty = true

  apply(snapshot: GraphSnapshot, now: number): void {
    const prevIndex = this.index
    const prevPos = this.pos
    const notes = snapshot.notes
    const n = notes.length
    const isFirst = this.count === 0

    const pos = new Float32Array(n * 3)
    const target = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const bright = new Float32Array(n)
    const phase = new Float32Array(n)
    const birth = new Float32Array(n)
    const warm = new Float32Array(n)
    const emph = new Float32Array(n)
    const emphTarget = new Float32Array(n)
    const hover = new Float32Array(n)
    const hoverTarget = new Float32Array(n)
    const degree = new Uint32Array(n)
    const categoryOf = new Int32Array(n)
    const index = new Map<string, number>()

    const renamedFrom = new Map((snapshot.change?.renamed ?? []).map((r) => [r.to, r.from]))
    notes.forEach((note, i) => index.set(note.id, i))

    // Edges and degree.
    const edges = snapshot.edges.filter((e) => index.has(e.source) && index.has(e.target))
    const m = edges.length
    const edgeA = new Uint32Array(m)
    const edgeB = new Uint32Array(m)
    const adjacency: number[][] = Array.from({ length: n }, () => [])
    edges.forEach((e, k) => {
      const a = index.get(e.source)!
      const b = index.get(e.target)!
      edgeA[k] = a
      edgeB[k] = b
      degree[a]++
      degree[b]++
      adjacency[a].push(k)
      adjacency[b].push(k)
    })

    let maxDeg = 1
    for (let i = 0; i < n; i++) maxDeg = Math.max(maxDeg, degree[i])
    // Dense universes use finer, slightly dimmer points so they stay delicate.
    const density = Math.min(1, Math.max(0.62, 1 - Math.log10(Math.max(n, 1) / 250) * 0.22))

    for (let i = 0; i < n; i++) {
      const note = notes[i]
      const p = snapshot.positions[note.id] ?? [0, 0, 80]
      target[i * 3] = p[0]
      target[i * 3 + 1] = p[1]
      target[i * 3 + 2] = p[2]
      const prevId = prevIndex.has(note.id) ? note.id : renamedFrom.get(note.id)
      const prev = prevId !== undefined ? prevIndex.get(prevId) : undefined
      if (prev !== undefined) {
        pos[i * 3] = prevPos[prev * 3]
        pos[i * 3 + 1] = prevPos[prev * 3 + 1]
        pos[i * 3 + 2] = prevPos[prev * 3 + 2]
        birth[i] = this.birth[prev]
        emph[i] = this.emph[prev]
        hover[i] = this.hover[prev]
      } else {
        pos[i * 3] = p[0]
        pos[i * 3 + 1] = p[1]
        pos[i * 3 + 2] = p[2]
        birth[i] = isFirst ? -1000 : now
        emph[i] = isFirst ? 1 : 0.6
      }
      const h = hash(note.id)
      phase[i] = (h % 10007) / 10007
      warm[i] = ((h >>> 8) % 1000) / 1000 < 0.35 ? (((h >>> 4) % 100) / 100) * 0.8 : 0
      const d = degree[i]
      const importance = Math.log2(1 + d) / Math.log2(1 + maxDeg)
      // Most stars are 1–3 px; hubs are slightly larger and brighter.
      size[i] = (1.2 + importance * 1.9 + (((h >>> 12) % 100) / 100) * 0.35) * density
      bright[i] = (0.5 + importance * 0.55 + (((h >>> 16) % 100) / 100) * 0.18) * (0.75 + density * 0.25)
      emphTarget[i] = 1
    }

    // Categories.
    const categoryIndex = new Map<string, number>()
    const categories: CategoryModel[] = snapshot.categories.map((c, ci) => {
      categoryIndex.set(c.id, ci)
      return { id: c.id, name: c.name, count: c.noteCount, members: [], cx: 0, cy: 0, cz: 0, radius: 10, hubs: [] }
    })
    for (let i = 0; i < n; i++) {
      const ci = categoryIndex.get(notes[i].category) ?? -1
      categoryOf[i] = ci
      if (ci >= 0) categories[ci].members.push(i)
    }
    for (const c of categories) {
      c.hubs = [...c.members].sort((a, b) => degree[b] - degree[a]).slice(0, 10)
    }

    this.notes = notes
    this.ids = notes.map((x) => x.id)
    this.index = index
    this.count = n
    this.pos = pos
    this.target = target
    this.size = size
    this.bright = bright
    this.phase = phase
    this.birth = birth
    this.warm = warm
    this.emph = emph
    this.emphTarget = emphTarget
    this.hover = hover
    this.hoverTarget = hoverTarget
    this.degree = degree
    this.categoryOf = categoryOf
    this.edgeCount = m
    this.edgeA = edgeA
    this.edgeB = edgeB
    this.adjacency = adjacency
    this.edgePos = new Float32Array(m * 6)
    this.edgeAlpha = new Float32Array(m * 2)
    this.edgeBase = new Float32Array(m)
    this.edgePhase = new Float32Array(m * 2)
    for (let k = 0; k < m; k++) {
      const w = edges[k].weight
      const da = degree[edgeA[k]]
      const db = degree[edgeB[k]]
      // Faint hairlines; links between hubs and repeated links read slightly stronger.
      this.edgeBase[k] = 0.05 + Math.min(0.035, (w - 1) * 0.012) + Math.min(0.03, Math.log2(1 + Math.min(da, db)) * 0.008)
      const ph = (hash(`${this.ids[edgeA[k]]}>${this.ids[edgeB[k]]}`) % 1000) / 1000
      this.edgePhase[k * 2] = ph
      this.edgePhase[k * 2 + 1] = ph
    }
    this.categories = categories
    this.categoryIndex = categoryIndex
    this.moving = true
    this.emphMoving = true
    this.edgesDirty = true
    this.updateCentroids()
    this.version++
  }

  updateCentroids(): void {
    for (const c of this.categories) {
      let x = 0
      let y = 0
      let z = 0
      for (const i of c.members) {
        x += this.target[i * 3]
        y += this.target[i * 3 + 1]
        z += this.target[i * 3 + 2]
      }
      const k = Math.max(1, c.members.length)
      c.cx = x / k
      c.cy = y / k
      c.cz = z / k
      let r = 0
      for (const i of c.members) {
        r += Math.hypot(this.target[i * 3] - c.cx, this.target[i * 3 + 1] - c.cy, this.target[i * 3 + 2] - c.cz)
      }
      c.radius = Math.max(6, (r / k) * 1.6)
    }
  }

  neighbors(i: number): number[] {
    const out: number[] = []
    for (const k of this.adjacency[i] ?? []) out.push(this.edgeA[k] === i ? this.edgeB[k] : this.edgeA[k])
    return out
  }

  /** Steps interpolations; returns flags describing which buffers changed. */
  step(dt: number): { pos: boolean; emph: boolean; hover: boolean } {
    let posChanged = false
    let emphChanged = false
    let hoverChanged = false
    if (this.moving) {
      const k = 1 - Math.exp(-dt * 2.6)
      let maxDelta = 0
      for (let i = 0; i < this.count * 3; i++) {
        const d = this.target[i] - this.pos[i]
        if (d !== 0) {
          const ad = Math.abs(d)
          if (ad < 0.002) this.pos[i] = this.target[i]
          else this.pos[i] += d * k
          if (ad > maxDelta) maxDelta = ad
        }
      }
      posChanged = true
      if (maxDelta < 0.002) this.moving = false
    }
    if (this.emphMoving) {
      const k = 1 - Math.exp(-dt * 5.5)
      let maxDelta = 0
      for (let i = 0; i < this.count; i++) {
        const d = this.emphTarget[i] - this.emph[i]
        if (d !== 0) {
          if (Math.abs(d) < 0.001) this.emph[i] = this.emphTarget[i]
          else this.emph[i] += d * k
          maxDelta = Math.max(maxDelta, Math.abs(d))
        }
      }
      emphChanged = true
      if (maxDelta < 0.001) this.emphMoving = false
    }
    if (this.hoverMoving) {
      const k = 1 - Math.exp(-dt * 12)
      let maxDelta = 0
      for (let i = 0; i < this.count; i++) {
        const d = this.hoverTarget[i] - this.hover[i]
        if (d !== 0) {
          if (Math.abs(d) < 0.002) this.hover[i] = this.hoverTarget[i]
          else this.hover[i] += d * k
          maxDelta = Math.max(maxDelta, Math.abs(d))
        }
      }
      hoverChanged = true
      if (maxDelta < 0.002) this.hoverMoving = false
    }
    if (posChanged || this.edgesDirty) this.writeEdgePositions()
    if (emphChanged || this.edgesDirty) this.writeEdgeAlpha()
    const edges = this.edgesDirty
    this.edgesDirty = false
    return { pos: posChanged || edges, emph: emphChanged || edges, hover: hoverChanged }
  }

  private writeEdgePositions(): void {
    const ep = this.edgePos
    for (let k = 0; k < this.edgeCount; k++) {
      const a = this.edgeA[k] * 3
      const b = this.edgeB[k] * 3
      const o = k * 6
      ep[o] = this.pos[a]
      ep[o + 1] = this.pos[a + 1]
      ep[o + 2] = this.pos[a + 2]
      ep[o + 3] = this.pos[b]
      ep[o + 4] = this.pos[b + 1]
      ep[o + 5] = this.pos[b + 2]
    }
  }

  private writeEdgeAlpha(): void {
    for (let k = 0; k < this.edgeCount; k++) {
      const ea = this.emph[this.edgeA[k]]
      const eb = this.emph[this.edgeB[k]]
      const e = Math.min(ea, eb, 1.25)
      const v = this.edgeBase[k] * e * e
      this.edgeAlpha[k * 2] = v
      this.edgeAlpha[k * 2 + 1] = v
    }
  }

  /**
   * Recomputes emphasis targets from the interaction state.
   * `searchIds` (optional) highlights a set of matches.
   */
  setEmphasis(selected: number | null, focusCategory: number | null): void {
    const n = this.count
    const t = this.emphTarget
    if (selected !== null && selected >= 0) {
      const nb = new Set(this.neighbors(selected))
      for (let i = 0; i < n; i++) {
        const inFocus = focusCategory === null || this.categoryOf[i] === focusCategory
        t[i] = i === selected ? 2.3 : nb.has(i) ? 1.45 : inFocus ? 0.2 : 0.07
      }
    } else if (focusCategory !== null && focusCategory >= 0) {
      for (let i = 0; i < n; i++) t[i] = this.categoryOf[i] === focusCategory ? 1.18 : 0.08
    } else {
      for (let i = 0; i < n; i++) t[i] = 1
    }
    this.emphMoving = true
  }

  setHover(index: number | null): void {
    this.hoverTarget.fill(0)
    if (index !== null && index >= 0) this.hoverTarget[index] = 1
    this.hoverMoving = true
  }
}

export function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Singleton shared between the scene and the UI. */
export const graphModel = new GraphModel()
