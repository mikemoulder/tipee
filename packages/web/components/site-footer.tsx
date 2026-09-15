import Link from 'next/link'

import { Container, Wordmark } from './ui'

/**
 * The footer, carrying the disclaimer.
 *
 * The testnet line is repeated here rather than only near the fold. A reader
 * who arrives deep-linked at `/viewers` and scrolls to the bottom to find the
 * GitHub link has not necessarily passed the notice above, and "runs on
 * testnet" is the one fact this site cannot afford to have anyone miss.
 */
const groups: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { href: '/', label: 'For creators' },
      { href: '/viewers', label: 'For viewers' },
      { href: '/install', label: 'Install the extension' },
    ],
  },
  {
    title: 'How it works',
    links: [
      { href: '/#how', label: 'Sending a tip' },
      { href: '/#verify', label: 'Claiming a channel' },
      { href: '/#cost', label: 'Fees' },
      { href: '/#custody', label: 'Custody' },
    ],
  },
  {
    title: 'Built on',
    links: [
      { href: 'https://www.circle.com/arc', label: 'Arc', external: true },
      { href: 'https://www.circle.com', label: 'Circle', external: true },
      { href: 'https://www.circle.com/usdc', label: 'USDC', external: true },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-shell">
      <Container className="flex flex-col gap-12 py-16">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="flex flex-col gap-4">
            <Wordmark className="text-[22px]" markSize={28} />
            <p className="m-0 max-w-[34ch] text-[14px] leading-relaxed text-muted">
              Tip YouTube creators in USDC, straight from the video page. The creator does not need
              an account for the money to arrive.
            </p>
          </div>

          {groups.map((group) => (
            <nav key={group.title} aria-label={group.title} className="flex flex-col gap-3">
              <p className="m-0 font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
                {group.title}
              </p>
              {group.links.map((link) =>
                link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[14px] text-muted no-underline transition-colors hover:text-forest"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-[14px] text-muted no-underline transition-colors hover:text-forest"
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-rule pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
            <strong className="font-semibold text-ink">Running on Arc testnet.</strong> The USDC
            moving through Tipee is test currency with no value anywhere else. Nothing here is an
            offer of financial services.
          </p>
          <p className="m-0 shrink-0 font-mono text-[11.5px] text-faint">
            © {new Date().getFullYear()} Tipee
          </p>
        </div>
      </Container>
    </footer>
  )
}
