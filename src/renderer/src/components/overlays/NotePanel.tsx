import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { NoteContent, NoteMeta } from '@shared/types'
import { useReducedMotion, useStore } from '../../state/store'
import { nexus } from '../../lib/bridge'
import { dateTime, relativeTime } from '../../lib/format'
import { openNote } from '../../lib/actions'
import { NoteMarkdown } from '../markdown/NoteMarkdown'
import { Highlighted, KIND_LABEL, useSearch } from '../search/useSearch'
import { panelWidth } from '../universe/Director'
import { IconBacklink, IconChevronDown, IconClose, IconExternal, IconFinder, IconLink, IconSearch } from './icons'

/** Hides a leading `# Title` that merely repeats the note title shown above it. */
function stripTitleHeading(body: string, title: string): string {
  const m = /^\s*#\s+(.+?)\s*#*\s*(\n|$)/.exec(body)
  if (m && m[1].trim().toLowerCase() === title.trim().toLowerCase()) return body.slice(m[0].length)
  return body
}

function NoteList({ notes, onPick, empty }: { notes: NoteMeta[]; onPick: (id: string) => void; empty?: string }) {
  if (!notes.length) return <div className="px-1 py-2 text-[11.5px] text-[#6d6c71]">{empty ?? 'Nothing here yet.'}</div>
  return (
    <ul className="space-y-px">
      {notes.map((n) => (
        <li key={n.id}>
          <button
            onClick={() => onPick(n.id)}
            className="group flex w-full items-baseline justify-between gap-3 rounded-[7px] px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
          >
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] text-[#dcdad5] group-hover:text-white">{n.title}</span>
              <span className="block truncate text-[10.5px] text-[#6d6c71]">{n.folder || 'Vault root'}</span>
            </span>
            <span className="shrink-0 text-[10px] text-[#5d5c61]">{relativeTime(n.mtime)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function NoteSelector({ note, siblings }: { note: NoteMeta; siblings: NoteMeta[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-[32px] w-full items-center justify-between gap-2 rounded-[9px] border border-white/[0.07] bg-white/[0.025] px-3 text-left text-[12px] text-[#dcdad5] transition hover:border-white/[0.14]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{note.title}</span>
        <IconChevronDown size={13} className={`shrink-0 text-[#7d7c81] transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="scroll-thin absolute inset-x-0 top-[36px] z-10 max-h-[300px] overflow-y-auto rounded-[10px] border border-white/[0.08] bg-[#111114] p-1 shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
            role="listbox"
          >
            <div className="px-2 pb-1 pt-1.5 text-[9.5px] uppercase tracking-[0.16em] text-[#5f5e63]">{note.category}</div>
            {siblings.map((n) => (
              <button
                key={n.id}
                role="option"
                aria-selected={n.id === note.id}
                onClick={() => {
                  setOpen(false)
                  openNote(n.id)
                }}
                className={`block w-full truncate rounded-[7px] px-2 py-1.5 text-left text-[12px] transition hover:bg-white/[0.05] ${n.id === note.id ? 'text-[#F4C77A]' : 'text-[#cfcdc8]'}`}
              >
                {n.title}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * The right-side floating "Pages" panel: search, note selector and the
 * rendered note. The universe remains visible to its left.
 */
export function NotePanel() {
  const open = useStore((s) => s.panelOpen)
  const selectedId = useStore((s) => s.selectedId)
  const noteById = useStore((s) => s.noteById)
  const snapshot = useStore((s) => s.snapshot)
  const openMode = useStore((s) => s.settings.obsidianOpenMode)
  const select = useStore((s) => s.select)
  const setPanelOpen = useStore((s) => s.setPanelOpen)
  const reduced = useReducedMotion()
  const [query, setQuery] = useState('')
  const [content, setContent] = useState<NoteContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [width, setWidth] = useState(() => panelWidth(window.innerWidth))
  const scrollRef = useRef<HTMLDivElement>(null)
  const { results } = useSearch(query, 30)
  const note = selectedId ? noteById.get(selectedId) : undefined
  const isDemo = !!snapshot?.vault.isDemo

  useEffect(() => {
    const onResize = () => setWidth(panelWidth(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Load note content (re-load when the note changes on disk).
  const mtime = note?.mtime
  useEffect(() => {
    if (!selectedId || !open) return
    let alive = true
    setLoading(true)
    nexus.vault
      .getNote(selectedId)
      .then((c) => {
        if (!alive) return
        setContent(c)
      })
      .catch((err: Error) => {
        if (alive) setContent({ id: selectedId, body: '', frontmatter: {}, mtime: 0, linkMap: {}, error: err.message })
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [selectedId, mtime, open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setQuery('')
  }, [selectedId])

  const recent = useMemo(() => (snapshot ? [...snapshot.notes].sort((a, b) => b.mtime - a.mtime).slice(0, 40) : []), [snapshot])
  const siblings = useMemo(() => {
    if (!note || !snapshot) return []
    return snapshot.notes.filter((n) => n.category === note.category).sort((a, b) => a.title.localeCompare(b.title))
  }, [note, snapshot])
  const outgoing = useMemo(() => (note ? note.outgoing.map((id) => noteById.get(id)).filter((n): n is NoteMeta => !!n) : []), [note, noteById])
  const backlinks = useMemo(() => (note ? note.backlinks.map((id) => noteById.get(id)).filter((n): n is NoteMeta => !!n) : []), [note, noteById])

  const close = useCallback(() => {
    setPanelOpen(false)
    select(null)
  }, [select, setPanelOpen])

  const onOpenNote = useCallback((id: string) => openNote(id), [])
  const showContent = content && note && content.id === note.id

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="panel"
          initial={{ opacity: 0, x: reduced ? 0 : 26, scale: reduced ? 1 : 0.985 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: reduced ? 0 : 22, scale: reduced ? 1 : 0.99 }}
          transition={{ duration: reduced ? 0.15 : 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ width }}
          className="panel-surface no-drag absolute bottom-[14px] right-[14px] top-[52px] flex flex-col overflow-hidden rounded-[14px]"
          aria-label="Pages"
          data-testid="note-panel"
        >
          <header className="shrink-0 px-4 pb-3 pt-3.5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold tracking-[0.01em] text-[#F4F2ED]">Pages</h2>
              <button className="icon-btn -mr-1.5 h-7 w-7" onClick={close} aria-label="Close pages panel">
                <IconClose size={13} />
              </button>
            </div>
            <div className="relative">
              <IconSearch size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6d6c71]" />
              <input
                className="field"
                placeholder="Search pages..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results[0]) openNote(results[0].id)
                  if (e.key === 'Escape') {
                    if (query) {
                      e.stopPropagation()
                      setQuery('')
                    }
                  }
                }}
                aria-label="Search pages"
              />
            </div>
            {note && !query && (
              <div className="mt-2.5">
                <NoteSelector note={note} siblings={siblings} />
              </div>
            )}
          </header>
          <div className="mx-4 h-px shrink-0 bg-white/[0.06]" />

          <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
            {query ? (
              <div>
                <div className="mb-2 text-[9.5px] uppercase tracking-[0.16em] text-[#5f5e63]">
                  {results.length ? `${results.length} results` : 'No matching pages'}
                </div>
                <ul className="space-y-px">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => openNote(r.id)}
                        className="group w-full rounded-[7px] px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12.5px] text-[#dcdad5] group-hover:text-white">
                            <Highlighted text={r.title} range={r.kind === 'title' ? r.highlight : undefined} />
                          </span>
                          <span className="shrink-0 text-[9.5px] uppercase tracking-[0.1em] text-[#5d5c61]">{KIND_LABEL[r.kind]}</span>
                        </div>
                        {r.snippet && r.kind !== 'title' && (
                          <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[#7d7c81]">
                            <Highlighted text={r.snippet} range={r.highlight} />
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : note ? (
              <article data-testid="note-article">
                <h1 className="text-[19px] font-semibold leading-snug tracking-[-0.01em] text-[#F7F5F0]" data-testid="note-title">
                  {note.title}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#7d7c81]">
                  <span className="rounded-[5px] border border-white/[0.08] px-1.5 py-px text-[#bdbbb6]">{note.category}</span>
                  <span>Modified {dateTime(note.mtime)}</span>
                  {note.wordCount > 0 && <span>· {note.wordCount.toLocaleString()} words</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!isDemo && (
                    <button
                      className="pill h-[28px] px-3 text-[11.5px]"
                      onClick={(e) => void nexus.vault.openInObsidian(note.id, e.altKey ? openMode !== 'tab' : undefined)}
                      title="Open in Obsidian (⌥-click for the other tab behaviour)"
                    >
                      <IconExternal size={12} /> Open in Obsidian
                    </button>
                  )}
                  {!isDemo && (
                    <button className="pill h-[28px] px-3 text-[11.5px]" onClick={() => void nexus.vault.revealInFinder(note.id)}>
                      <IconFinder size={12} /> Reveal
                    </button>
                  )}
                </div>
                {note.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {note.tags.slice(0, 12).map((t) => (
                      <span key={t} className="rounded-[5px] bg-[#a582f2]/[0.09] px-1.5 py-px text-[10.5px] text-[#b9a3f5]">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="my-4 h-px bg-white/[0.06]" />
                {loading && !showContent && <div className="text-[12px] text-[#6d6c71]">Reading note…</div>}
                {showContent && content.error && !content.body && (
                  <div className="rounded-[9px] border border-[#f0914a]/25 bg-[#f0914a]/[0.06] px-3 py-2.5 text-[12px] text-[#e9b48c]" role="alert">
                    {content.error}
                  </div>
                )}
                {showContent && content.error && content.body && (
                  <div className="mb-3 text-[11px] text-[#e9b48c]/80">{content.error}</div>
                )}
                {showContent && content.body && (
                  <NoteMarkdown noteId={note.id} body={stripTitleHeading(content.body, note.title)} linkMap={content.linkMap} onOpenNote={onOpenNote} />
                )}
                {showContent && !content.body && !content.error && <div className="text-[12px] italic text-[#6d6c71]">This note is empty.</div>}

                <div className="mt-7 space-y-5">
                  <section>
                    <h3 className="mb-1.5 flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.16em] text-[#6d6c71]">
                      <IconLink size={11} /> Links · {outgoing.length}
                    </h3>
                    <NoteList notes={outgoing} onPick={openNote} empty="No outgoing links." />
                  </section>
                  <section>
                    <h3 className="mb-1.5 flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.16em] text-[#6d6c71]">
                      <IconBacklink size={11} /> Backlinks · {backlinks.length}
                    </h3>
                    <NoteList notes={backlinks} onPick={openNote} empty="No notes link here yet." />
                  </section>
                  {note.unresolved.length > 0 && (
                    <section>
                      <h3 className="mb-1.5 text-[9.5px] uppercase tracking-[0.16em] text-[#6d6c71]">Unresolved · {note.unresolved.length}</h3>
                      <div className="flex flex-wrap gap-1">
                        {note.unresolved.map((u) => (
                          <span key={u} className="rounded-[5px] border border-dashed border-white/[0.12] px-1.5 py-px text-[10.5px] text-[#7d7c81]">
                            {u}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}
                  <div className="pt-2 text-[10px] text-[#4f4e53]">{note.path}</div>
                </div>
              </article>
            ) : (
              <div>
                <div className="mb-2 text-[9.5px] uppercase tracking-[0.16em] text-[#5f5e63]">Recently updated</div>
                <NoteList notes={recent} onPick={openNote} />
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
