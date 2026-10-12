import Link from 'next/link'

import { Wordmark } from './brand'
import { Container } from './primitives'
import { ESCROW_CONTRACT_ID, ESCROW_URL, GITHUB_URL, RELEASE_URL, SMART_ACCOUNT_KIT_URL, short } from '@/lib/site'

const COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: 'Product',
    links: [
      { href: '/install', label: 'Install the extension' },
      { href: '/claim', label: 'Claim your tips' },
      { href: '/#how', label: 'How it works' },
    ],
  },
  {
    title: 'On Stellar',
    links: [
      { href: ESCROW_URL, label: `Escrow ${short(ESCROW_CONTRACT_ID)}` },
      { href: SMART_ACCOUNT_KIT_URL, label: 'OpenZeppelin smart accounts' },
      { href: 'https://tipee-api.duckdns.org/health', label: 'API health' },
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
          <p className="t-small text-fg-mute">Stellar testnet. The USDC here is test money, and so is every balance.</p>
          <p className="t-small text-fg-faint">Built for Find Your Way, 2026</p>
        </div>
      </Container>
    </footer>
  )
}
