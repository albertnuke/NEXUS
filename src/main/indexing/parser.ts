import MarkdownIt from 'markdown-it'
import matter from 'gray-matter'
import type { ExternalLink, HeadingInfo, MetadataDate, ParsedLink } from '@shared/types'

/**
 * Markdown extraction for indexing. We use markdown-it (CommonMark compliant)
 * to tokenize the document so that links inside code blocks, inline code and
 * HTML are never mistaken for real links. Obsidian-specific syntax
 * (wikilinks, embeds, inline tags) is extracted from text tokens only.
 */

const md = new MarkdownIt({ html: true, linkify: false, typographer: false })

// Obsidian %% comments %% and $$ math $$ are masked before tokenizing.
const COMMENT_RE = /%%[\s\S]*?%%/g

export interface ParsedNote {
  frontmatter: Record<string, unknown>
  body: string
  title: string | null
  headings: HeadingInfo[]
  links: ParsedLink[]
  externalLinks: ExternalLink[]
  tags: string[]
  aliases: string[]
  description?: string
  excerpt: string
  wordCount: number
  dates: MetadataDate[]
  createdFromFrontmatter: number | null
  category?: string
}

/**
 * gray-matter supports executable front matter (`---js`). That is a code
 * execution vector for untrusted notes, so every non-YAML engine is disabled.
 */
const disabledEngine = {
  parse: () => ({}),
  stringify: () => ''
}
const MATTER_OPTIONS = {
  engines: {
    javascript: disabledEngine,
    js: disabledEngine,
    coffee: disabledEngine,
    coffeescript: disabledEngine,
    cson: disabledEngine
  }
} as unknown as Parameters<typeof matter>[1]

export function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string; error?: string } {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  if (!text.startsWith('---')) return { data: {}, body: text }
  try {
    // gray-matter caches by input string; pass a fresh options object to avoid cache sharing issues.
    const parsed = matter(text, { ...(MATTER_OPTIONS as object) })
    const data = parsed.data && typeof parsed.data === 'object' ? (parsed.data as Record<string, unknown>) : {}
    return { data: toPlainJson(data) as Record<string, unknown>, body: parsed.content }
  } catch (err) {
    // Invalid YAML: keep the note, drop the frontmatter block from the body.
    const end = text.indexOf('\n---', 3)
    const body = end >= 0 ? text.slice(text.indexOf('\n', end + 1) + 1) : text
    return { data: {}, body, error: `Invalid frontmatter: ${(err as Error).message.split('\n')[0]}` }
  }
}

/** Converts YAML values (Dates, nested objects) into plain JSON-safe values. */
export function toPlainJson(value: unknown, depth = 0): unknown {
  if (depth > 8) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const iso = value.toISOString()
    // YAML date-only values (`2024-05-01`) arrive as UTC midnight; keep them as calendar dates.
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
  }
  if (Array.isArray(value)) return value.slice(0, 500).map((v) => toPlainJson(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
      out[k] = toPlainJson(v, depth + 1)
    }
    return out
  }
  if (typeof value === 'string') return value.slice(0, 20000)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  return null
}

function asStringList(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) return value.flatMap((v) => asStringList(v))
  if (typeof value === 'string') {
    return value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (typeof value === 'number') return [String(value)]
  return []
}

function getKey(data: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in data) return data[key]
    const lower = key.toLowerCase()
    for (const k of Object.keys(data)) if (k.toLowerCase() === lower) return data[k]
  }
  return undefined
}

const TAG_CHARS = /^[\p{L}\p{N}_\-/]+$/u
export function normalizeTag(tag: string): string | null {
  const t = tag.trim().replace(/^#/, '')
  if (!t || !TAG_CHARS.test(t)) return null
  if (/^\d+$/.test(t)) return null // Obsidian requires at least one non-numeric character
  return t
}

// Inline tag: preceded by start or whitespace / opening punctuation.
const INLINE_TAG_RE = /(^|[\s(\[{,;])#([\p{L}\p{N}_\-/]+)/gu
// Wikilinks and embeds. Targets cannot contain `]` or newlines.
const WIKILINK_RE = /(!?)\[\[([^\[\]\n]+?)\]\]/g

export function parseWikiTarget(inner: string): { target: string; anchor?: string; display?: string } {
  // `[[target#anchor|display]]`. In tables the pipe is escaped as `\|`.
  let body = inner.replace(/\\\|/g, '|')
  let display: string | undefined
  const pipe = body.indexOf('|')
  if (pipe >= 0) {
    display = body.slice(pipe + 1).trim() || undefined
    body = body.slice(0, pipe)
  }
  let anchor: string | undefined
  const hash = body.indexOf('#')
  if (hash >= 0) {
    anchor = body.slice(hash + 1).trim() || undefined
    body = body.slice(0, hash)
  }
  return { target: body.trim(), anchor, display }
}

const EXTERNAL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

export function isExternalHref(href: string): boolean {
  return EXTERNAL_SCHEME_RE.test(href) || href.startsWith('//')
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Parses `[text](href)` targets into vault-relative link targets. */
export function parseMarkdownHref(href: string): { target: string; anchor?: string } | null {
  let h = href.trim()
  if (!h) return null
  if (h.startsWith('<') && h.endsWith('>')) h = h.slice(1, -1)
  if (h.startsWith('#')) return null // same-note heading link
  if (isExternalHref(h)) return null
  const hash = h.indexOf('#')
  let anchor: string | undefined
  if (hash >= 0) {
    anchor = safeDecode(h.slice(hash + 1)) || undefined
    h = h.slice(0, hash)
  }
  const q = h.indexOf('?')
  if (q >= 0) h = h.slice(0, q)
  const target = safeDecode(h).trim()
  if (!target) return null
  return { target, anchor }
}

const DATE_KEYS = ['due', 'deadline', 'scheduled', 'date', 'event', 'start', 'reminder', 'review']
const CREATED_KEYS = ['created', 'date created', 'created_at', 'createdAt', 'creation date', 'ctime']

function parseDateValue(value: unknown): number | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value).trim()
    // Accept ISO-like dates only; avoid Date's permissive parsing of arbitrary strings.
    if (!/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) return null
    const t = Date.parse(s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T'))
    return Number.isNaN(t) ? null : t
  }
  return null
}

function plainText(tokens: ReturnType<typeof md.parse>, start: number): string {
  // Collect text from the inline token following `start`.
  const inline = tokens[start + 1]
  if (!inline || inline.type !== 'inline') return ''
  return inlineText(inline.children ?? [])
}

type Token = NonNullable<ReturnType<typeof md.parse>[number]['children']>[number]

function inlineText(children: Token[]): string {
  let out = ''
  for (const child of children) {
    if (child.type === 'text' || child.type === 'code_inline') out += child.content
    else if (child.type === 'softbreak' || child.type === 'hardbreak') out += ' '
    else if (child.type === 'image') out += child.content
  }
  return out
}

/** Strips Obsidian wikilink syntax for display: `[[a|b]]` → `b`, `[[a]]` → `a`. */
export function stripWikiSyntax(text: string): string {
  return text.replace(WIKILINK_RE, (_m, bang: string, inner: string) => {
    if (bang) return ''
    const { target, display } = parseWikiTarget(inner)
    return display ?? target.split('/').pop() ?? target
  })
}

export function parseNote(raw: string): ParsedNote & { frontmatterError?: string } {
  const { data, body, error } = splitFrontmatter(raw)
  const masked = body.replace(COMMENT_RE, (m) => m.replace(/[^\n]/g, ' '))
  const tokens = md.parse(masked, {})

  const headings: HeadingInfo[] = []
  const links: ParsedLink[] = []
  const externalLinks: ExternalLink[] = []
  const tagSet = new Set<string>()
  let excerpt = ''
  let wordCount = 0

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.type === 'heading_open') {
      const level = Number(tok.tag.slice(1)) || 1
      const text = stripWikiSyntax(plainText(tokens, i)).trim()
      if (text) headings.push({ level, text: text.slice(0, 300) })
    }
    if (tok.type === 'paragraph_open' && !excerpt) {
      const prev = tokens[i - 1]
      const insideQuote = prev && prev.type === 'blockquote_open'
      const text = stripWikiSyntax(plainText(tokens, i)).replace(/\s+/g, ' ').trim()
      if (text && !insideQuote && !/^!?\[\[[^\]]+\]\]$/.test(text) && !text.startsWith('#')) {
        excerpt = text.length > 280 ? `${text.slice(0, 277).trimEnd()}…` : text
      }
    }
    if (tok.type !== 'inline' || !tok.children) continue

    // Join text across child tokens so wikilinks split by the tokenizer are still found.
    let buffer = ''
    const flush = () => {
      if (!buffer) return
      WIKILINK_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = WIKILINK_RE.exec(buffer))) {
        const parsed = parseWikiTarget(m[2])
        if (!parsed.target && !parsed.anchor) continue
        if (!parsed.target) continue // same-note anchor link `[[#Heading]]`
        links.push({ ...parsed, kind: m[1] ? 'embed' : 'wiki' })
      }
      const withoutLinks = buffer.replace(WIKILINK_RE, ' ')
      INLINE_TAG_RE.lastIndex = 0
      while ((m = INLINE_TAG_RE.exec(withoutLinks))) {
        const tag = normalizeTag(m[2])
        if (tag) tagSet.add(tag)
      }
      wordCount += withoutLinks.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
      buffer = ''
    }

    const children = tok.children
    for (let c = 0; c < children.length; c++) {
      const child = children[c]
      switch (child.type) {
        case 'text':
          buffer += child.content
          break
        case 'softbreak':
        case 'hardbreak':
          buffer += '\n'
          break
        case 'code_inline':
          flush()
          wordCount += child.content.split(/\s+/).filter(Boolean).length
          break
        case 'link_open': {
          flush()
          const href = String(child.attrGet('href') ?? '')
          // Gather link text up to link_close.
          let text = ''
          let j = c + 1
          for (; j < children.length && children[j].type !== 'link_close'; j++) {
            if (children[j].type === 'text' || children[j].type === 'code_inline') text += children[j].content
          }
          if (isExternalHref(href)) {
            if (/^(https?|mailto|ftp):/i.test(href)) externalLinks.push({ url: href, text: text || undefined })
            else if (/^obsidian:/i.test(href)) externalLinks.push({ url: href, text: text || undefined })
          } else {
            const parsed = parseMarkdownHref(href)
            if (parsed) links.push({ ...parsed, display: text || undefined, kind: 'markdown' })
          }
          // Text inside the link still counts toward words/tags.
          buffer += text
          c = j
          break
        }
        case 'image': {
          flush()
          const src = String(child.attrGet('src') ?? '')
          if (!isExternalHref(src)) {
            const parsed = parseMarkdownHref(src)
            if (parsed) links.push({ ...parsed, kind: 'embed' })
          }
          break
        }
        case 'html_inline':
          flush()
          break
        default:
          break
      }
    }
    flush()
  }

  // Frontmatter tags and aliases.
  for (const t of asStringList(getKey(data, 'tags', 'tag'))) {
    const tag = normalizeTag(t)
    if (tag) tagSet.add(tag)
  }
  const aliases = asStringList(getKey(data, 'aliases', 'alias')).slice(0, 50)

  const fmTitle = getKey(data, 'title')
  const title = typeof fmTitle === 'string' && fmTitle.trim() ? fmTitle.trim().slice(0, 300) : null

  const descValue = getKey(data, 'description', 'summary', 'excerpt', 'abstract')
  const description = typeof descValue === 'string' && descValue.trim() ? descValue.trim().slice(0, 500) : undefined

  const catValue = getKey(data, 'category', 'categories')
  const catList = asStringList(catValue).map((s) => stripWikiSyntax(s).trim()).filter(Boolean)
  const category = catList[0]?.slice(0, 120)

  const dates: MetadataDate[] = []
  for (const key of DATE_KEYS) {
    const value = getKey(data, key)
    const t = parseDateValue(value)
    if (t !== null) dates.push({ key, date: new Date(t).toISOString() })
  }
  let createdFromFrontmatter: number | null = null
  for (const key of CREATED_KEYS) {
    const t = parseDateValue(getKey(data, key))
    if (t !== null) {
      createdFromFrontmatter = t
      break
    }
  }

  return {
    frontmatter: data,
    body,
    title: title ?? null,
    headings,
    links,
    externalLinks,
    tags: [...tagSet].slice(0, 200),
    aliases,
    description,
    excerpt,
    wordCount,
    dates,
    createdFromFrontmatter,
    category,
    frontmatterError: error
  }
}
