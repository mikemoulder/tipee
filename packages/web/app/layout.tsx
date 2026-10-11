import type { Metadata, Viewport } from 'next'
import { Anton, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'

import './globals.css'
import { SiteFooter } from '@/components/site-footer'
import { SiteNav } from '@/components/site-nav'

/*
 * Self-hosted rather than pulled from Google at runtime. The extension imports
 * these over the network because a popup has no build step worth the trouble; a
 * site does, and a landing page that waits on fonts.googleapis.com before it can
 * draw its own hero is paying for that on every first visit.
 *
 * Plus Jakarta Sans replaces the extension's Hanken Grotesk here on purpose.
 * The popup sets everything in JetBrains Mono, which is right for a tool and
 * wrong for a page somebody has to warm to — monospace at paragraph length
 * reads as a terminal, and the whole point of this expression is that it should
 * not. Mono is kept for what it is genuinely better at: amounts, addresses,
 * handles and code, where the tabular figures and the unambiguous zero matter.
 *
 * Anton sits above both and is used for exactly two things: the hero nameplate
 * and the nav wordmark. It ships one weight, which is already black — there is
 * no 700 to ask for, and asking would get a synthesised bold smeared over a
 * face that is heavy by design. It is also condensed, which is the whole reason
 * it is here: the masthead can run at 11rem without overrunning its measure,
 * and narrow letterforms read as forward motion beside a clip of a road.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
})

const anton = Anton({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-anton',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://tipee.xyz'),
  title: {
    default: 'Tipee — tip YouTube creators in USDC',
    template: '%s · Tipee',
  },
  description:
    'Viewers tip creators in USDC straight from the video page. Creators claim what is already waiting for them — no signup needed before the money arrives.',
  openGraph: {
    title: 'Tipee — tip YouTube creators in USDC',
    description:
      'A gift button next to Like. Tips land in escrow for the creator, whether or not they have heard of us.',
    url: 'https://tipee.xyz',
    siteName: 'Tipee',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tipee — tip YouTube creators in USDC',
    description:
      'A gift button next to Like. Tips land in escrow for the creator, whether or not they have heard of us.',
  },
}

/** Matches the page ground, so mobile browser chrome does not sit on a seam. */
export const viewport: Viewport = {
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${anton.variable} ${jetbrains.variable}`}>
      <head>
        {/*
          Marks the document as scripted before first paint, which is what
          gates the scroll-reveal hidden state in globals.css. It has to be
          inline and in the head: loaded from a chunk it would run after paint
          and every revealed section would flash in. And it has to be this way
          round — if the hiding were unconditional, a reader whose JavaScript
          never ran would get a page of invisible content instead of a page
          with no animation.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body className="bg-cream text-ink">
        <a
          href="#main"
          className="sr-only rounded-pill bg-forest px-5 py-3 text-on-forest focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60]"
        >
          Skip to content
        </a>
        <SiteNav />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
