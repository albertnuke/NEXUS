import { nexus } from '../../lib/bridge'

export const AUTHOR_URL = 'https://github.com/albertnuke'

/**
 * "Made by Albert" credit. Clicking it opens the author's GitHub profile in
 * the default browser (via the main process); NEXUS itself never navigates
 * away or loads remote content.
 */
export function MadeBy({ className = '' }: { className?: string }) {
  return (
    <a
      href={AUTHOR_URL}
      onClick={(e) => {
        e.preventDefault()
        void nexus.app.openExternal(AUTHOR_URL)
      }}
      title="github.com/albertnuke"
      className={`no-drag cursor-pointer uppercase tracking-[0.32em] text-[#F4C77A]/60 underline-offset-[5px] transition-colors duration-200 hover:text-[#F4C77A] hover:underline focus-visible:text-[#F4C77A] focus-visible:outline-none ${className}`}
      data-testid="made-by"
    >
      Made by Albert
    </a>
  )
}
