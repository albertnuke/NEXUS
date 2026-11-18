import { useEffect } from 'react'
import { Universe } from './components/universe/Universe'
import { TopBar } from './components/overlays/TopBar'
import { Toolbar } from './components/overlays/Toolbar'
import { Briefing } from './components/overlays/Briefing'
import { Onboarding } from './components/overlays/Onboarding'
import { NotePanel } from './components/overlays/NotePanel'
import { HomeDashboard } from './components/dashboard/HomeDashboard'
import { CommandPalette } from './components/search/CommandPalette'
import { SettingsOverlay } from './components/settings/SettingsOverlay'
import { useStore } from './state/store'
import { nexus } from './lib/bridge'
import { graphModel } from './lib/graphModel'
import { escape, goHome, openNote, resetCamera, toggleConnections, zoomBy } from './lib/actions'
import { rig, runtime, shared } from './components/universe/shared'
import type { GraphSnapshot, MenuCommand } from '@shared/types'
import { Vector3 } from 'three'

function applySnapshot(snap: GraphSnapshot | null) {
  if (snap) graphModel.apply(snap, shared.uTime.value)
  useStore.getState().setSnapshot(snap)
}

let lastKeyboardSearch = 0

/** Menu commands. ⌘K may reach us twice (page keydown + native menu); toggle once. */
function runMenuCommand(cmd: MenuCommand) {
  if (cmd === 'search' && performance.now() - lastKeyboardSearch < 500) return
  runCommand(cmd)
}

function runCommand(cmd: MenuCommand) {
  const s = useStore.getState()
  switch (cmd) {
    case 'search':
      if (s.snapshot) s.setOverlay(s.overlay === 'palette' ? 'none' : 'palette')
      break
    case 'open-vault':
      void nexus.vault.select()
      break
    case 'refresh-index':
      void nexus.vault.reindex()
      break
    case 'reset-camera':
      resetCamera()
      break
    case 'settings':
      s.setOverlay(s.overlay === 'settings' ? 'none' : 'settings')
      break
    case 'home':
      if (s.snapshot) goHome(true)
      break
    case 'pages':
      if (s.snapshot) {
        s.setOverlay('none')
        s.setPanelOpen(!s.panelOpen)
      }
      break
    case 'toggle-connections':
      toggleConnections()
      break
    case 'zoom-in':
      zoomBy(0.8)
      break
    case 'zoom-out':
      zoomBy(1.25)
      break
    case 'escape':
      escape()
      break
  }
}

export function App() {
  useEffect(() => {
    const store = useStore.getState()
    let alive = true
    void (async () => {
      const [info, settings, status, snapshot] = await Promise.all([
        nexus.app.info(),
        nexus.settings.get(),
        nexus.vault.getStatus(),
        nexus.vault.getSnapshot()
      ])
      if (!alive) return
      store.setAppInfo(info)
      store.setSettings(settings)
      store.setStatus(status)
      applySnapshot(snapshot)
      if (snapshot && settings.lastCategory && snapshot.categories.some((c) => c.id === settings.lastCategory)) {
        // Restore the last explored constellation after the launch sequence.
        setTimeout(() => useStore.getState().focusCategory(settings.lastCategory), runtime.reducedMotion ? 200 : 3600)
      }
      if (info.e2e) exposeTestHooks()
    })()
    const offs = [
      nexus.vault.onStatus((s) => useStore.getState().setStatus(s)),
      nexus.vault.onSnapshot((snap) => applySnapshot(snap)),
      nexus.settings.onChange((s) => useStore.getState().setSettings(s)),
      nexus.app.onMenu(runMenuCommand)
    ]
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMq = () => useStore.getState().setSystemReducedMotion(mq.matches)
    mq.addEventListener('change', onMq)
    return () => {
      alive = false
      offs.forEach((off) => off())
      mq.removeEventListener('change', onMq)
    }
  }, [])

  const hasGraph = useStore((s) => !!s.snapshot)

  // Clear the graph when the vault is disconnected or becomes empty.
  const statusKind = useStore((s) => s.status.kind)
  useEffect(() => {
    if (statusKind === 'none' || statusKind === 'empty') {
      if (useStore.getState().snapshot) {
        graphModel.apply({ ...emptySnapshot() }, shared.uTime.value)
        useStore.getState().setSnapshot(null)
      }
    }
  }, [statusKind])

  // Remember the last explored constellation.
  const focused = useStore((s) => s.focusedCategory)
  useEffect(() => {
    if (useStore.getState().snapshot) void nexus.settings.update({ lastCategory: focused })
  }, [focused])

  // Keyboard: Escape closes overlays (menu accelerators handle ⌘ shortcuts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        escape()
        return
      }
      // ⌘K is handled here first (the menu shows the same accelerator); preventing
      // default stops the native menu from toggling the palette a second time.
      if (e.metaKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        lastKeyboardSearch = performance.now()
        runCommand('search')
        return
      }
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key === '/' && !e.metaKey) {
        e.preventDefault()
        runCommand('search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#030304]">
      <Universe />
      <TopBar />
      <Onboarding />
      <Briefing />
      {hasGraph && <Toolbar />}
      <NotePanel />
      <HomeDashboard />
      <CommandPalette />
      <SettingsOverlay />
    </div>
  )
}

function emptySnapshot(): GraphSnapshot {
  return {
    vault: { name: '', path: '', isDemo: false, noteCount: 0, indexedAt: 0, includeTxt: false },
    notes: [],
    edges: [],
    categories: [],
    positions: {},
    revision: -1
  }
}

/** Read-only diagnostics for automated end-to-end tests (only when NEXUS_E2E=1). */
function exposeTestHooks() {
  ;(window as unknown as Record<string, unknown>).__nexusTest = {
    starCount: () => graphModel.count,
    edgeCount: () => graphModel.edgeCount,
    ids: () => [...graphModel.ids],
    state: () => {
      const s = useStore.getState()
      return {
        selectedId: s.selectedId,
        focusedCategory: s.focusedCategory,
        panelOpen: s.panelOpen,
        overlay: s.overlay,
        status: s.status,
        revision: s.snapshot?.revision ?? null
      }
    },
    camera: () => ({ ...rig.current, busy: rig.busy }),
    cameraTo: (state: Record<string, number>, ms = 1) => rig.transitionTo(state, ms, 0),
    blackHole: () => ({ ndc: [shared.uBHNdc.value.x, shared.uBHNdc.value.y], radius: shared.uBHNdcRadius.value }),
    emphasis: (id: string) => {
      const i = graphModel.index.get(id)
      return i === undefined ? null : graphModel.emphTarget[i]
    },
    openNote: (id: string) => openNote(id),
    focusCategory: (id: string | null) => useStore.getState().focusCategory(id),
    noteMeta: (id: string) => useStore.getState().noteById.get(id) ?? null,
    /** Screen position (CSS px) of a star, or null when it is off screen / behind the camera. */
    screenPosition: (id: string) => {
      const i = graphModel.index.get(id)
      const cam = runtime.camera
      if (i === undefined || !cam) return null
      const v = new Vector3(graphModel.pos[i * 3], graphModel.pos[i * 3 + 1], graphModel.pos[i * 3 + 2]).project(cam)
      if (v.z > 1) return null
      const canvas = document.querySelector('canvas')!
      const r = canvas.getBoundingClientRect()
      return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height]
    },
    blackHoleScreen: () => {
      const canvas = document.querySelector('canvas')!
      const r = canvas.getBoundingClientRect()
      return {
        x: r.left + ((shared.uBHNdc.value.x + 1) / 2) * r.width,
        y: r.top + ((1 - shared.uBHNdc.value.y) / 2) * r.height,
        radius: (shared.uBHNdcRadius.value * r.height) / 2
      }
    }
  }
}
