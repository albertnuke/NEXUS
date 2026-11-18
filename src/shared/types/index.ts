/**
 * Shared domain types used by the main process, the preload bridge and the
 * renderer. Everything that crosses the IPC boundary is described here.
 */

export type Vec3 = [number, number, number]

export interface HeadingInfo {
  level: number
  text: string
}

export type LinkKind = 'wiki' | 'embed' | 'markdown'

export interface ParsedLink {
  /** The raw link target exactly as written, without alias / anchor. */
  target: string
  /** Optional `#heading` or `#^block` anchor. */
  anchor?: string
  /** Optional display text (`[[target|display]]` or `[display](target)`). */
  display?: string
  kind: LinkKind
}

export interface ExternalLink {
  url: string
  text?: string
}

export interface MetadataDate {
  /** Frontmatter key the date was read from, e.g. `due` or `deadline`. */
  key: string
  /** ISO date string. */
  date: string
}

/** Lightweight note description sent to the renderer for every indexed note. */
export interface NoteMeta {
  /** Stable identifier: the vault-relative POSIX path, e.g. `Security/Firewalls.md`. */
  id: string
  /** Display title (frontmatter `title`, otherwise the filename). */
  title: string
  /** Filename without extension. */
  name: string
  /** Vault-relative path (identical to id; kept explicit for readability). */
  path: string
  /** Vault-relative folder ('' for root). */
  folder: string
  /** Category (constellation) id the note belongs to. */
  category: string
  tags: string[]
  aliases: string[]
  headings: HeadingInfo[]
  /** Resolved outgoing note ids (unique, excluding self). */
  outgoing: string[]
  /** Note ids that link to this note (unique, excluding self). */
  backlinks: string[]
  /** Raw targets of internal links that could not be resolved. */
  unresolved: string[]
  externalLinkCount: number
  /** Last modified time (ms since epoch). */
  mtime: number
  /** Created time (ms since epoch), or null when it cannot be determined reliably. */
  ctime: number | null
  ctimeSource: 'frontmatter' | 'filesystem' | 'unknown'
  wordCount: number
  /** Frontmatter description/summary, if present. */
  description?: string
  /** First paragraph of the note (plain text, truncated). */
  excerpt: string
  /** Dates found in recognised frontmatter keys (due, deadline, date, ...). */
  dates: MetadataDate[]
  size: number
  /** Set when the file could not be read or parsed. */
  error?: string
}

export interface GraphEdge {
  source: string
  target: string
  /** Number of link occurrences in both directions. */
  weight: number
}

export interface Category {
  id: string
  name: string
  noteCount: number
  /** How the category was derived. */
  source: 'folder' | 'frontmatter' | 'community' | 'tag' | 'other'
}

export interface VaultInfo {
  name: string
  path: string
  isDemo: boolean
  noteCount: number
  indexedAt: number
  includeTxt: boolean
}

export interface ChangeSummary {
  added: string[]
  removed: string[]
  modified: string[]
  renamed: Array<{ from: string; to: string }>
}

export interface GraphSnapshot {
  vault: VaultInfo
  notes: NoteMeta[]
  edges: GraphEdge[]
  categories: Category[]
  /** Layout positions in world units, keyed by note id. */
  positions: Record<string, Vec3>
  /** Present for incremental updates; absent for the first full snapshot. */
  change?: ChangeSummary
  /** Monotonic revision counter. */
  revision: number
}

export type VaultStatus =
  | { kind: 'none' }
  | { kind: 'loading'; vaultPath: string; phase: 'scanning' | 'indexing' | 'layout'; progress: number }
  | { kind: 'ready' }
  | { kind: 'empty'; vaultPath: string }
  | { kind: 'error'; vaultPath?: string; message: string; code?: string }

export interface NoteContent {
  id: string
  /** Markdown body without frontmatter. */
  body: string
  /** Frontmatter as plain JSON (dates converted to ISO strings). */
  frontmatter: Record<string, unknown>
  mtime: number
  /**
   * Resolution of the note's internal links: keys are `w:<target>` for
   * wikilinks/embeds and `m:<target>` for Markdown links; values are note ids
   * or null when unresolved.
   */
  linkMap: Record<string, string | null>
  error?: string
}

export type SearchMatchKind = 'title' | 'alias' | 'heading' | 'tag' | 'path' | 'link' | 'content'

export interface SearchResult {
  id: string
  title: string
  path: string
  category: string
  kind: SearchMatchKind
  /** Context around the match (plain text). */
  snippet?: string
  /** Character range of the match within `snippet` or the title. */
  highlight?: [number, number]
  score: number
}

export type QualityPreset = 'high' | 'balanced' | 'performance'
export type ReducedMotionPreference = 'system' | 'reduce' | 'full'
export type ObsidianOpenMode = 'current' | 'tab'

export interface CameraPreferences {
  /** Auto-rotate never; we only remember a gentle preference for orbit inertia. */
  inertia: boolean
  /** Invert drag direction. */
  invertDrag: boolean
  zoomSpeed: number
}

export interface ApplicationSettings {
  vaultPath: string | null
  demoMode: boolean
  includeTxt: boolean
  quality: QualityPreset
  starBrightness: number
  connectionOpacity: number
  showConnections: boolean
  dustDensity: number
  orbitalsEnabled: boolean
  reducedMotion: ReducedMotionPreference
  launchAtLogin: boolean
  obsidianOpenMode: ObsidianOpenMode
  lastCategory: string | null
  camera: CameraPreferences
  briefingCollapsed: boolean
}

export const DEFAULT_SETTINGS: ApplicationSettings = {
  vaultPath: null,
  demoMode: false,
  includeTxt: false,
  quality: 'high',
  starBrightness: 1,
  connectionOpacity: 1,
  showConnections: true,
  dustDensity: 1,
  orbitalsEnabled: true,
  reducedMotion: 'system',
  launchAtLogin: false,
  obsidianOpenMode: 'current',
  lastCategory: null,
  camera: { inertia: true, invertDrag: false, zoomSpeed: 1 },
  briefingCollapsed: false
}

export type MenuCommand =
  | 'search'
  | 'open-vault'
  | 'refresh-index'
  | 'reset-camera'
  | 'settings'
  | 'home'
  | 'pages'
  | 'toggle-connections'
  | 'escape'
  | 'zoom-in'
  | 'zoom-out'

export interface AppInfo {
  version: string
  platform: string
  arch: string
  userDataPath: string
  e2e: boolean
  systemReducedMotion: boolean
}
