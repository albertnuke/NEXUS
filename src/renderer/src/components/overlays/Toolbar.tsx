import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../../state/store'
import { IconConnections, IconReset, IconSliders, IconZoomIn, IconZoomOut } from './icons'
import { resetCamera, toggleConnections, zoomBy } from '../../lib/actions'
import { nexus } from '../../lib/bridge'
import type { QualityPreset } from '@shared/types'

function ToolButton({
  label,
  onClick,
  active,
  children,
  shortcut
}: {
  label: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
  shortcut?: string
}) {
  return (
    <div className="group relative">
      <button className="icon-btn" onClick={onClick} aria-label={label} data-active={active === undefined ? undefined : active}>
        {children}
      </button>
      <div className="pointer-events-none absolute bottom-[40px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/[0.08] bg-[#0d0d10]/95 px-2 py-1 text-[10.5px] text-[#cfcdc8] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {label}
        {shortcut && <span className="ml-1.5 text-[#6d6c71]">{shortcut}</span>}
      </div>
    </div>
  )
}

const QUALITY_LABELS: Record<QualityPreset, string> = { high: 'High', balanced: 'Balanced', performance: 'Performance' }

/** Compact floating dock at the bottom centre. */
export function Toolbar() {
  const showConnections = useStore((s) => s.settings.showConnections)
  const settings = useStore((s) => s.settings)
  const setOverlay = useStore((s) => s.setOverlay)
  const [open, setOpen] = useState(false)

  return (
    <div className="absolute bottom-[22px] left-1/2 -translate-x-1/2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="glass absolute bottom-[50px] left-1/2 w-[260px] -translate-x-1/2 rounded-[14px] p-3.5 text-[11.5px]"
            role="dialog"
            aria-label="Visual settings"
          >
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[#77767b]">Visuals</div>
            <div className="mb-3 flex gap-1 rounded-[9px] bg-white/[0.03] p-0.5">
              {(['high', 'balanced', 'performance'] as QualityPreset[]).map((q) => (
                <button
                  key={q}
                  onClick={() => void nexus.settings.update({ quality: q })}
                  className={`flex-1 rounded-[7px] py-1 text-[10.5px] transition ${settings.quality === q ? 'bg-white/[0.09] text-white' : 'text-[#8a898e] hover:text-white'}`}
                >
                  {QUALITY_LABELS[q]}
                </button>
              ))}
            </div>
            <label className="mb-2.5 block">
              <div className="mb-1 flex justify-between text-[#a9a7a2]">
                <span>Star brightness</span>
                <span className="text-[#6d6c71]">{Math.round(settings.starBrightness * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.3}
                max={2.5}
                step={0.05}
                value={settings.starBrightness}
                onChange={(e) => void nexus.settings.update({ starBrightness: Number(e.target.value) })}
                className="w-full accent-[#F4C77A]"
              />
            </label>
            <label className="mb-2.5 block">
              <div className="mb-1 flex justify-between text-[#a9a7a2]">
                <span>Connection visibility</span>
                <span className="text-[#6d6c71]">{Math.round(settings.connectionOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={3}
                step={0.05}
                value={settings.connectionOpacity}
                onChange={(e) => void nexus.settings.update({ connectionOpacity: Number(e.target.value) })}
                className="w-full accent-[#F4C77A]"
              />
            </label>
            <label className="flex items-center justify-between py-1 text-[#a9a7a2]">
              <span>Orbital animation</span>
              <input
                type="checkbox"
                checked={settings.orbitalsEnabled}
                onChange={(e) => void nexus.settings.update({ orbitalsEnabled: e.target.checked })}
                className="accent-[#F4C77A]"
              />
            </label>
            <button
              className="mt-2 w-full rounded-[8px] border border-white/[0.07] py-1.5 text-[11px] text-[#cfcdc8] transition hover:bg-white/[0.05]"
              onClick={() => {
                setOpen(false)
                setOverlay('settings')
              }}
            >
              All settings…
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="glass flex items-center gap-0.5 rounded-full px-1.5 py-1" role="toolbar" aria-label="Universe controls">
        <ToolButton label="Zoom out" shortcut="⌘−" onClick={() => zoomBy(1.25)}>
          <IconZoomOut />
        </ToolButton>
        <ToolButton label="Zoom in" shortcut="⌘=" onClick={() => zoomBy(0.8)}>
          <IconZoomIn />
        </ToolButton>
        <ToolButton label="Reset view" shortcut="⌘0" onClick={resetCamera}>
          <IconReset />
        </ToolButton>
        <div className="mx-1 h-4 w-px bg-white/[0.08]" />
        <ToolButton label={showConnections ? 'Hide connections' : 'Show connections'} shortcut="⌘L" active={showConnections} onClick={toggleConnections}>
          <IconConnections />
        </ToolButton>
        <ToolButton label="Visual settings" active={open ? true : undefined} onClick={() => setOpen((o) => !o)}>
          <IconSliders />
        </ToolButton>
      </div>
    </div>
  )
}
