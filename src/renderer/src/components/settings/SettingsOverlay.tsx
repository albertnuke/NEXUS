import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ApplicationSettings, QualityPreset, ReducedMotionPreference } from '@shared/types'
import { useReducedMotion, useStore } from '../../state/store'
import { nexus } from '../../lib/bridge'
import { IconClose } from '../overlays/icons'

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5">
      <div className="min-w-0">
        <div className="text-[12px] text-[#dcdad5]">{label}</div>
        {hint && <div className="mt-0.5 text-[10.5px] leading-snug text-[#6d6c71]">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[18px] w-[32px] rounded-full transition ${checked ? 'bg-[#F4C77A]/80' : 'bg-white/[0.12]'}`}
    >
      <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-[#0d0d10] transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`} />
    </button>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-[8px] bg-white/[0.04] p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-[6px] px-2.5 py-1 text-[11px] transition ${value === v ? 'bg-white/[0.1] text-white' : 'text-[#8a898e] hover:text-white'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Slider({ value, min, max, step, onChange, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div className="flex items-center gap-2.5">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-[140px] accent-[#F4C77A]" />
      <span className="w-[38px] text-right text-[10.5px] tabular-nums text-[#77767b]">{format(value)}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 mt-5 text-[9.5px] uppercase tracking-[0.18em] text-[#5f5e63] first:mt-0">{children}</div>
}

/** Every control here changes real behaviour; nothing is decorative. */
export function SettingsOverlay() {
  const open = useStore((s) => s.overlay === 'settings')
  const settings = useStore((s) => s.settings)
  const snapshot = useStore((s) => s.snapshot)
  const status = useStore((s) => s.status)
  const setOverlay = useStore((s) => s.setOverlay)
  const reduced = useReducedMotion()
  const [cacheCleared, setCacheCleared] = useState(false)
  const update = (patch: Partial<ApplicationSettings>) => void nexus.settings.update(patch)
  const pct = (v: number) => `${Math.round(v * 100)}%`

  useEffect(() => {
    if (open) setCacheCleared(false)
  }, [open])

  const vaultPath = snapshot?.vault.path ?? (status.kind === 'empty' || status.kind === 'error' ? status.vaultPath : settings.vaultPath)
  const vaultName = snapshot?.vault.isDemo ? 'Demo universe (sample data)' : (snapshot?.vault.name ?? vaultPath?.split('/').pop() ?? 'No vault connected')

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="settings"
          className="no-drag absolute inset-0 z-40 flex items-center justify-center bg-black/35"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOverlay('none')
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: reduced ? 1 : 0.97, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="panel-surface scroll-thin max-h-[calc(100vh-100px)] w-[520px] overflow-y-auto rounded-[14px] px-6 pb-6 pt-5"
            role="dialog"
            aria-label="Settings"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#F4F2ED]">Settings</h2>
              <button className="icon-btn -mr-2" onClick={() => setOverlay('none')} aria-label="Close settings">
                <IconClose size={13} />
              </button>
            </div>

            <SectionTitle>Vault</SectionTitle>
            <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
              <div className="text-[12.5px] text-[#E9E7E2]">{vaultName}</div>
              <div className="mt-0.5 break-all text-[10.5px] text-[#6d6c71]">{snapshot?.vault.isDemo ? 'Bundled with NEXUS · read-only' : (vaultPath ?? '—')}</div>
              <div className="mt-3 flex gap-2">
                <button className="pill h-[28px] text-[11.5px]" onClick={() => void nexus.vault.select()}>
                  {vaultPath ? 'Change vault…' : 'Connect vault…'}
                </button>
                <button className="pill h-[28px] text-[11.5px]" onClick={() => void nexus.vault.reindex()} disabled={!vaultPath && !snapshot}>
                  Reindex
                </button>
                {(vaultPath || snapshot) && (
                  <button className="pill h-[28px] text-[11.5px] !text-[#a9a7a2]" onClick={() => void nexus.vault.disconnect()}>
                    Disconnect
                  </button>
                )}
              </div>
            </div>
            <Row label="Include .txt files" hint="Index plain-text files as notes in addition to Markdown.">
              <Toggle checked={settings.includeTxt} onChange={(v) => update({ includeTxt: v })} label="Include .txt files" />
            </Row>

            <SectionTitle>Visualization</SectionTitle>
            <Row label="Quality" hint="Affects particle density, post-processing and resolution — never your data.">
              <Segmented<QualityPreset>
                value={settings.quality}
                options={[
                  ['high', 'High'],
                  ['balanced', 'Balanced'],
                  ['performance', 'Performance']
                ]}
                onChange={(v) => update({ quality: v })}
              />
            </Row>
            <Row label="Star brightness">
              <Slider value={settings.starBrightness} min={0.3} max={2.5} step={0.05} onChange={(v) => update({ starBrightness: v })} format={pct} />
            </Row>
            <Row label="Connection visibility">
              <Slider value={settings.connectionOpacity} min={0} max={3} step={0.05} onChange={(v) => update({ connectionOpacity: v })} format={pct} />
            </Row>
            <Row label="Show connections">
              <Toggle checked={settings.showConnections} onChange={(v) => update({ showConnections: v })} label="Show connections" />
            </Row>
            <Row label="Background particle density" hint="Decorative dust only.">
              <Slider value={settings.dustDensity} min={0} max={2} step={0.05} onChange={(v) => update({ dustDensity: v })} format={pct} />
            </Row>
            <Row label="Orbital animation">
              <Toggle checked={settings.orbitalsEnabled} onChange={(v) => update({ orbitalsEnabled: v })} label="Orbital animation" />
            </Row>
            <Row label="Reduced motion" hint="System follows the macOS accessibility setting.">
              <Segmented<ReducedMotionPreference>
                value={settings.reducedMotion}
                options={[
                  ['system', 'System'],
                  ['reduce', 'Reduce'],
                  ['full', 'Full']
                ]}
                onChange={(v) => update({ reducedMotion: v })}
              />
            </Row>
            <Row label="Drag inertia">
              <Toggle checked={settings.camera.inertia} onChange={(v) => update({ camera: { ...settings.camera, inertia: v } })} label="Drag inertia" />
            </Row>
            <Row label="Invert drag direction">
              <Toggle checked={settings.camera.invertDrag} onChange={(v) => update({ camera: { ...settings.camera, invertDrag: v } })} label="Invert drag" />
            </Row>
            <Row label="Zoom speed">
              <Slider
                value={settings.camera.zoomSpeed}
                min={0.25}
                max={3}
                step={0.05}
                onChange={(v) => update({ camera: { ...settings.camera, zoomSpeed: v } })}
                format={(v) => `${v.toFixed(2)}×`}
              />
            </Row>

            <SectionTitle>Application</SectionTitle>
            <Row label="Launch at login" hint="Takes effect for the installed app.">
              <Toggle checked={settings.launchAtLogin} onChange={(v) => update({ launchAtLogin: v })} label="Launch at login" />
            </Row>
            <Row label="Open in Obsidian" hint="⌥-click the button for the other behaviour.">
              <Segmented
                value={settings.obsidianOpenMode}
                options={[
                  ['current', 'Current tab'],
                  ['tab', 'New tab']
                ]}
                onChange={(v) => update({ obsidianOpenMode: v })}
              />
            </Row>
            <Row label="Clear local cache" hint="Removes saved star positions. Your notes are never touched.">
              <button
                className="pill h-[28px] text-[11.5px]"
                onClick={() =>
                  void nexus.app.clearCache().then(() => {
                    setCacheCleared(true)
                  })
                }
              >
                {cacheCleared ? 'Cleared' : 'Clear cache'}
              </button>
            </Row>
            <p className="mt-4 text-[10.5px] leading-relaxed text-[#5d5c61]">
              NEXUS works entirely offline. It reads your vault without modifying it and stores its settings and layout cache in
              ~/Library/Application Support/NEXUS.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
