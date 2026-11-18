import { useEffect, useMemo, useRef } from 'react'
import { Matrix4, type PerspectiveCamera } from 'three'
import { graphModel } from '../../../lib/graphModel'
import { domUpdaters, runtime, shared } from '../shared'
import { panelWidth } from '../Director'
import { useStore } from '../../../state/store'
import type { Category } from '@shared/types'

/**
 * HTML overlay positioned every frame from the 3D scene: constellation
 * labels, a few note labels when exploring, and the hover tooltip. Labels
 * are moved with transforms only, so React does not re-render per frame.
 */

const m = new Matrix4()
const NO_CATEGORIES: Category[] = []

function project(x: number, y: number, z: number, w: number, h: number): [number, number, number] | null {
  const e = m.elements
  const cw = e[3] * x + e[7] * y + e[11] * z + e[15]
  if (cw <= 0.5) return null
  const sx = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw + 1) * 0.5 * w
  const sy = (1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw) * 0.5 * h
  return [sx, sy, cw]
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

export function Labels() {
  const revision = useStore((s) => s.snapshot?.revision ?? 0)
  const categories = useStore((s) => s.snapshot?.categories ?? NO_CATEGORIES)
  const focused = useStore((s) => s.focusedCategory)
  const selectedId = useStore((s) => s.selectedId)
  const hoveredId = useStore((s) => s.hoveredId)
  const noteById = useStore((s) => s.noteById)
  const focusCategory = useStore((s) => s.focusCategory)
  const catRefs = useRef(new Map<string, HTMLButtonElement>())
  const noteRefs = useRef(new Map<number, HTMLDivElement>())
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Note labels: hubs of the focused constellation, or neighbours of the selection.
  const noteLabels = useMemo(() => {
    const out: number[] = []
    const sel = selectedId ? graphModel.index.get(selectedId) : undefined
    if (sel !== undefined) {
      out.push(sel)
      const nb = graphModel.neighbors(sel).sort((a, b) => graphModel.degree[b] - graphModel.degree[a])
      out.push(...nb.slice(0, 10))
    } else if (focused) {
      const ci = graphModel.categoryIndex.get(focused)
      if (ci !== undefined) out.push(...graphModel.categories[ci].hubs.slice(0, 12))
    }
    return [...new Set(out)]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, focused, revision])

  useEffect(() => {
    const placed: Array<[number, number, number, number]> = []
    const update = (camera: PerspectiveCamera, w: number, h: number) => {
      m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      const introOn = shared.uIntroOn.value > 0.5
      const intro = introOn ? smoothstep(2.8, 3.8, shared.uIntro.value) : 1
      const state = useStore.getState()
      const bhZ = shared.uBHViewZ.value
      placed.length = 0
      // Keep labels clear of the floating interface.
      placed.push([0, 0, 330, 104]) // wordmark
      placed.push([w / 2 - 190, h - 86, 380, 86]) // toolbar
      placed.push([w / 2 - 60, 0, 120, 52]) // Home
      placed.push([w - 120, 0, 120, 52]) // Pages
      const briefingVisible =
        !!state.snapshot && !state.selectedId && !state.focusedCategory && state.overlay === 'none' && !state.briefingDismissed
      if (briefingVisible) placed.push([0, 100, state.settings.briefingCollapsed ? 300 : 320, state.settings.briefingCollapsed ? 90 : 560])
      if (state.panelOpen) {
        const pw = panelWidth(w)
        placed.push([w - pw - 24, 0, pw + 24, h])
      }
      const fixedZones = placed.length
      const bhScreenX = (shared.uBHNdc.value.x + 1) * 0.5 * w
      const bhScreenY = (1 - shared.uBHNdc.value.y) * 0.5 * h

      // Category labels, most populous first so they win placement.
      const cats = [...graphModel.categories].sort((a, b) => b.count - a.count)
      for (const c of cats) {
        const el = catRefs.current.get(c.id)
        if (!el) continue
        // Project the constellation's stars to find its on-screen extent, then
        // place the label just outside it (away from the black hole) so it never
        // sits on top of a star.
        let sx = 0
        let sy = 0
        let visible = 0
        const pts: number[] = []
        for (const i of c.members) {
          const q = project(graphModel.pos[i * 3], graphModel.pos[i * 3 + 1], graphModel.pos[i * 3 + 2], w, h)
          if (!q) continue
          pts.push(q[0], q[1])
          sx += q[0]
          sy += q[1]
          visible++
        }
        if (!visible) {
          el.style.opacity = '0'
          el.style.pointerEvents = 'none'
          continue
        }
        const mx = sx / visible
        const my = sy / visible
        let dx = mx - bhScreenX
        let dy = my - bhScreenY
        const dl = Math.hypot(dx, dy)
        if (dl < 1) {
          dx = 0
          dy = -1
        } else {
          dx /= dl
          dy /= dl
        }
        let extent = 0
        for (let k = 0; k < pts.length; k += 2) extent = Math.max(extent, (pts[k] - mx) * dx + (pts[k + 1] - my) * dy)
        extent = Math.min(extent, Math.max(w, h) * 0.3)
        const width = Math.max(c.name.length * 7 + 20, 70)
        const height = 34
        const ax = mx + dx * (extent + 16)
        const ay = my + dy * (extent + 12)
        // Anchor the box on the side facing away from the cluster.
        const p: [number, number] = [ax + dx * (width / 2), ay + dy * (height / 2)]
        // View-space depth relative to the black hole: far-side labels recede.
        const e = camera.matrixWorldInverse.elements
        const vz = e[2] * c.cx + e[6] * c.cy + e[10] * c.cz + e[14]
        const depth = smoothstep(-120, 60, vz - bhZ)
        let opacity = (0.5 + 0.5 * depth) * intro
        if (state.focusedCategory) opacity *= state.focusedCategory === c.id ? 0 : 0.18
        if (state.selectedId && !state.focusedCategory) opacity *= 0.35
        if (state.overlay !== 'none') opacity = 0
        // Constellations whose stars are off screen get no label.
        if (mx < -30 || mx > w + 30 || my < -20 || my > h + 20) {
          el.style.opacity = '0'
          el.style.pointerEvents = 'none'
          continue
        }
        const baseY = Math.min(Math.max(p[1] - height / 2, 56), h - height - 12)
        let x = Math.min(Math.max(p[0] - width / 2, 12), w - width - 12)
        let y = baseY
        const hit = (yy: number) =>
          yy < 56 || yy > h - height - 12 || placed.some(([px, py, pw, ph]) => x < px + pw && x + width > px && yy < py + ph && yy + height > py)
        let overlaps = hit(y)
        for (let attempt = 1; attempt <= 6 && overlaps; attempt++) {
          const dy = Math.ceil(attempt / 2) * (height + 4) * (attempt % 2 ? 1 : -1)
          if (!hit(baseY + dy)) {
            y = baseY + dy
            overlaps = false
          }
        }
        if (overlaps) {
          // Try sliding sideways away from the obstacle (e.g. the briefing column).
          const shifted = placed.slice(0, fixedZones).reduce((acc, [px, , pw]) => (x < px + pw && x + width > px ? Math.max(acc, px + pw + 8) : acc), x)
          if (shifted !== x && shifted + width < w - 12) {
            x = shifted
            overlaps = hit(y)
          }
        }
        if (overlaps) opacity = 0
        placed.push([x, y, width, height])
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        el.style.opacity = opacity.toFixed(3)
        el.style.pointerEvents = opacity > 0.25 ? 'auto' : 'none'
      }

      // Note labels near stars (in priority order; overlapping ones are hidden).
      const noteBoxes: Array<[number, number, number, number]> = []
      for (const [idx, el] of noteRefs.current) {
        if (idx >= graphModel.count) continue
        const pos = graphModel.pos
        const p = project(pos[idx * 3], pos[idx * 3 + 1], pos[idx * 3 + 2], w, h)
        if (!p || state.overlay !== 'none' || p[0] < 6 || p[0] > w - 40 || p[1] < 50 || p[1] > h - 20) {
          el.style.opacity = '0'
          continue
        }
        const x = p[0] + 9
        const y = p[1] - 7
        const bw = Math.min(200, el.offsetWidth || 80)
        const box: [number, number, number, number] = [x, y, bw, 14]
        const clash = noteBoxes.some(([bx, by, bww, bh]) => x < bx + bww && x + bw > bx && y < by + bh && y + 14 > by)
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        el.style.opacity = clash ? '0' : String(Math.min(1, graphModel.emph[idx]) * 0.9)
        if (!clash) noteBoxes.push(box)
      }

      // Tooltip.
      const tip = tooltipRef.current
      if (tip) {
        const hid = state.hoveredId
        const idx = hid ? graphModel.index.get(hid) : undefined
        if (idx === undefined || runtime.dragging) {
          tip.style.opacity = '0'
        } else {
          const pos = graphModel.pos
          const p = project(pos[idx * 3], pos[idx * 3 + 1], pos[idx * 3 + 2], w, h)
          if (!p) tip.style.opacity = '0'
          else {
            const tw = tip.offsetWidth
            const left = p[0] + 16 + tw > w - 12 ? p[0] - 16 - tw : p[0] + 16
            tip.style.transform = `translate3d(${left.toFixed(1)}px, ${(p[1] - 14).toFixed(1)}px, 0)`
            tip.style.opacity = '1'
          }
        }
      }
    }
    domUpdaters.add(update)
    return () => {
      domUpdaters.delete(update)
    }
  }, [])

  const hovered = hoveredId ? noteById.get(hoveredId) : undefined
  const hoveredLinks = hovered ? new Set([...hovered.outgoing, ...hovered.backlinks]).size : 0

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={false}>
      {categories.map((c) => (
        <button
          key={c.id}
          ref={(el) => {
            if (el) catRefs.current.set(c.id, el)
            else catRefs.current.delete(c.id)
          }}
          onClick={() => focusCategory(c.id)}
          className="category-label absolute left-0 top-0 text-left"
          style={{ opacity: 0 }}
          aria-label={`Explore ${c.name}, ${c.noteCount} notes`}
        >
          <span className="block text-[11.5px] font-medium tracking-[0.02em] text-[#ECEAE5]">{c.name}</span>
          <span className="block text-[10px] tracking-[0.04em] text-[#7E7D80]">
            {c.noteCount} {c.noteCount === 1 ? 'note' : 'notes'}
          </span>
        </button>
      ))}
      {noteLabels.map((idx) => {
        const note = graphModel.notes[idx]
        if (!note) return null
        return (
          <div
            key={`${revision}-${idx}`}
            ref={(el) => {
              if (el) noteRefs.current.set(idx, el)
              else noteRefs.current.delete(idx)
            }}
            className="absolute left-0 top-0 max-w-[200px] truncate text-[10.5px] tracking-[0.01em] text-[#B9B7B2]"
            style={{ opacity: 0, textShadow: '0 0 6px #030304, 0 0 2px #030304' }}
          >
            {note.title}
          </div>
        )
      })}
      <div
        ref={tooltipRef}
        className="absolute left-0 top-0 max-w-[280px] rounded-[7px] border border-white/[0.09] bg-[#0D0D10]/90 px-2.5 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md transition-opacity duration-150"
        style={{ opacity: 0 }}
        role="tooltip"
      >
        {hovered && (
          <>
            <div className="truncate text-[12px] font-medium text-[#EDEBE6]">{hovered.title}</div>
            <div className="mt-0.5 truncate text-[10.5px] text-[#86858A]">
              {hovered.folder || 'Vault root'} · {hoveredLinks} {hoveredLinks === 1 ? 'link' : 'links'}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
