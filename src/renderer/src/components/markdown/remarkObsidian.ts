/**
 * Remark plugin for Obsidian syntax. It only rewrites `text` nodes, so code
 * blocks and inline code are never touched:
 *   [[target|alias]]  → link to `nexus-note:` (resolved by the panel)
 *   ![[image.png]]    → image served by the read-only `nexus-asset:` protocol
 *   ![[Other note]]   → an "embedded note" link
 *   #tag              → styled tag
 *   ==highlight==     → <mark>
 *   > [!note] Title   → callout blockquote
 * %% comments %% are stripped.
 */

interface Node {
  type: string
  value?: string
  url?: string
  children?: Node[]
  data?: Record<string, unknown>
  alt?: string
  title?: string | null
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i
const TOKEN_RE = /(!?)\[\[([^\[\]\n]+?)\]\]|==([^=\n]+)==|(^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu

export function encodeNoteHref(target: string, anchor?: string): string {
  return `nexus-note:${encodeURIComponent(target)}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`
}

function parseInner(inner: string): { target: string; anchor?: string; display?: string } {
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

function splitText(value: string, noteId: string): Node[] {
  const out: Node[] = []
  let last = 0
  TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(value))) {
    let start = m.index
    if (m[5] !== undefined) start += m[4].length // keep the leading whitespace for tags
    if (start > last) out.push({ type: 'text', value: value.slice(last, start) })
    if (m[2] !== undefined) {
      const { target, anchor, display } = parseInner(m[2])
      const embed = m[1] === '!'
      if (embed && IMAGE_EXT.test(target)) {
        out.push({
          type: 'image',
          url: `nexus-asset://vault/embed?target=${encodeURIComponent(target)}&from=${encodeURIComponent(noteId)}`,
          alt: display ?? target,
          title: null
        })
      } else if (!target) {
        out.push({ type: 'text', value: display ?? anchor ?? '' })
      } else {
        const label = display ?? (anchor ? `${target.split('/').pop()} › ${anchor}` : target.split('/').pop() ?? target)
        out.push({
          type: 'link',
          url: encodeNoteHref(target, anchor),
          title: null,
          data: { hProperties: { 'data-wikilink': target, className: embed ? 'embed-note' : undefined } },
          children: [{ type: 'text', value: embed ? `↳ ${label}` : label }]
        })
      }
    } else if (m[3] !== undefined) {
      out.push({ type: 'mark', data: { hName: 'mark' }, children: [{ type: 'text', value: m[3] }] })
    } else if (m[5] !== undefined) {
      out.push({ type: 'tag', data: { hName: 'span', hProperties: { className: 'md-tag' } }, children: [{ type: 'text', value: `#${m[5]}` }] })
    }
    last = TOKEN_RE.lastIndex
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
  return out
}

function walk(node: Node, noteId: string): void {
  if (!node.children) return
  const next: Node[] = []
  for (const child of node.children) {
    if (child.type === 'text' && child.value) {
      const cleaned = child.value.replace(/%%[\s\S]*?%%/g, '')
      next.push(...splitText(cleaned, noteId))
    } else {
      if (child.type !== 'code' && child.type !== 'inlineCode' && child.type !== 'link') walk(child, noteId)
      next.push(child)
    }
  }
  node.children = next

  // Callouts: > [!type] Optional title
  if (node.type === 'blockquote') {
    const first = node.children?.[0]
    const firstText = first?.type === 'paragraph' ? first.children?.[0] : undefined
    if (firstText?.type === 'text' && firstText.value) {
      const cm = /^\[!([\w-]+)\][+-]?[ \t]*([^\n]*)\n?/.exec(firstText.value)
      if (cm) {
        const type = cm[1].toLowerCase()
        firstText.value = firstText.value.slice(cm[0].length)
        const title: Node = {
          type: 'calloutTitle',
          data: { hName: 'span', hProperties: { className: 'callout-title' } },
          children: [{ type: 'text', value: cm[2] || type }]
        }
        first!.children = [title, ...(first!.children ?? [])]
        node.data = { ...(node.data ?? {}), hProperties: { className: `callout callout-${type}` } }
      }
    }
  }
}

export function remarkObsidian(options: { noteId: string }) {
  return (tree: Node) => {
    walk(tree, options.noteId)
  }
}
