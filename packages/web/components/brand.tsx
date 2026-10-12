import Link from 'next/link'

import { cx } from './primitives'

/** The same glyph the extension injects beside Like, so the site's mark is the button. */
export function GiftGlyph({ className, strokeWidth = 1.6 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10h16v10H4zM3 10h18v3H3zM12 10v10M12 10H7.5a2.5 2.5 0 1 1 0-5c1.4 0 2.4 1.3 3 2.5L12 10Zm0 0h4.5a2.5 2.5 0 1 0 0-5c-1.4 0-2.4 1.3-3 2.5L12 10Z" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cx('inline-flex items-center text-fg no-underline', className)} aria-label="Tipee home">
      <span className="text-[22px] font-semibold tracking-[-0.03em]">tipee</span>
    </Link>
  )
}
