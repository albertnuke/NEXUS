import { Vector2, type PerspectiveCamera } from 'three'
import { CameraRig } from './camera/cameraRig'
import type { QualityPreset } from '@shared/types'

/**
 * Uniform objects shared by every material in the universe, plus the camera
 * rig and a registry of per-frame DOM updaters (labels, tooltip).
 */
export const shared = {
  uTime: { value: 0 },
  uMotion: { value: 1 },
  uIntro: { value: 0 },
  uIntroOn: { value: 1 },
  uPixelRatio: { value: 1 },
  uAspect: { value: 1.6 },
  uBHViewZ: { value: -300 },
  uBHNdc: { value: new Vector2(0, 0) },
  uBHNdcRadius: { value: 0.05 }
}

export const rig = new CameraRig()

export type FrameUpdater = (camera: PerspectiveCamera, width: number, height: number) => void
export const domUpdaters = new Set<FrameUpdater>()

/** World units per Schwarzschild radius for the black hole. */
export const BH_SCALE = 2.7

export interface QualityProfile {
  dpr: [number, number]
  multisampling: number
  bloom: boolean
  bhSteps: number
  noiseOctaves: number
  nebulaScale: number
  dust: number
}

export const QUALITY: Record<QualityPreset, QualityProfile> = {
  high: { dpr: [1, 2], multisampling: 4, bloom: true, bhSteps: 170, noiseOctaves: 5, nebulaScale: 0.33, dust: 1 },
  balanced: { dpr: [1, 1.5], multisampling: 2, bloom: true, bhSteps: 120, noiseOctaves: 4, nebulaScale: 0.25, dust: 0.7 },
  performance: { dpr: [1, 1], multisampling: 0, bloom: false, bhSteps: 78, noiseOctaves: 3, nebulaScale: 0.2, dust: 0.4 }
}

/** Mutable runtime flags read by the render loop. */
export const runtime = {
  showConnections: true,
  connectionOpacity: 1,
  starBrightness: 1,
  orbitals: true,
  reducedMotion: false,
  introStart: performance.now(),
  dragging: false,
  camera: null as PerspectiveCamera | null
}
