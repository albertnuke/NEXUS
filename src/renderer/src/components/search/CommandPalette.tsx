import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useStore } from '../../state/store'
import { openNote } from '../../lib/actions'
import { Highlighted, KIND_LABEL, useSearch } from './useSearch'
import { IconSearch } from '../overlays/icons'

/** ⌘K floating search with arrow-key navigation. */
export function CommandPalette() {
  const open = useStore((s) => s.overlay === 'palette')
  const setOverlay = useStore((s) => s.setOverlay)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const { results, loading } = useSearch(query, 40, 40)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Reset on close so a quick reopen never starts from stale text, and clear the
  // DOM value directly on open in case keystrokes arrive before React re-renders.
  useEffect(() => {
    const input = inputRef.current
    if (open) {
      if (input) input.value = ''
      setQuery('')
      setActive(0)
      input?.focus()
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      input?.blur()
      setQuery('')
    }
  }, [open])

  useEffect(() => setActive(0), [results])

  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (index: number) => {
    const r = results[index]
    if (!r) return
    setOverlay('none')
    openNote(r.id)
  }

  // A single persistent palette that fades in and out. (Mounting/unmounting
  // it lets a fast reopen land focus on the outgoing copy of the input.)
  return (
    <>
        <motion.div
          className="no-drag absolute inset-0 z-40 flex items-start justify-center bg-black/30 pt-[14vh]"
          initial={false}
          animate={open ? { opacity: 1, visibility: 'visible' as const } : { opacity: 0, transitionEnd: { visibility: 'hidden' as const } }}
          transition={{ duration: 0.18 }}
          style={{ pointerEvents: open ? 'auto' : 'none' }}
          aria-hidden={!open}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOverlay('none')
          }}
        >
          <motion.div
            initial={false}
            animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="panel-surface w-[min(620px,calc(100vw-48px))] overflow-hidden rounded-[14px]"
            role="dialog"
            aria-label="Search"
          >
            <div className="relative border-b border-white/[0.06]">
              <IconSearch size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7d7c81]" />
              <input
                ref={inputRef}
                tabIndex={open ? 0 : -1}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setActive((a) => Math.max(a - 1, 0))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    choose(active)
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    e.stopPropagation()
                    setOverlay('none')
                  }
                }}
                placeholder="Search notes, headings, tags and links…"
                className="h-[52px] w-full bg-transparent pl-11 pr-16 text-[14px] text-[#F4F2ED] outline-none placeholder:text-[#5f5e63]"
                style={{ userSelect: 'text' }}
                aria-label="Search the vault"
                aria-controls="palette-results"
                aria-activedescendant={results[active] ? `palette-${active}` : undefined}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-[5px] border border-white/[0.08] px-1.5 py-px text-[10px] text-[#6d6c71]">
                esc
              </span>
            </div>
            <ul id="palette-results" ref={listRef} className="scroll-thin max-h-[52vh] overflow-y-auto p-1.5" role="listbox">
              {(open ? results : []).map((r, i) => (
                <li
                  key={r.id}
                  id={`palette-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={`cursor-pointer rounded-[9px] px-3 py-2 transition-colors ${i === active ? 'bg-white/[0.06]' : ''}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-[#E9E7E2]">
                      <Highlighted text={r.title} range={r.kind === 'title' ? r.highlight : undefined} />
                    </span>
                    <span className="shrink-0 text-[10px] text-[#5d5c61]">
                      {r.category} · {KIND_LABEL[r.kind]}
                    </span>
                  </div>
                  {r.snippet && r.kind !== 'title' && (
                    <div className="mt-0.5 truncate text-[11.5px] text-[#77767b]">
                      <Highlighted text={r.snippet} range={r.highlight} />
                    </div>
                  )}
                </li>
              ))}
              {query.trim() && !loading && results.length === 0 && (
                <li className="px-3 py-6 text-center text-[12px] text-[#6d6c71]">No notes match “{query.trim()}”.</li>
              )}
              {!query.trim() && (
                <li className="px-3 py-5 text-center text-[11.5px] text-[#5f5e63]">
                  Type to search every note · use <span className="text-[#8a898e]">#tag</span> for tags · ↑↓ to move · ↵ to open
                </li>
              )}
            </ul>
          </motion.div>
        </motion.div>
    </>
  )
}
