import { AnimatePresence, motion } from 'motion/react'
import { useStore } from '../../state/store'
import { nexus } from '../../lib/bridge'
import { MadeBy } from './MadeBy'

const ease = [0.22, 1, 0.36, 1] as const

/**
 * First-launch, loading, empty-vault and error states. They float over the
 * living black hole so the very first impression is already the universe.
 */
export function Onboarding() {
  const status = useStore((s) => s.status)
  const snapshot = useStore((s) => s.snapshot)

  const showWelcome = status.kind === 'none' && !snapshot
  const showLoading = status.kind === 'loading'
  const showEmpty = status.kind === 'empty'
  const showError = status.kind === 'error'

  return (
    <AnimatePresence mode="wait">
      {showWelcome && (
        <motion.div
          key="welcome"
          className="no-drag absolute inset-x-0 bottom-[13%] flex flex-col items-center text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 1.6, duration: 1.4, ease } }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
        >
          <h1 className="text-[30px] font-light tracking-[0.62em] text-[#F7F5F0]" style={{ marginRight: '-0.62em' }}>
            NEXUS
          </h1>
          <p className="mt-3 text-[13px] tracking-[0.04em] text-[#9a999e]">Your knowledge, visualized.</p>
          <button
            className="mt-8 rounded-full border border-[#F4C77A]/35 bg-[#0c0c0f]/70 px-6 py-2.5 text-[12.5px] tracking-[0.03em] text-[#FFF1D5] backdrop-blur-md transition hover:border-[#F4C77A]/70 hover:bg-[#16130e]/80"
            onClick={() => void nexus.vault.select()}
            data-testid="connect-vault"
          >
            Connect Obsidian Vault
          </button>
          <button
            className="mt-4 text-[11px] text-[#6d6c71] underline-offset-4 transition hover:text-[#b8b6b1] hover:underline"
            onClick={() => void nexus.vault.openDemo()}
          >
            or explore a demo universe with sample notes
          </button>
          <p className="mt-10 max-w-[420px] text-[10.5px] leading-relaxed text-[#4f4e53]">
            Everything stays on this Mac. NEXUS reads your vault without changing it and never connects to the internet.
          </p>
          <MadeBy className="mt-5 text-[10.5px]" />
        </motion.div>
      )}

      {showLoading && (
        <motion.div
          key="loading"
          className="pointer-events-none absolute inset-x-0 bottom-[16%] flex flex-col items-center text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.2, duration: 0.6 } }}
          exit={{ opacity: 0, transition: { duration: 0.6 } }}
        >
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#9a999e]">
            {status.phase === 'scanning' ? 'Scanning vault' : status.phase === 'indexing' ? 'Indexing notes' : 'Mapping your universe'}
          </div>
          <div className="mt-3 h-px w-[180px] overflow-hidden bg-white/[0.07]">
            <motion.div
              className="h-full bg-[#F4C77A]/70"
              animate={{ width: `${Math.round((status.phase === 'layout' ? 1 : status.progress) * 100)}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <div className="mt-2 max-w-[460px] truncate text-[10.5px] text-[#5d5c61]">{status.vaultPath}</div>
        </motion.div>
      )}

      {showEmpty && (
        <motion.div
          key="empty"
          className="no-drag absolute inset-x-0 bottom-[14%] flex flex-col items-center text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.8 } }}
          exit={{ opacity: 0 }}
        >
          <div className="text-[15px] font-light text-[#F4F2ED]">This vault has no Markdown notes yet.</div>
          <p className="mt-2 max-w-[420px] text-[12px] leading-relaxed text-[#8a898e]">
            Create a note in Obsidian and its star will appear here automatically — or choose a different folder.
          </p>
          <div className="mt-1 max-w-[460px] truncate text-[10.5px] text-[#5d5c61]">{status.vaultPath}</div>
          <button className="pill mt-6" onClick={() => void nexus.vault.select()}>
            Choose another vault
          </button>
        </motion.div>
      )}

      {showError && (
        <motion.div
          key="error"
          className="no-drag absolute inset-x-0 bottom-[14%] flex flex-col items-center text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.8 } }}
          exit={{ opacity: 0 }}
          role="alert"
        >
          <div className="text-[15px] font-light text-[#F4F2ED]">The vault could not be opened.</div>
          <p className="mt-2 max-w-[460px] text-[12px] leading-relaxed text-[#b4a08a]">{status.message}</p>
          {status.vaultPath && <div className="mt-1 max-w-[460px] truncate text-[10.5px] text-[#5d5c61]">{status.vaultPath}</div>}
          <div className="mt-6 flex gap-2">
            <button className="pill" onClick={() => void nexus.vault.reindex()}>
              Try again
            </button>
            <button className="pill" onClick={() => void nexus.vault.select()}>
              Choose another vault
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
