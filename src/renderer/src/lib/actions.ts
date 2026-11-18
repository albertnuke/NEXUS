import { useStore } from '../state/store'
import { rig } from '../components/universe/shared'
import { nexus } from './bridge'

/**
 * High-level user actions shared by buttons, keyboard shortcuts and the
 * native menu, so every entry point behaves identically.
 */

/** Smoothly returns to the full universe view; optionally opens the dashboard. */
export function goHome(openDashboard: boolean): void {
  const s = useStore.getState()
  s.select(null)
  s.focusCategory(null)
  s.setPanelOpen(false)
  rig.transitionTo(rig.homeState(), s.settings.reducedMotion === 'reduce' ? 400 : 1250, 0.03)
  s.setOverlay(openDashboard ? 'home' : 'none')
  if (!openDashboard) s.dismissBriefing(false)
}

export function resetCamera(): void {
  goHome(false)
}

export function zoomBy(factor: number): void {
  rig.zoom(factor)
}

/** Selects a note, revealing its constellation context and opening the panel. */
export function openNote(id: string): void {
  const s = useStore.getState()
  if (!s.noteById.has(id)) return
  s.setOverlay('none')
  const note = s.noteById.get(id)!
  if (s.focusedCategory && s.focusedCategory !== note.category) s.focusCategory(null)
  s.select(id, { openPanel: true })
}

export function toggleConnections(): void {
  const s = useStore.getState()
  void nexus.settings.update({ showConnections: !s.settings.showConnections })
}

/** Escape closes the top-most layer only. */
export function escape(): void {
  const s = useStore.getState()
  if (s.overlay !== 'none') return s.setOverlay('none')
  if (s.selectedId) {
    s.select(null)
    s.setPanelOpen(false)
    return
  }
  if (s.panelOpen) return s.setPanelOpen(false)
  if (s.focusedCategory) return s.focusCategory(null)
}
