import Image from 'next/image'

import { ArrowLink, Container, Section, SectionHead } from '../primitives'
import { Reveal } from '../motion'

/**
 * Proof that the product exists outside its own marketing: real screenshots
 * of the 0.3.1 extension on a real YouTube video (the Stellar Development
 * Foundation's), taken on 2026-10-12 in Chrome. The $5 tip in them went
 * through on testnet; the receipt link is that transaction.
 */
const RECEIPT = 'https://stellar.expert/explorer/testnet/tx/637dac44a9d3cf60e8d98b995a91c619e702d9dff83e0567807265e9436f99e0'

export function OnYouTube() {
  return (
    <Section space="tight" className="pt-0">
      <Container>
        <Reveal>
          <SectionHead
            eyebrow="On a real video"
            title="This is what it looks like on YouTube today."
            lead="Screenshots from the extension you can download, on a video from the Stellar Development Foundation’s channel."
          />
        </Reveal>
        <div className="grid gap-4 lg:grid-cols-12">
          <Reveal className="flex flex-col gap-4 lg:col-span-6">
            <div className="flex flex-col gap-6 rounded-panel bg-tile p-6 shadow-card sm:p-8">
            <div>
              <p className="t-label">1 · The gift, beside Like</p>
              <div className="relative mt-5 overflow-hidden rounded-tile border border-line">
                <Image
                  src="/shots/youtube-gift-button.webp"
                  alt="A YouTube video from the Stellar Development Foundation, with the Tipee gift button just before Like, Share and Save."
                  width={1400}
                  height={358}
                  className="h-auto w-full"
                  sizes="(min-width: 1024px) 560px, 100vw"
                />
                {/* Rings the gift: it sits at 40–120 px across, 220–300 px down, in a 1400 × 358 shot. */}
                <span
                  aria-hidden
                  className="absolute rounded-full ring-2 ring-accent ring-offset-2 ring-offset-white"
                  style={{ left: '2.6%', top: '60%', width: '6.3%', height: '24.5%' }}
                />
              </div>
            </div>
            <p className="t-small text-fg-mute">
              Tipee adds one button to the row under every video. Nothing else on the page changes.
            </p>
            </div>
            <div className="flex flex-1 flex-col justify-end gap-3 rounded-panel bg-tile p-6 shadow-card sm:p-8">
              <p className="t-title">That $5 went through.</p>
              <p className="t-small text-fg-mute">
                It’s waiting for the Stellar Development Foundation to claim it, and anyone can look it up on Stellar.
              </p>
              <ArrowLink href={RECEIPT} className="mt-1">
                See the receipt
              </ArrowLink>
            </div>
          </Reveal>
          <Reveal delay={60} className="grid grid-cols-2 gap-4 lg:col-span-6">
            <figure className="flex flex-col gap-4 rounded-panel bg-tile p-5 shadow-card">
              <p className="t-label">2 · Pick an amount</p>
              <Image
                src="/shots/tip-window.webp"
                alt="The Tipee tip window for the Stellar Development Foundation, with 5 dollars chosen and a note."
                width={760}
                height={1240}
                className="h-auto w-full rounded-tile border border-line"
                sizes="(min-width: 1024px) 270px, 45vw"
              />
            </figure>
            <figure className="flex flex-col gap-4 rounded-panel bg-tile p-5 shadow-card">
              <p className="t-label">3 · It’s sent</p>
              <Image
                src="/shots/wallet.webp"
                alt="The Tipee wallet after the tip: 5 dollars left, and the tip to the Stellar Development Foundation at the top of the activity list."
                width={720}
                height={1200}
                className="h-auto w-full rounded-tile border border-line"
                sizes="(min-width: 1024px) 270px, 45vw"
              />
            </figure>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
