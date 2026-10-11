import type { ReactNode } from 'react'

/**
 * Browser chrome around a demo.
 *
 * Product shots float better inside a frame than bleeding into the page: the
 * frame says "this is a thing running somewhere else" without a caption having
 * to. The URL is part of the argument here — the whole claim is that this
 * happens on the watch page rather than on a site of ours, and the address bar
 * is where a reader checks that.
 */
export function BrowserFrame({
  url,
  children,
  className = '',
  tone = 'light',
}: {
  url: string
  children: ReactNode
  className?: string
  tone?: 'light' | 'dark'
}) {
  const dark = tone === 'dark'

  return (
    <div
      className={`overflow-hidden rounded-lg border shadow-float ${
        dark ? 'border-black/40 bg-[#181818]' : 'border-rule bg-card'
      } ${className}`}
    >
      <div
        className={`flex items-center gap-3 border-b px-4 py-3 ${
          dark ? 'border-white/10 bg-[#0f0f0f]' : 'border-rule bg-shell'
        }`}
      >
        <div className="flex shrink-0 gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-pill bg-[#ff5f57]" />
          <span className="size-2.5 rounded-pill bg-[#febc2e]" />
          <span className="size-2.5 rounded-pill bg-[#28c840]" />
        </div>
        <div
          className={`min-w-0 flex-1 truncate rounded-pill px-3.5 py-1.5 text-center font-mono text-[11.5px] ${
            dark ? 'bg-white/10 text-white/55' : 'bg-card text-faint'
          }`}
        >
          {url}
        </div>
      </div>
      {children}
    </div>
  )
}

/**
 * The extension popup's silhouette.
 *
 * The real popup is 360px wide with a rounded window edge; reproducing that
 * shape matters more than reproducing its contents, because the shape is what
 * makes a reader recognise it as the thing that hangs off the toolbar.
 */
export function PopupFrame({
  children,
  className = '',
  label,
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="w-full overflow-hidden rounded-md border border-rule bg-[#ecefe8] shadow-float">
        {children}
      </div>
      {label && <p className="m-0 text-center font-mono text-[11.5px] text-faint">{label}</p>}
    </div>
  )
}

/** The pointer that drives a demo, so a click reads as a click. */
export function Cursor({
  show,
  className = '',
}: {
  show: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute z-30 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        show ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 2L18.5 12.5L12 13.2L15.4 20.4L12.6 21.8L9.2 14.6L5 18.8V2Z"
          fill="#171f12"
          stroke="#fffbf4"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
