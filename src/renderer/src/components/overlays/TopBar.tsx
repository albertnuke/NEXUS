import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../../state/store'
import { IconArrowLeft } from './icons'
import { formatNumber } from '../../lib/format'
import { goHome } from '../../lib/actions'

/**
 * Minimal chrome floating above the universe: wordmark + vault line at the
 * upper left (or the category breadcrumb), Home at the top centre and Pages
 * at the upper right. A transparent strip lets the window be dragged.
 */
export function TopBar() {
  const snapshot = useStore((s) => s.snapshot)
  const status = useStore((s) => s.status)
  const focused = useStore((s) => s.focusedCategory)
  const overlay = useStore((s) => s.overlay)
  const panelOpen = useStore((s) => s.panelOpen)
  const focusCategory = useStore((s) => s.focusCategory)
  const setOverlay = useStore((s) => s.setOverlay)
  const setPanelOpen = useStore((s) => s.setPanelOpen)
  const category = snapshot?.categories.find((c) => c.id === focused)
  const hasVault = !!snapshot || status.kind === 'empty'

  return (
    <>
      <div className="drag-region absolute inset-x-0 top-0 h-[46px]" />
      <div className="pointer-events-none absolute left-[22px] top-[50px] select-none">
        <AnimatePresence mode="wait" initial={false}>
          {category ? (
            <motion.button
              key="crumb"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => focusCategory(null)}
              className="no-drag pointer-events-auto group flex items-center gap-2 rounded-md py-1 pr-2 text-left"
              aria-label={`Back to the universe from ${category.name}`}
            >
              <IconArrowLeft size={14} className="text-[#9b9a9f] transition group-hover:-translate-x-0.5 group-hover:text-white" />
              <span>
                <span className="block text-[13px] font-medium tracking-[0.01em] text-[#F4F2ED]">{category.name}</span>
                <span className="block text-[10.5px] text-[#7d7c81]">
                  {formatNumber(category.noteCount)} {category.noteCount === 1 ? 'note' : 'notes'} · Esc to return
                </span>
              </span>
            </motion.button>
          ) : (
            <motion.div
              key="brand"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="text-[12.5px] font-semibold tracking-[0.42em] text-[#F4F2ED]">NEXUS</div>
              {snapshot && (
                <div className="mt-1 text-[10.5px] tracking-[0.02em] text-[#7d7c81]">
                  {snapshot.vault.isDemo ? (
                    <>
                      <span className="mr-1.5 rounded-[4px] border border-[#F4C77A]/30 px-1 py-px text-[9px] uppercase tracking-[0.14em] text-[#F4C77A]">
                        Demo
                      </span>
                      Sample data · {formatNumber(snapshot.vault.noteCount)} notes
                    </>
                  ) : (
                    <>
                      {snapshot.vault.name} · {formatNumber(snapshot.vault.noteCount)}{' '}
                      {snapshot.vault.noteCount === 1 ? 'note' : 'notes'}
                    </>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {hasVault && (
        <>
          <div className="absolute left-1/2 top-[13px] -translate-x-1/2">
            <button
              className="pill no-drag"
              data-active={overlay === 'home'}
              onClick={() => (overlay === 'home' ? setOverlay('none') : goHome(true))}
              aria-pressed={overlay === 'home'}
            >
              Home
            </button>
          </div>
          <div className="absolute right-[18px] top-[13px]">
            <button
              className="pill no-drag"
              data-active={panelOpen}
              onClick={() => {
                setOverlay('none')
                setPanelOpen(!panelOpen)
              }}
              aria-pressed={panelOpen}
            >
              Pages
            </button>
          </div>
        </>
      )}
    </>
  )
}
