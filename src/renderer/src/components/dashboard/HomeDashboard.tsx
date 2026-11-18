import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, animate, useMotionValue, useTransform } from 'motion/react'
import { useReducedMotion, useStore } from '../../state/store'
import { computeStats } from '../../lib/stats'
import { formatNumber, longDate, relativeTime } from '../../lib/format'
import { openNote } from '../../lib/actions'
import { Highlighted, KIND_LABEL, useSearch } from '../search/useSearch'
import { IconClose, IconSearch } from '../overlays/icons'
import { MadeBy } from '../overlays/MadeBy'

const ACCENT = {
  orange: '#F0914A',
  green: '#5FCF8F',
  blue: '#5AA2F0',
  purple: '#A582F2'
}

function CountUp({ value, delay = 0 }: { value: number; delay?: number }) {
  const reduced = useReducedMotion()
  const mv = useMotionValue(reduced ? value : 0)
  const text = useTransform(mv, (v) => formatNumber(Math.round(v)))
  useEffect(() => {
    if (reduced) {
      mv.set(value)
      return
    }
    const c = animate(mv, value, { duration: 1.1, delay, ease: [0.22, 1, 0.36, 1] })
    return () => c.stop()
  }, [value, delay, reduced, mv])
  return <motion.span>{text}</motion.span>
}

function MiniBars({ values, color, delay = 0 }: { values: number[]; color: string; delay?: number }) {
  const reduced = useReducedMotion()
  const max = Math.max(1, ...values)
  return (
    <div className="flex h-[34px] items-end gap-[3px]" aria-hidden="true">
      {values.map((v, i) => (
        <motion.div
          key={i}
          className="flex-1 rounded-[2px]"
          style={{ background: color, opacity: v ? 0.85 : 0.18, originY: 1 }}
          initial={{ scaleY: reduced ? 1 : 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.7, delay: reduced ? 0 : delay + i * 0.025, ease: [0.22, 1, 0.36, 1] }}
        >
          <div style={{ height: `${Math.max(6, (v / max) * 34)}px` }} />
        </motion.div>
      ))}
    </div>
  )
}

function StatCard(props: {
  value: number
  title: string
  description: string
  indicator?: string
  bars: number[]
  color: string
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.12 + props.index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[11px] border border-white/[0.06] bg-white/[0.022] px-4 py-3.5"
      data-testid={`stat-${props.index}`}
    >
      <div className="absolute inset-y-0 left-0 w-[2px]" style={{ background: props.color, opacity: 0.85 }} />
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, ${props.color}66, transparent 70%)` }} />
      <div className="flex items-start justify-between gap-2">
        <div className="text-[27px] font-light leading-none tabular-nums text-[#F7F5F0]" data-testid={`stat-value-${props.index}`}>
          <CountUp value={props.value} delay={0.15 + props.index * 0.06} />
        </div>
        {props.indicator && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] tabular-nums" style={{ color: props.color, background: `${props.color}14` }}>
            {props.indicator}
          </span>
        )}
      </div>
      <div className="mt-2.5 text-[12px] font-medium text-[#E4E2DD]">{props.title}</div>
      <div className="mt-0.5 text-[10.5px] leading-snug text-[#77767b]">{props.description}</div>
      <div className="mt-3">
        <MiniBars values={props.bars} color={props.color} delay={0.3 + props.index * 0.06} />
      </div>
    </motion.div>
  )
}

function Panel({ title, children, delay, aside }: { title: string; children: React.ReactNode; delay: number; aside?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className="min-w-0 rounded-[11px] border border-white/[0.06] bg-white/[0.018] px-4 py-3.5"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[12px] font-medium text-[#E4E2DD]">{title}</h3>
        {aside && <span className="text-[10px] text-[#5f5e63]">{aside}</span>}
      </div>
      {children}
    </motion.section>
  )
}

function RankedBars({
  rows,
  color,
  onPick,
  delay
}: {
  rows: Array<{ key: string; label: string; value: number; sub?: string }>
  color: string
  onPick?: (key: string) => void
  delay: number
}) {
  const reduced = useReducedMotion()
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <div className="text-[11.5px] text-[#5f5e63]">No data yet.</div>
  return (
    <ul className="divide-y divide-white/[0.045]">
      {rows.map((r, i) => (
        <li key={r.key} className="py-[5px] first:pt-0">
          <button className="group w-full text-left" onClick={() => onPick?.(r.key)} disabled={!onPick}>
            <div className="flex items-baseline justify-between gap-3 text-[11px]">
              <span className="truncate text-[#cfcdc8] transition group-hover:text-white">{r.label}</span>
              <span className="shrink-0 tabular-nums text-[#8a898e]">{formatNumber(r.value)}</span>
            </div>
            <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/[0.04]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: color, originX: 0, width: `${(r.value / max) * 100}%` }}
                initial={{ scaleX: reduced ? 1 : 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, delay: reduced ? 0 : delay + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Histogram({ values, color, delay, labels }: { values: number[]; color: string; delay: number; labels: [string, string] }) {
  const reduced = useReducedMotion()
  const max = Math.max(1, ...values)
  return (
    <div>
      <div className="flex h-[150px] items-end gap-[3px]">
        {values.map((v, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end">
            <motion.div
              className="w-full rounded-t-[2px]"
              style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: color, opacity: v ? 0.9 : 0.15, originY: 1 }}
              initial={{ scaleY: reduced ? 1 : 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.75, delay: reduced ? 0 : delay + i * 0.018, ease: [0.22, 1, 0.36, 1] }}
            />
            <div className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9.5px] text-[#cfcdc8] opacity-0 transition group-hover:opacity-100">
              {v}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[9.5px] text-[#5d5c61]">
        <span>{labels[0]}</span>
        <span>{labels[1]}</span>
      </div>
    </div>
  )
}

/**
 * Floating analytics window. Every number is computed from the indexed vault.
 */
export function HomeDashboard() {
  const open = useStore((s) => s.overlay === 'home')
  const snapshot = useStore((s) => s.snapshot)
  const setOverlay = useStore((s) => s.setOverlay)
  const focusCategory = useStore((s) => s.focusCategory)
  const reduced = useReducedMotion()
  const [query, setQuery] = useState('')
  const { results } = useSearch(query, 12)
  const stats = useMemo(() => (snapshot && open ? computeStats(snapshot.notes, snapshot.categories) : null), [snapshot, open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const go = (id: string) => {
    setOverlay('none')
    openNote(id)
  }

  return (
    <AnimatePresence>
      {open && stats && (
        <motion.div
          key="home"
          className="no-drag absolute inset-0 z-30 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.12 : 0.45 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOverlay('none')
          }}
          style={{ background: 'radial-gradient(ellipse at center, rgba(3,3,4,0.2), rgba(3,3,4,0.55))' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: reduced ? 1 : 0.965, y: reduced ? 0 : 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduced ? 1 : 0.975, y: reduced ? 0 : 10 }}
            transition={{ duration: reduced ? 0.12 : 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="panel-surface scroll-thin flex max-h-[calc(100vh-96px)] w-[min(1080px,calc(100vw-80px))] min-w-[760px] flex-col overflow-y-auto rounded-[14px] !bg-[#111114]/[0.8]"
            style={{ width: 'clamp(760px, 70vw, 1080px)' }}
            role="dialog"
            aria-label="Home dashboard"
            data-testid="home-dashboard"
          >
            <div className="px-6 pb-5 pt-5">
              <header className="flex items-start justify-between">
                <div>
                  <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-[#F7F5F0]">Home</h2>
                  <div className="mt-0.5 text-[11px] text-[#77767b]">
                    {longDate(Date.now())} · {snapshot!.vault.isDemo ? 'Demo universe (sample data)' : snapshot!.vault.name}
                  </div>
                </div>
                <div className="-mr-2 -mt-1 flex items-center gap-4">
                  <MadeBy className="text-[10px]" />
                  <button className="icon-btn" onClick={() => setOverlay('none')} aria-label="Close dashboard">
                    <IconClose size={14} />
                  </button>
                </div>
              </header>

              <div className="relative mt-4">
                <IconSearch size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6d6c71]" />
                <input
                  className="field h-[38px] !pl-10 text-[13px]"
                  placeholder="Search every note, heading and link..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && results[0]) go(results[0].id)
                    if (e.key === 'Escape' && query) {
                      e.stopPropagation()
                      setQuery('')
                    }
                  }}
                  aria-label="Search every note, heading and link"
                />
                <AnimatePresence>
                  {query.trim() && (
                    <motion.ul
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="scroll-thin absolute inset-x-0 top-[44px] z-10 max-h-[320px] overflow-y-auto rounded-[11px] border border-white/[0.08] bg-[#111114] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
                    >
                      {results.map((r) => (
                        <li key={r.id}>
                          <button className="w-full rounded-[8px] px-3 py-2 text-left transition hover:bg-white/[0.05]" onClick={() => go(r.id)}>
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="truncate text-[12.5px] text-[#E4E2DD]">
                                <Highlighted text={r.title} range={r.kind === 'title' ? r.highlight : undefined} />
                              </span>
                              <span className="shrink-0 text-[10px] text-[#5d5c61]">
                                {r.category} · {KIND_LABEL[r.kind]}
                              </span>
                            </div>
                            {r.snippet && r.kind !== 'title' && (
                              <div className="mt-0.5 truncate text-[11px] text-[#77767b]">
                                <Highlighted text={r.snippet} range={r.highlight} />
                              </div>
                            )}
                          </button>
                        </li>
                      ))}
                      {!results.length && <li className="px-3 py-3 text-[11.5px] text-[#6d6c71]">No matches.</li>}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-3">
                <StatCard
                  index={0}
                  value={stats.totalNotes}
                  title="Total notes"
                  description={`${formatNumber(stats.totalWords)} words across ${stats.groups.length} constellations`}
                  indicator={stats.createdLast30 ? `+${stats.createdLast30} · 30d` : undefined}
                  bars={stats.createdWeekly}
                  color={ACCENT.orange}
                />
                <StatCard
                  index={1}
                  value={stats.totalHeadings}
                  title="Indexed headings"
                  description={`${stats.avgHeadings.toFixed(1)} per note · bars show H1–H6`}
                  bars={stats.headingLevels}
                  color={ACCENT.green}
                />
                <StatCard
                  index={2}
                  value={stats.totalLinks}
                  title="Internal links"
                  description={stats.unresolvedLinks ? `${formatNumber(stats.unresolvedLinks)} unresolved · bars show link counts` : 'All links resolve · bars show link counts'}
                  bars={stats.degreeBuckets}
                  color={ACCENT.blue}
                />
                <StatCard
                  index={3}
                  value={stats.updatedThisWeek}
                  title="Updated this week"
                  description={`${formatNumber(stats.updatedPriorWeek)} the week before · bars show days`}
                  bars={stats.updatedDaily}
                  color={ACCENT.purple}
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <Panel title="Pages Updated" aside="last 26 weeks" delay={0.36}>
                  <Histogram values={stats.updatedWeeks} color={ACCENT.purple} delay={0.42} labels={['26 weeks ago', 'this week']} />
                </Panel>
                <Panel title="Ideas by Group" aside={`${stats.groups.length} groups`} delay={0.42}>
                  <RankedBars
                    rows={stats.groups.slice(0, 6).map((g) => ({ key: g.id, label: g.name, value: g.count }))}
                    color={ACCENT.green}
                    delay={0.5}
                    onPick={(id) => {
                      setOverlay('none')
                      focusCategory(id)
                    }}
                  />
                </Panel>
                <Panel title="Most Connected Pages" aside="links + backlinks" delay={0.48}>
                  <RankedBars
                    rows={stats.mostConnected.slice(0, 6).map((n) => ({ key: n.id, label: n.title, value: n.degree }))}
                    color={ACCENT.blue}
                    delay={0.56}
                    onPick={go}
                  />
                </Panel>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <Panel title="Recent Activity" delay={0.54}>
                  <ul className="divide-y divide-white/[0.045]">
                    {stats.recentActivity.slice(0, 5).map((a) => (
                      <li key={`${a.id}-${a.kind}`}>
                        <button className="group flex w-full items-center gap-3 py-[5px] text-left" onClick={() => go(a.id)}>
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: a.kind === 'created' ? ACCENT.orange : ACCENT.purple }}
                          />
                          <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#cfcdc8] group-hover:text-white">{a.title}</span>
                          <span className="shrink-0 text-[10px] text-[#6d6c71]">
                            {a.kind === 'created' ? 'Created' : 'Updated'} {relativeTime(a.at)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Panel>
                <Panel title="Recent Notes" delay={0.6}>
                  <ul className="space-y-2">
                    {stats.recentNotes.slice(0, 3).map((n) => (
                      <li key={n.id}>
                        <button className="group w-full text-left" onClick={() => go(n.id)}>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-[12px] text-[#E4E2DD] group-hover:text-white">{n.title}</span>
                            <span className="shrink-0 text-[10px] text-[#5d5c61]">{relativeTime(n.at)}</span>
                          </div>
                          {n.summary && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[#77767b]">{n.summary}</p>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
