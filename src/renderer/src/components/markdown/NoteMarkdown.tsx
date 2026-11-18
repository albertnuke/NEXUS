import { memo, useMemo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { remarkObsidian } from './remarkObsidian'
import { nexus } from '../../lib/bridge'

/**
 * Safe Markdown rendering. Raw HTML is never rendered (no rehype-raw), so
 * scripts embedded in notes cannot execute. Remote images are not loaded.
 */

function safeUrl(url: string): string {
  if (/^(https?:|mailto:|nexus-note:|nexus-asset:)/i.test(url)) return url
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '' // javascript:, file:, data: …
  return url // relative (internal) link, resolved by the panel
}

function decodeHref(href: string): { target: string; anchor?: string } {
  let h = href
  const hash = h.indexOf('#')
  let anchor: string | undefined
  if (hash >= 0) {
    anchor = h.slice(hash + 1)
    h = h.slice(0, hash)
  }
  try {
    return { target: decodeURIComponent(h), anchor: anchor ? decodeURIComponent(anchor) : undefined }
  } catch {
    return { target: h, anchor }
  }
}

interface Props {
  noteId: string
  body: string
  linkMap: Record<string, string | null>
  onOpenNote: (id: string) => void
}

export const NoteMarkdown = memo(function NoteMarkdown({ noteId, body, linkMap, onOpenNote }: Props) {
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children, node: _node, ...rest }) => {
        const url = href ?? ''
        if (url.startsWith('nexus-note:')) {
          const { target } = decodeHref(url.slice('nexus-note:'.length))
          const resolved = linkMap[`w:${target}`]
          if (!resolved) {
            return (
              <a className={`unresolved ${(rest as { className?: string }).className ?? ''}`} title="This note does not exist yet">
                {children}
              </a>
            )
          }
          return (
            <a
              href="#"
              className={(rest as { className?: string }).className}
              onClick={(e) => {
                e.preventDefault()
                onOpenNote(resolved)
              }}
              title={resolved}
            >
              {children}
            </a>
          )
        }
        if (/^(https?:|mailto:)/i.test(url)) {
          return (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                void nexus.app.openExternal(url)
              }}
              title={url}
            >
              {children}
            </a>
          )
        }
        if (!url || url.startsWith('#')) return <a>{children}</a>
        const { target } = decodeHref(url)
        const resolved = linkMap[`m:${target}`]
        return resolved ? (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              onOpenNote(resolved)
            }}
            title={resolved}
          >
            {children}
          </a>
        ) : (
          <a className="unresolved">{children}</a>
        )
      },
      img: ({ src, alt }) => {
        const url = typeof src === 'string' ? src : ''
        if (url.startsWith('nexus-asset:')) return <img src={url} alt={alt ?? ''} loading="lazy" />
        if (/^https?:/i.test(url)) return <span className="blocked-image">Remote image not loaded · {alt || 'image'}</span>
        if (!url) return null
        const { target } = decodeHref(url)
        const local = `nexus-asset://vault/embed?target=${encodeURIComponent(target)}&from=${encodeURIComponent(noteId)}`
        return <img src={local} alt={alt ?? ''} loading="lazy" />
      },
      input: ({ type, checked }) => (type === 'checkbox' ? <input type="checkbox" checked={!!checked} readOnly disabled /> : null)
    }),
    [linkMap, noteId, onOpenNote]
  )

  const remarkPlugins = useMemo(() => [remarkGfm, [remarkObsidian, { noteId }] as [typeof remarkObsidian, { noteId: string }]], [noteId])

  return (
    <div className="md">
      <Markdown remarkPlugins={remarkPlugins} components={components} urlTransform={safeUrl} skipHtml>
        {body}
      </Markdown>
    </div>
  )
})
