import {
  DEFAULT_SETTINGS,
  type ApplicationSettings,
  type ObsidianOpenMode,
  type QualityPreset,
  type ReducedMotionPreference
} from '../types'

/**
 * Validation helpers for everything that crosses the IPC boundary. The main
 * process never trusts renderer input: strings are length-limited, enums are
 * checked against allow-lists and numbers are clamped.
 */

export const MAX_NOTE_ID_LENGTH = 4096
export const MAX_QUERY_LENGTH = 512

export function isNoteId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > MAX_NOTE_ID_LENGTH) return false
  if (value.includes('\0')) return false
  if (value.startsWith('/') || value.startsWith('\\')) return false
  // Reject traversal segments outright; ids are vault-relative POSIX paths.
  const segments = value.split('/')
  return !segments.some((s) => s === '..' || s === '.' || s === '')
}

export function sanitizeQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\0/g, '').slice(0, MAX_QUERY_LENGTH)
  return trimmed
}

const QUALITY: QualityPreset[] = ['high', 'balanced', 'performance']
const MOTION: ReducedMotionPreference[] = ['system', 'reduce', 'full']
const OPEN_MODE: ObsidianOpenMode[] = ['current', 'tab']

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function num(value: unknown, lo: number, hi: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return clamp(value, lo, hi)
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/**
 * Validates a partial settings patch coming from the renderer. Unknown keys
 * and invalid values are dropped. `vaultPath` and `demoMode` can only be
 * changed by the main process (via the native dialog), never by the renderer.
 */
export function sanitizeSettingsPatch(input: unknown): Partial<ApplicationSettings> {
  if (!input || typeof input !== 'object') return {}
  const src = input as Record<string, unknown>
  const out: Partial<ApplicationSettings> = {}
  if (typeof src.quality === 'string' && QUALITY.includes(src.quality as QualityPreset)) {
    out.quality = src.quality as QualityPreset
  }
  if (typeof src.reducedMotion === 'string' && MOTION.includes(src.reducedMotion as ReducedMotionPreference)) {
    out.reducedMotion = src.reducedMotion as ReducedMotionPreference
  }
  if (typeof src.obsidianOpenMode === 'string' && OPEN_MODE.includes(src.obsidianOpenMode as ObsidianOpenMode)) {
    out.obsidianOpenMode = src.obsidianOpenMode as ObsidianOpenMode
  }
  const starBrightness = num(src.starBrightness, 0.3, 2.5)
  if (starBrightness !== undefined) out.starBrightness = starBrightness
  const connectionOpacity = num(src.connectionOpacity, 0, 3)
  if (connectionOpacity !== undefined) out.connectionOpacity = connectionOpacity
  const dustDensity = num(src.dustDensity, 0, 2)
  if (dustDensity !== undefined) out.dustDensity = dustDensity
  for (const key of ['showConnections', 'orbitalsEnabled', 'launchAtLogin', 'includeTxt', 'briefingCollapsed'] as const) {
    const b = bool(src[key])
    if (b !== undefined) out[key] = b
  }
  if (src.lastCategory === null) out.lastCategory = null
  else if (typeof src.lastCategory === 'string' && src.lastCategory.length < 512) out.lastCategory = src.lastCategory
  if (src.camera && typeof src.camera === 'object') {
    const cam = src.camera as Record<string, unknown>
    out.camera = {
      inertia: bool(cam.inertia) ?? DEFAULT_SETTINGS.camera.inertia,
      invertDrag: bool(cam.invertDrag) ?? DEFAULT_SETTINGS.camera.invertDrag,
      zoomSpeed: num(cam.zoomSpeed, 0.25, 3) ?? DEFAULT_SETTINGS.camera.zoomSpeed
    }
  }
  return out
}

/** Merges a stored (possibly outdated or hand-edited) settings object with defaults. */
export function normalizeStoredSettings(input: unknown): ApplicationSettings {
  const base: ApplicationSettings = structuredClone(DEFAULT_SETTINGS)
  if (!input || typeof input !== 'object') return base
  const src = input as Record<string, unknown>
  const patch = sanitizeSettingsPatch(src)
  const merged: ApplicationSettings = { ...base, ...patch, camera: { ...base.camera, ...(patch.camera ?? {}) } }
  if (typeof src.vaultPath === 'string' && src.vaultPath.length < 4096) merged.vaultPath = src.vaultPath
  if (typeof src.demoMode === 'boolean') merged.demoMode = src.demoMode
  return merged
}

/** Only these URL schemes may be opened externally from note content. */
export function isSafeExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:'
  } catch {
    return false
  }
}
