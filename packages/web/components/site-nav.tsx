import { Wordmark } from './brand'
import { Button, Container } from './primitives'
import { GITHUB_URL } from '@/lib/site'

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#creators', label: 'For creators' },
  { href: '/#stellar', label: 'On Stellar' },
  { href: GITHUB_URL, label: 'GitHub' },
]

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-glass-line bg-glass backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Wordmark />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-button px-3.5 py-2 text-[15px] text-fg-soft no-underline transition-colors duration-150 hover:bg-fill hover:text-fg"
              {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button href="/claim" variant="text" size="sm" className="hidden sm:inline-flex">
            Claim tips
          </Button>
          <Button href="/install" size="sm">
            Add to Chrome
          </Button>
        </div>
      </Container>
    </header>
  )
}
