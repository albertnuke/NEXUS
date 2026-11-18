import { useEffect, useRef } from 'react'
import { graphModel } from '../../lib/graphModel'
import { useReducedMotion, useStore } from '../../state/store'
import { rig } from './shared'
import type { CameraState } from './camera/cameraRig'

/** Width of the right note panel in CSS pixels for a given window width. */
export function panelWidth(windowWidth: number): number {
  return Math.round(Math.min(500, Math.max(360, windowWidth * 0.28)))
}

/**
 * Translates UI state (selected note, focused category, open panels) into
 * camera moves and emphasis targets. This is the choreographer of the
 * cinematic sequences.
 */
export function Director() {
  const selectedId = useStore((s) => s.selectedId)
  const focused = useStore((s) => s.focusedCategory)
  const panelOpen = useStore((s) => s.panelOpen)
  const revision = useStore((s) => s.snapshot?.revision ?? 0)
  const reduced = useReducedMotion()
  const beforeSelection = useRef<CameraState | null>(null)
  const prevSelected = useRef<string | null>(null)
  const prevFocused = useRef<string | null>(null)

  const duration = (ms: number) => (reduced ? Math.min(ms, 420) : ms)

  // Emphasis follows selection / focus.
  useEffect(() => {
    const sel = selectedId ? (graphModel.index.get(selectedId) ?? null) : null
    const cat = focused ? (graphModel.categoryIndex.get(focused) ?? null) : null
    graphModel.setEmphasis(sel, cat)
  }, [selectedId, focused, revision])

  // Category focus.
  useEffect(() => {
    if (focused === prevFocused.current) return
    prevFocused.current = focused
    beforeSelection.current = null
    if (focused) {
      const ci = graphModel.categoryIndex.get(focused)
      if (ci === undefined) return
      const c = graphModel.categories[ci]
      rig.transitionTo(rig.categoryFraming(c.cx, c.cy, c.cz, c.radius), duration(1250), 0.04)
    } else if (!useStore.getState().selectedId) {
      rig.transitionTo(rig.homeState(), duration(1250), 0.03)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused])

  // Note selection.
  useEffect(() => {
    const prev = prevSelected.current
    prevSelected.current = selectedId
    if (selectedId === prev) return
    if (selectedId) {
      const idx = graphModel.index.get(selectedId)
      if (idx === undefined) return
      if (!prev) beforeSelection.current = { ...rig.goal }
      const p = graphModel.target
      const inCat = !!useStore.getState().focusedCategory
      rig.transitionTo(rig.noteFraming(p[idx * 3], p[idx * 3 + 1], p[idx * 3 + 2], inCat), duration(1050), 0.02)
    } else if (beforeSelection.current) {
      // Return to the composition that preceded the selection.
      const back = beforeSelection.current
      beforeSelection.current = null
      rig.transitionTo({ ...back, shift: rig.goal.shift }, duration(1000), 0.02)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // Keep the subject clear of the note panel by shifting the composition.
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth
      const shift = panelOpen ? panelWidth(w) / w : 0
      rig.setShift(shift, duration(750))
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen])

  return null
}
