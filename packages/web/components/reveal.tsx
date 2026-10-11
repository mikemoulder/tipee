'use client'

import { useEffect, useRef, type ElementType, type ReactNode } from 'react'

/**
 * Fade-and-rise on first sight.
 *
 * Two rules keep this from becoming the kind of scroll animation that makes a
 * page unusable:
 *
 *   - It only ever runs once, and only forwards. Content that fades back out
 *     when you scroll up is a bug wearing an effect's clothes, and it breaks
 *     find-in-page for anything currently faded.
 *   - The starting state lives in CSS under `[data-reveal]`, and the
 *     `prefers-reduced-motion` block in globals.css overrides it to fully
 *     visible. So a reader who has asked for no motion never depends on this
 *     JavaScript running at all — if the bundle fails, they still see the page.
 *
 * The fallback for everyone else is handled below: if `IntersectionObserver` is
 * missing, everything reveals immediately rather than staying invisible.
 */
export function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  className = '',
}: {
  children: ReactNode
  as?: ElementType
  /** ms, for staggering siblings. Keep under ~240 or it reads as lag. */
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (typeof IntersectionObserver === 'undefined') {
      node.dataset.reveal = 'in'
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute('data-reveal', 'in')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      data-reveal=""
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={className}
    >
      {children}
    </Tag>
  )
}
