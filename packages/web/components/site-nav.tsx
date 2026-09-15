'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ButtonLink, Container, Wordmark } from './ui'

/**
 * The audience toggle.
 *
 * Both halves are real routes — creators at `/`, viewers at `/viewers` — rather
 * than two client-side states behind one URL. That is the difference between a
 * site with two audiences and two thin landing pages sharing an address: these
 * are linkable, shareable and indexable, and a viewer arriving from a shared
 * link lands on the half that is about them.
 *
 * `Link` keeps the swap instant, so it still feels like a toggle. The nav and
 * footer are rendered by the layout and never unmount, so only the spine
 * between them changes.
 */
const audiences = [
  { href: '/', label: 'Creators' },
  { href: '/viewers', label: 'Viewers' },
] as const

export function SiteNav() {
  const pathname = usePathname()
  const [lifted, setLifted] = useState(false)

  /*
   * The nav is transparent over the hero and gains a surface once the page
   * moves under it. Sticky chrome that looks identical at every scroll position
   * makes a long page feel like it is not moving.
   */
  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        lifted ? 'border-b border-rule bg-cream/85 backdrop-blur-md' : 'border-b border-transparent'
      }`}
    >
      <Container className="flex items-center justify-between gap-4 py-3.5">
        <Link href="/" className="shrink-0 text-ink no-underline" aria-label="Tipee home">
          <Wordmark className="text-[21px]" markSize={27} />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <nav
            aria-label="Audience"
            className="inline-flex rounded-pill border border-rule bg-card p-1 shadow-soft"
          >
            {audiences.map((audience) => {
              const active = pathname === audience.href
              return (
                <Link
                  key={audience.href}
                  href={audience.href}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-pill px-3.5 py-1.5 text-[13px] font-semibold no-underline transition-colors sm:px-4 ${
                    active ? 'bg-forest text-on-forest' : 'text-muted hover:text-ink'
                  }`}
                >
                  {audience.label}
                </Link>
              )
            })}
          </nav>

          {/* Hidden on a wrapper, not on the button. ButtonLink's own base
              classes set `inline-flex`, and Tailwind settles a display
              conflict by stylesheet order rather than by the order the classes
              are written — so `hidden` passed in via className loses, and the
              button stays visible on a phone where it does not fit. */}
          <span className="hidden sm:block">
            <ButtonLink href="/install">Add to Chrome</ButtonLink>
          </span>
        </div>
      </Container>
    </header>
  )
}
