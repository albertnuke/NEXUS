import { useEffect, useRef, useState } from 'react'
import type { SearchResult } from '@shared/types'
import { nexus } from '../../lib/bridge'

/** Debounced vault search through the main process. Stale responses are dropped. */
export function useSearch(query: string, limit = 30, delay = 70): { results: SearchResult[]; loading: boolean } {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const q = query.trim()
    const id = ++seq.current
    if (!q) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(() => {
      nexus.vault
        .search(q, limit)
        .then((r) => {
          if (id === seq.current) setResults(r)
        })
        .catch(() => {
          if (id === seq.current) setResults([])
        })
        .finally(() => {
          if (id === seq.current) setLoading(false)
        })
    }, delay)
    return () => clearTimeout(t)
  }, [query, limit, delay])

  return { results, loading }
}

export function Highlighted({ text, range }: { text: string; range?: [number, number] }) {
  if (!range || range[0] < 0 || range[1] > text.length || range[0] >= range[1]) return <>{text}</>
  return (
    <>
      {text.slice(0, range[0])}
      <span className="text-[#F4C77A]">{text.slice(range[0], range[1])}</span>
      {text.slice(range[1])}
    </>
  )
}

export const KIND_LABEL: Record<SearchResult['kind'], string> = {
  title: 'Title',
  alias: 'Alias',
  heading: 'Heading',
  tag: 'Tag',
  path: 'Path',
  link: 'Link',
  content: 'Content'
}
