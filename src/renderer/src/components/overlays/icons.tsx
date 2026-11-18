import type { SVGProps } from 'react'

/** Minimal monochrome icon set (1.4px strokes) drawn inline — no icon fonts or remote assets. */
type P = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 15, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconZoomIn = (p: P) => (
  <Base {...p}>
    <circle cx="7" cy="7" r="4.6" />
    <path d="M10.4 10.4 14 14M7 5v4M5 7h4" />
  </Base>
)
export const IconZoomOut = (p: P) => (
  <Base {...p}>
    <circle cx="7" cy="7" r="4.6" />
    <path d="M10.4 10.4 14 14M5 7h4" />
  </Base>
)
export const IconReset = (p: P) => (
  <Base {...p}>
    <path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.75" />
    <path d="M2.6 2.4v2.9h2.9" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </Base>
)
export const IconConnections = (p: P) => (
  <Base {...p}>
    <circle cx="3.5" cy="4" r="1.3" />
    <circle cx="12.5" cy="3.5" r="1.3" />
    <circle cx="8.5" cy="12.5" r="1.3" />
    <path d="M4.7 4.4 11.2 3.7M4.3 5.1l3.4 6.3M12 4.8 9.2 11.3" />
  </Base>
)
export const IconSliders = (p: P) => (
  <Base {...p}>
    <path d="M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6" />
    <circle cx="10.5" cy="4.5" r="1.5" />
    <circle cx="5.5" cy="11.5" r="1.5" />
  </Base>
)
export const IconClose = (p: P) => (
  <Base {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Base>
)
export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="7" cy="7" r="4.4" />
    <path d="M10.3 10.3 13.6 13.6" />
  </Base>
)
export const IconArrowLeft = (p: P) => (
  <Base {...p}>
    <path d="M13 8H3.5M7.5 4 3.5 8l4 4" />
  </Base>
)
export const IconChevronDown = (p: P) => (
  <Base {...p}>
    <path d="M4 6l4 4 4-4" />
  </Base>
)
export const IconExternal = (p: P) => (
  <Base {...p}>
    <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5V13a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 3 13V5a.5.5 0 0 1 .5-.5H7" />
  </Base>
)
export const IconLink = (p: P) => (
  <Base {...p}>
    <path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.1-2.1a2.6 2.6 0 0 0-3.7-3.7l-.7.7" />
    <path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.4 8.9a2.6 2.6 0 0 0 3.7 3.7l.7-.7" />
  </Base>
)
export const IconBacklink = (p: P) => (
  <Base {...p}>
    <path d="M13 8H4M7 4.5 3.5 8 7 11.5" />
    <path d="M13 4v8" />
  </Base>
)
export const IconFolder = (p: P) => (
  <Base {...p}>
    <path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.4 1.5h4.6a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
  </Base>
)
export const IconSpark = (p: P) => (
  <Base {...p}>
    <path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.6 1.6M10.4 10.4 12 12M12 4l-1.6 1.6M5.6 10.4 4 12" />
  </Base>
)
export const IconFinder = (p: P) => (
  <Base {...p}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
    <path d="M8 2.5v11M5.5 6v1M10.5 6v1M5.5 10.5c1.5 1 3.5 1 5 0" />
  </Base>
)
export const IconCollapse = (p: P) => (
  <Base {...p}>
    <path d="M10 4 6 8l4 4" />
  </Base>
)
export const IconExpand = (p: P) => (
  <Base {...p}>
    <path d="M6 4l4 4-4 4" />
  </Base>
)
