import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Matrix4, type PerspectiveCamera } from 'three'
import { graphModel } from '../../../lib/graphModel'
import { rig, runtime, shared } from '../shared'
import { FOV } from '../camera/cameraRig'
import { useStore } from '../../../state/store'
import { nexus } from '../../../lib/bridge'

const PICK_RADIUS = 11 // CSS px

/**
 * Screen-space picking: project every star and pick the nearest one under
 * the cursor. O(n) per pointer move, which comfortably handles 5,000+ stars
 * and respects the exact apparent size of tiny points far better than a 3D
 * raycast with a world-space threshold.
 */
export function pickStar(camera: PerspectiveCamera, x: number, y: number, width: number, height: number): number {
  const m = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements
  const pos = graphModel.pos
  const emph = graphModel.emph
  const bhZ = shared.uBHViewZ.value
  const bhX = (shared.uBHNdc.value.x + 1) * 0.5 * width
  const bhY = (1 - shared.uBHNdc.value.y) * 0.5 * height
  const bhR = shared.uBHNdcRadius.value * 0.5 * height * 0.8
  const v = camera.matrixWorldInverse.elements
  let best = -1
  let bestD = PICK_RADIUS * PICK_RADIUS
  for (let i = 0; i < graphModel.count; i++) {
    if (emph[i] < 0.15) continue
    const px = pos[i * 3]
    const py = pos[i * 3 + 1]
    const pz = pos[i * 3 + 2]
    const cw = m[3] * px + m[7] * py + m[11] * pz + m[15]
    if (cw <= 0.1) continue
    const sx = ((m[0] * px + m[4] * py + m[8] * pz + m[12]) / cw + 1) * 0.5 * width
    const sy = (1 - (m[1] * px + m[5] * py + m[9] * pz + m[13]) / cw) * 0.5 * height
    const dx = sx - x
    const dy = sy - y
    const d = dx * dx + dy * dy
    if (d >= bestD) continue
    // Stars hidden behind the event horizon cannot be picked.
    const vz = v[2] * px + v[6] * py + v[10] * pz + v[14]
    if (vz < bhZ && (sx - bhX) ** 2 + (sy - bhY) ** 2 < bhR * bhR) continue
    best = i
    bestD = d
  }
  return best
}

export function Interaction() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as PerspectiveCamera

  useEffect(() => {
    const el = gl.domElement
    let down: { x: number; y: number; button: number; pan: boolean; moved: boolean } | null = null
    let last = { x: 0, y: 0 }
    let pendingHover: { x: number; y: number } | null = null
    let raf = 0
    let lastClick: { at: number; x: number; y: number; id: string } | null = null

    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }
    }

    const doHover = () => {
      raf = 0
      if (!pendingHover || down?.moved) return
      const p = pendingHover
      pendingHover = null
      const r = el.getBoundingClientRect()
      const idx = pickStar(camera, p.x, p.y, r.width, r.height)
      const id = idx >= 0 ? graphModel.ids[idx] : null
      useStore.getState().hover(id)
      el.style.cursor = id ? 'pointer' : 'default'
    }

    const onDown = (e: PointerEvent) => {
      const p = local(e)
      const pan = e.button === 2 || e.button === 1 || e.shiftKey || e.altKey
      down = { x: p.x, y: p.y, button: e.button, pan, moved: false }
      last = { x: p.x, y: p.y }
      el.setPointerCapture(e.pointerId)
    }

    const onMove = (e: PointerEvent) => {
      const p = local(e)
      if (down) {
        const dx = p.x - last.x
        const dy = p.y - last.y
        if (!down.moved && Math.hypot(p.x - down.x, p.y - down.y) > 4) {
          down.moved = true
          runtime.dragging = true
          useStore.getState().hover(null)
          useStore.getState().markInteracted()
          el.style.cursor = down.pan ? 'move' : 'grabbing'
        }
        if (down.moved) {
          if (down.pan) {
            const worldPerPx = (2 * rig.current.distance * Math.tan(((FOV / 2) * Math.PI) / 180)) / p.h
            rig.pan(dx * worldPerPx, dy * worldPerPx, camera)
          } else {
            const inv = useStore.getState().settings.camera.invertDrag ? -1 : 1
            rig.rotate(-dx * 0.0042 * inv, dy * 0.0034 * inv)
          }
        }
        last = { x: p.x, y: p.y }
        return
      }
      pendingHover = { x: p.x, y: p.y }
      if (!raf) raf = requestAnimationFrame(doHover)
    }

    const onUp = (e: PointerEvent) => {
      if (!down) return
      const wasDrag = down.moved
      const button = down.button
      down = null
      runtime.dragging = false
      el.style.cursor = 'default'
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      if (wasDrag || button !== 0) return
      const p = local(e)
      const store = useStore.getState()
      const now = performance.now()
      // Double-click on a star opens the note in Obsidian. The camera starts
      // moving after the first click, so match on the first click's star.
      if (lastClick && now - lastClick.at < 340 && Math.hypot(p.x - lastClick.x, p.y - lastClick.y) < 8) {
        void nexus.vault.openInObsidian(lastClick.id)
        lastClick = null
        return
      }
      const idx = pickStar(camera, p.x, p.y, p.w, p.h)
      if (idx >= 0) {
        const id = graphModel.ids[idx]
        lastClick = { at: now, x: p.x, y: p.y, id }
        store.select(id)
      } else {
        lastClick = null
        if (store.selectedId) store.select(null)
        else if (store.panelOpen) store.setPanelOpen(false)
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      useStore.getState().markInteracted()
      const speed = useStore.getState().settings.camera.zoomSpeed
      if (e.ctrlKey) {
        // Trackpad pinch arrives as ctrl+wheel in Chromium.
        rig.zoom(Math.exp(e.deltaY * 0.012 * speed))
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.3) {
        rig.rotate(-e.deltaX * 0.0022, 0)
      } else {
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
        rig.zoom(Math.exp(dy * 0.0016 * speed))
      }
    }

    const onLeave = () => {
      if (!down) useStore.getState().hover(null)
    }
    const onContext = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('contextmenu', onContext)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('contextmenu', onContext)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [gl, camera])

  return null
}
