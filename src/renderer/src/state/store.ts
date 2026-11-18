import { create } from 'zustand'
import {
  DEFAULT_SETTINGS,
  type AppInfo,
  type ApplicationSettings,
  type GraphSnapshot,
  type NoteMeta,
  type VaultStatus
} from '@shared/types'

/**
 * UI state. High-frequency render data (positions, emphasis) lives in the
 * GraphModel instead, so React never re-renders per frame.
 */

export type Overlay = 'none' | 'home' | 'settings' | 'palette'

export interface UIState {
  status: VaultStatus
  snapshot: GraphSnapshot | null
  noteById: Map<string, NoteMeta>
  settings: ApplicationSettings
  appInfo: AppInfo | null
  systemReducedMotion: boolean

  selectedId: string | null
  hoveredId: string | null
  focusedCategory: string | null
  panelOpen: boolean
  overlay: Overlay
  briefingDismissed: boolean
  interacted: boolean

  setStatus(s: VaultStatus): void
  setSnapshot(s: GraphSnapshot | null): void
  setSettings(s: ApplicationSettings): void
  setAppInfo(a: AppInfo): void
  setSystemReducedMotion(v: boolean): void
  select(id: string | null, opts?: { openPanel?: boolean }): void
  hover(id: string | null): void
  focusCategory(id: string | null): void
  setPanelOpen(open: boolean): void
  setOverlay(o: Overlay): void
  dismissBriefing(v: boolean): void
  markInteracted(): void
}

export const useStore = create<UIState>((set, get) => ({
  status: { kind: 'none' },
  snapshot: null,
  noteById: new Map(),
  settings: DEFAULT_SETTINGS,
  appInfo: null,
  systemReducedMotion: false,

  selectedId: null,
  hoveredId: null,
  focusedCategory: null,
  panelOpen: false,
  overlay: 'none',
  briefingDismissed: false,
  interacted: false,

  setStatus: (status) => set({ status }),
  setSnapshot: (snapshot) => {
    const noteById = new Map((snapshot?.notes ?? []).map((n) => [n.id, n]))
    const { selectedId, hoveredId, focusedCategory } = get()
    const cats = new Set((snapshot?.categories ?? []).map((c) => c.id))
    let nextSelected = selectedId && noteById.has(selectedId) ? selectedId : null
    // Follow a renamed note.
    if (selectedId && !nextSelected && snapshot?.change?.renamed) {
      const r = snapshot.change.renamed.find((x) => x.from === selectedId)
      if (r && noteById.has(r.to)) nextSelected = r.to
    }
    set({
      snapshot,
      noteById,
      selectedId: nextSelected,
      hoveredId: hoveredId && noteById.has(hoveredId) ? hoveredId : null,
      focusedCategory: focusedCategory && cats.has(focusedCategory) ? focusedCategory : null
    })
  },
  setSettings: (settings) => set({ settings }),
  setAppInfo: (appInfo) => set({ appInfo, systemReducedMotion: appInfo.systemReducedMotion }),
  setSystemReducedMotion: (systemReducedMotion) => set({ systemReducedMotion }),
  select: (id, opts) => {
    set({
      selectedId: id,
      panelOpen: id ? (opts?.openPanel ?? true) : get().panelOpen,
      interacted: id ? true : get().interacted
    })
  },
  hover: (hoveredId) => {
    if (get().hoveredId !== hoveredId) set({ hoveredId })
  },
  focusCategory: (focusedCategory) => {
    // Navigating to another constellation releases a selection that lives elsewhere.
    const { selectedId, noteById } = get()
    const keep = !focusedCategory || !selectedId || noteById.get(selectedId)?.category === focusedCategory
    set({
      focusedCategory,
      interacted: focusedCategory ? true : get().interacted,
      ...(keep ? {} : { selectedId: null, panelOpen: false })
    })
  },
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setOverlay: (overlay) => set({ overlay }),
  dismissBriefing: (briefingDismissed) => set({ briefingDismissed }),
  markInteracted: () => {
    if (!get().interacted || !get().briefingDismissed) set({ interacted: true, briefingDismissed: true })
  }
}))

export function useReducedMotion(): boolean {
  const pref = useStore((s) => s.settings.reducedMotion)
  const system = useStore((s) => s.systemReducedMotion)
  return pref === 'reduce' || (pref === 'system' && system)
}
