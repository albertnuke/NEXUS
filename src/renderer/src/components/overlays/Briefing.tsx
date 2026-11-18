import { useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../../state/store'
import { greeting, relativeTime, formatNumber } from '../../lib/format'
import { computeStats } from '../../lib/stats'
import { openNote } from '../../lib/actions'
import { nexus } from '../../lib/bridge'
import { IconCollapse, IconExpand } from './icons'

let firstAppearance = true

/**
 * The "morning briefing": editorial typography floating at the left edge,
 * derived entirely from the vault. It fades away once exploration begins.
 */
export function Briefing() {
  const snapshot = useStore((s) => s.snapshot)
  const interacted = useStore((s) => s.interacted)
  const dismissed = useStore((s) => s.briefingDismissed)
  const selectedId = useStore((s) => s.selectedId)
  const focused = useStore((s) => s.focusedCategory)
  const overlay = useStore((s) => s.overlay)
  const collapsed = useStore((s) => s.settings.briefingCollapsed)
  const markInteracted = useStore((s) => s.markInteracted)

  const stats = useMemo(() => (snapshot ? computeStats(snapshot.notes, snapshot.categories) : null), [snapshot])
  const visible = !!snapshot && !selectedId && !focused && overlay === 'none' && !dismissed
  void interacted
  const delay = firstAppearance ? 3.4 : 0.15
  const recent = stats ? [...snapshot!.notes].sort((a, b) => b.mtime - a.mtime).slice(0, 3) : []
  const important = stats?.mostConnected.slice(0, 3) ?? []

  return (
    <AnimatePresence>
      {visible && stats && (
        <motion.aside
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0, transition: { delay, duration: 1.1, ease: [0.22, 1, 0.36, 1] } }}
          onAnimationComplete={() => {
            firstAppearance = false
          }}
          exit={{ opacity: 0, x: -8, transition: { duration: 0.45 } }}
          className="absolute left-[22px] top-[118px] w-[250px] select-none"
          aria-label="Vault briefing"
        >
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[21px] font-light leading-tight tracking-[-0.01em] text-[#F4F2ED]">{greeting()}</h1>
              <p className="mt-1 text-[12px] leading-relaxed text-[#9a999e]">
                {snapshot!.vault.isDemo ? 'The demo universe is ready.' : 'Your knowledge universe is ready.'}
              </p>
            </div>
            <button
              className="icon-btn -mr-2 mt-0.5 h-6 w-6"
              onClick={() => void nexus.settings.update({ briefingCollapsed: !collapsed })}
              aria-label={collapsed ? 'Expand briefing' : 'Collapse briefing'}
            >
              {collapsed ? <IconExpand size={12} /> : <IconCollapse size={12} />}
            </button>
          </div>

          {!collapsed && (
            <div className="mt-6 space-y-5 text-[11.5px]">
              <div className="flex gap-6">
                <div>
                  <div className="text-[19px] font-light tabular-nums text-[#F4F2ED]">{formatNumber(stats.totalNotes)}</div>
                  <div className="text-[10.5px] text-[#77767b]">notes</div>
                </div>
                <div>
                  <div className="text-[19px] font-light tabular-nums text-[#F4F2ED]">{formatNumber(stats.totalLinks)}</div>
                  <div className="text-[10.5px] text-[#77767b]">links</div>
                </div>
                <div>
                  <div className="text-[19px] font-light tabular-nums text-[#F4F2ED]">{formatNumber(stats.updatedThisWeek)}</div>
                  <div className="text-[10.5px] text-[#77767b]">this week</div>
                </div>
              </div>

              {recent.length > 0 && (
                <section>
                  <div className="mb-1.5 text-[9.5px] uppercase tracking-[0.18em] text-[#5f5e63]">Recently modified</div>
                  <ul className="space-y-1">
                    {recent.map((n) => (
                      <li key={n.id}>
                        <button
                          className="group flex w-full items-baseline justify-between gap-3 text-left"
                          onClick={() => {
                            markInteracted()
                            openNote(n.id)
                          }}
                        >
                          <span className="truncate text-[#d6d4cf] transition group-hover:text-white">{n.title}</span>
                          <span className="shrink-0 text-[10px] text-[#66656a]">{relativeTime(n.mtime)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {important.length > 0 && (
                <section>
                  <div className="mb-1.5 text-[9.5px] uppercase tracking-[0.18em] text-[#5f5e63]">Most connected</div>
                  <ul className="space-y-1">
                    {important.map((n) => (
                      <li key={n.id}>
                        <button
                          className="group flex w-full items-baseline justify-between gap-3 text-left"
                          onClick={() => {
                            markInteracted()
                            openNote(n.id)
                          }}
                        >
                          <span className="truncate text-[#d6d4cf] transition group-hover:text-white">{n.title}</span>
                          <span className="shrink-0 text-[10px] text-[#66656a]">{n.degree} links</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {stats.upcoming.length > 0 && (
                <section>
                  <div className="mb-1.5 text-[9.5px] uppercase tracking-[0.18em] text-[#5f5e63]">Upcoming</div>
                  <ul className="space-y-1">
                    {stats.upcoming.slice(0, 3).map((u) => (
                      <li key={`${u.id}-${u.key}`}>
                        <button className="group flex w-full items-baseline justify-between gap-3 text-left" onClick={() => openNote(u.id)}>
                          <span className="truncate text-[#d6d4cf] transition group-hover:text-white">{u.title}</span>
                          <span className="shrink-0 text-[10px] text-[#F4C77A]/80">
                            {u.key} {relativeTime(u.at)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
