import Link from 'next/link'

import { Wordmark } from './brand'
import { Container } from './primitives'
import { GITHUB_URL, RECEIPTS, RELEASE_URL } from '@/lib/site'

const COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: 'Product',
    links: [
      { href: '/install', label: 'Install the extension' },
      { href: '/claim', label: 'Claim your tips' },
      { href: '/dashboard', label: 'Creator dashboard' },
      { href: '/#how', label: 'How it works' },
    ],
  },
  {
    title: 'Stellar',
    links: [
      { href: '/#stellar', label: 'Why Stellar' },
      { href: RECEIPTS[0].url, label: 'See a real tip' },
    ],
  },
  {
    title: 'Source',
    links: [
      { href: GITHUB_URL, label: 'GitHub' },
      { href: RELEASE_URL, label: 'Releases' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="bg-surface pt-20 pb-10">
      <Container>
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="flex flex-col gap-4">
            <Wordmark />
            <p className="t-small max-w-[34ch] text-fg-mute">
              A tip button beside Like. The money waits on Stellar until the creator comes for it.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col gap-3">
              <p className="t-label">{column.title}</p>
              <ul className="flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith('/') ? (
                      <Link href={link.href} className="t-small text-fg-soft no-underline hover:text-fg">
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="t-small text-fg-soft no-underline hover:text-fg"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col gap-2 border-t border-line-strong pt-6 sm:flex-row sm:justify-between">
          <p className="t-small text-fg-mute">A test version on Stellar testnet. Every dollar here is play money.</p>
          <p className="t-small text-fg-faint">Built for Find Your Way, 2026</p>
        </div>
      </Container>
    </footer>
  )
}
