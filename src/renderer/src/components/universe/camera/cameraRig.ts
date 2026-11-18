import { PerspectiveCamera, Vector3 } from 'three'

/**
 * Cinematic orbit camera. The camera is described by a target point, an
 * azimuth / elevation pair, a distance and a horizontal composition shift
 * (used to keep the subject clear of the note panel). User input moves goal
 * values that the camera follows with critically damped smoothing; scripted
 * moves run as eased transitions that interrupt cleanly on input.
 */

export interface CameraState {
  tx: number
  ty: number
  tz: number
  azimuth: number
  elevation: number
  distance: number
  shift: number
}

export const FOV = 40
export const ELEVATION_LIMIT = 0.95
export const MIN_DISTANCE = 96 // never inside the black hole's lensing sphere
export const TARGET_LIMIT = 135

/** Cinematic ease: slow start, confident middle, long gentle landing. */
export function easeCinematic(t: number): number {
  const c = Math.min(Math.max(t, 0), 1)
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function wrapAngle(a: number): number {
  let x = a
  while (x > Math.PI) x -= Math.PI * 2
  while (x < -Math.PI) x += Math.PI * 2
  return x
}

export class CameraRig {
  current: CameraState
  goal: CameraState
  homeDistance = 300
  maxDistance = 520
  private transition: { from: CameraState; to: CameraState; start: number; duration: number; bump: number } | null = null
  private velocity = { az: 0, el: 0 }
  aspect = 1.6

  constructor() {
    this.current = this.homeState()
    this.goal = { ...this.current }
  }

  homeState(): CameraState {
    return { tx: 0, ty: 0, tz: 0, azimuth: 0, elevation: 0.135, distance: this.homeDistance, shift: 0 }
  }

  /** Fits the default framing so the constellation spans ~68% of the width. */
  fit(aspect: number): void {
    const wasHome = this.isNear(this.goal, this.homeState())
    this.aspect = aspect
    const tanHalf = Math.tan(((FOV / 2) * Math.PI) / 180)
    const constellationWidth = 252
    const constellationHeight = 252 * 0.72
    const byWidth = constellationWidth / (0.68 * 2 * tanHalf * aspect)
    const byHeight = constellationHeight / (0.82 * 2 * tanHalf)
    this.homeDistance = Math.max(byWidth, byHeight) + 20
    this.maxDistance = this.homeDistance * 1.8
    if (wasHome && !this.transition) {
      this.goal = this.homeState()
      this.current = { ...this.goal }
    }
  }

  private isNear(a: CameraState, b: CameraState): boolean {
    return (
      Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty) + Math.abs(a.tz - b.tz) < 1 &&
      Math.abs(wrapAngle(a.azimuth - b.azimuth)) < 0.01 &&
      Math.abs(a.elevation - b.elevation) < 0.01 &&
      Math.abs(a.distance - b.distance) < 30
    )
  }

  get busy(): boolean {
    return this.transition !== null
  }

  transitionTo(to: Partial<CameraState>, duration = 1150, bump = 0.06): void {
    const from = { ...this.current }
    const target: CameraState = { ...this.goal, ...to }
    target.azimuth = from.azimuth + wrapAngle(target.azimuth - from.azimuth)
    this.clamp(target)
    this.transition = { from, to: target, start: performance.now(), duration: Math.max(1, duration), bump }
    this.goal = { ...target }
    this.velocity.az = 0
    this.velocity.el = 0
  }

  cancelTransition(): void {
    if (!this.transition) return
    this.goal = { ...this.current }
    this.transition = null
  }

  rotate(dAz: number, dEl: number): void {
    this.cancelTransition()
    this.goal.azimuth += dAz
    this.goal.elevation += dEl
    this.velocity.az = dAz
    this.velocity.el = dEl
    this.clamp(this.goal)
  }

  zoom(factor: number): void {
    this.cancelTransition()
    this.goal.distance *= factor
    this.clamp(this.goal)
  }

  /** Pans the target in the camera's screen plane (dx, dy in world units). */
  pan(dx: number, dy: number, camera: PerspectiveCamera): void {
    this.cancelTransition()
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    this.goal.tx += -right.x * dx + up.x * dy
    this.goal.ty += -right.y * dx + up.y * dy
    this.goal.tz += -right.z * dx + up.z * dy
    this.clamp(this.goal)
  }

  setShift(shift: number, duration = 700): void {
    if (Math.abs(this.goal.shift - shift) < 1e-4) return
    if (this.transition) {
      this.transition.to.shift = shift
      this.goal.shift = shift
      return
    }
    this.transitionTo({ shift }, duration, 0)
  }

  clamp(s: CameraState): void {
    s.elevation = Math.min(ELEVATION_LIMIT, Math.max(-ELEVATION_LIMIT, s.elevation))
    const tl = Math.hypot(s.tx, s.ty, s.tz)
    if (tl > TARGET_LIMIT) {
      const k = TARGET_LIMIT / tl
      s.tx *= k
      s.ty *= k
      s.tz *= k
    }
    s.distance = Math.min(this.maxDistance, Math.max(MIN_DISTANCE * 0.85, s.distance))
  }

  update(dt: number, now: number, inertia: boolean): void {
    if (this.transition) {
      const { from, to, start, duration, bump } = this.transition
      const raw = (now - start) / duration
      const e = easeCinematic(raw)
      this.current = {
        tx: lerp(from.tx, to.tx, e),
        ty: lerp(from.ty, to.ty, e),
        tz: lerp(from.tz, to.tz, e),
        azimuth: lerp(from.azimuth, to.azimuth, e),
        elevation: lerp(from.elevation, to.elevation, e),
        distance: lerp(from.distance, to.distance, e) * (1 + Math.sin(Math.PI * Math.min(raw, 1)) * bump),
        shift: lerp(from.shift, to.shift, e)
      }
      if (raw >= 1) {
        this.current = { ...to }
        this.goal = { ...to }
        this.transition = null
      }
      return
    }
    // Inertia: keep drifting briefly after a drag release.
    if (inertia && (Math.abs(this.velocity.az) > 1e-5 || Math.abs(this.velocity.el) > 1e-5)) {
      this.velocity.az *= Math.exp(-dt * 6)
      this.velocity.el *= Math.exp(-dt * 6)
    } else {
      this.velocity.az = 0
      this.velocity.el = 0
    }
    const k = 1 - Math.exp(-dt * 9)
    const c = this.current
    const g = this.goal
    c.tx = lerp(c.tx, g.tx, k)
    c.ty = lerp(c.ty, g.ty, k)
    c.tz = lerp(c.tz, g.tz, k)
    c.azimuth = lerp(c.azimuth, g.azimuth, k)
    c.elevation = lerp(c.elevation, g.elevation, k)
    c.distance = lerp(c.distance, g.distance, k)
    c.shift = lerp(c.shift, g.shift, k)
  }

  /** Keeps the camera outside the black hole's lensing sphere. */
  private safePosition(out: Vector3): Vector3 {
    const r = out.length()
    if (r < MIN_DISTANCE) out.multiplyScalar(MIN_DISTANCE / Math.max(r, 1e-3))
    return out
  }

  apply(camera: PerspectiveCamera): void {
    const c = this.current
    const ce = Math.cos(c.elevation)
    const pos = new Vector3(
      c.tx + c.distance * Math.sin(c.azimuth) * ce,
      c.ty + c.distance * Math.sin(c.elevation),
      c.tz + c.distance * Math.cos(c.azimuth) * ce
    )
    this.safePosition(pos)
    camera.position.copy(pos)
    camera.up.set(0, 1, 0)
    camera.lookAt(c.tx, c.ty, c.tz)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    // Off-axis projection shifts the composition horizontally without rotating the view.
    camera.projectionMatrix.elements[8] = c.shift
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  }

  /** Framing for a focused constellation: cluster on the right, black hole on the left. */
  categoryFraming(cx: number, cy: number, cz: number, radius: number): Partial<CameraState> {
    let hx = cx
    let hz = cz
    const hl = Math.hypot(hx, hz)
    if (hl < 1e-3) {
      hx = 1
      hz = 0
    } else {
      hx /= hl
      hz /= hl
    }
    // Camera direction is perpendicular to the cluster's horizontal bearing.
    const azimuth = Math.atan2(-hz, hx)
    const len = Math.hypot(cx, cy, cz) || 1
    const lat = Math.asin(Math.max(-1, Math.min(1, cy / len)))
    const elevation = Math.max(-0.6, Math.min(0.7, lat * 0.55 + 0.1))
    const distance = Math.min(this.homeDistance * 0.8, Math.max(MIN_DISTANCE + 14, radius * 2.3 + 58))
    return { tx: cx * 0.6, ty: cy * 0.6, tz: cz * 0.6, azimuth, elevation, distance }
  }

  /** Framing for a selected star that keeps both it and the black hole visible. */
  noteFraming(x: number, y: number, z: number, inCategory: boolean): Partial<CameraState> {
    const r = Math.hypot(x, y, z)
    if (inCategory) {
      const g = this.goal
      return {
        tx: lerp(g.tx, x, 0.35),
        ty: lerp(g.ty, y, 0.35),
        tz: lerp(g.tz, z, 0.35),
        distance: Math.max(MIN_DISTANCE + 20, g.distance * 0.92)
      }
    }
    return {
      tx: x * 0.5,
      ty: y * 0.5,
      tz: z * 0.5,
      distance: Math.min(this.homeDistance * 0.9, Math.max(150, r * 1.75 + 40))
    }
  }
}
