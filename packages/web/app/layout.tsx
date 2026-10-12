/*
THESIS      Tipee is a tip button beside Like whose money waits on Stellar for a creator who has never heard of it; it refuses the "start your page" signup funnel.
WORLD       sage ground, Hanken Grotesk 600/400 with JetBrains Mono for money and addresses, white tiles, ink pills; forest green means money held for or paid to a creator, nothing else.
STORY       hook with the tip landing in escrow, three steps, the live lookup on a dark band, Super Thanks versus Tipee, the contracts and receipts, the close.
FIRST VIEW  two-line claim left, one sentence, Add to Chrome + check a channel, the signature stage right.
SIGNATURE   a video's action bar, the gift is pressed, and the tip drops into a ledger card addressed to a channel ID that has not signed up.
REFUSES     crypto casino neon, a fintech dashboard of fake charts, a mascot or emoji confetti.
*/
import type { Metadata, Viewport } from 'next'
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google'

import './globals.css'
import { MOTION_BOOT, MotionRoot } from '@/components/motion'
import { SiteFooter } from '@/components/site-footer'
import { SiteNav } from '@/components/site-nav'
import { Toaster } from '@/components/states'

// The extension's two faces, self-hosted so the hero never waits on a font CDN.
const sans = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-brand-sans',
  display: 'swap',
})
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-brand-mono',
  display: 'swap',
})

const TITLE = 'Tipee: tip any YouTuber in USDC on Stellar'
const DESCRIPTION =
  'A gift button beside Like. Your tip waits safely on Stellar until the creator claims it, even if they have never heard of Tipee.'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: TITLE, template: '%s | Tipee' },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: 'Tipee', type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export const viewport: Viewport = { themeColor: '#f3f5ef' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
      </head>
      <body>
        <MotionRoot />
        <a
          href="#main"
          className="sr-only rounded-button bg-action px-5 py-3 text-on-action focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        <SiteNav />
        <main id="main">{children}</main>
        <SiteFooter />
        <Toaster />
      </body>
    </html>
  )
}
