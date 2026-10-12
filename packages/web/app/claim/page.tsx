import type { Metadata } from 'next'

import { ClaimFlow } from '@/components/claim-flow'
import { Container, Eyebrow } from '@/components/primitives'
import { ESCROW_CONTRACT_ID, ESCROW_URL, short } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Claim your tips',
  description: 'Find your channel, prove it with a code in the description, and send what your viewers tipped to any Stellar address.',
}

const FACTS = [
  { title: 'No account', body: 'You prove the channel, not yourself. There is nothing to sign up for.' },
  { title: '4%, once', body: 'Taken when you claim, by the contract, in the same transaction that pays you.' },
  { title: 'Any Stellar address', body: 'An account with a USDC trustline, or a contract wallet such as your Tipee wallet.' },
]

export default function ClaimPage() {
  return (
    <section className="pt-12 pb-[var(--section-y)] sm:pt-20">
      <Container className="grid gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="flex flex-col lg:col-span-5">
          <Eyebrow>For creators</Eyebrow>
          <h1 className="t-display-l mt-5">Claim what your viewers sent.</h1>
          <p className="t-lead mt-5 max-w-[44ch]">
            Tips wait in escrow under your channel ID. Prove the channel is yours and the contract pays you, in about a
            minute.
          </p>
          <dl className="mt-10 flex flex-col border-t border-line-strong">
            {FACTS.map((fact) => (
              <div key={fact.title} className="flex flex-col gap-1 border-b border-line py-4">
                <dt className="text-[15px] font-semibold">{fact.title}</dt>
                <dd className="t-small m-0 text-fg-mute">{fact.body}</dd>
              </div>
            ))}
          </dl>
          <a
            href={ESCROW_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-6 font-mono text-[12.5px] text-fg-mute no-underline hover:text-fg"
          >
            Escrow {short(ESCROW_CONTRACT_ID)} on stellar.expert ↗
          </a>
        </div>
        <div className="lg:col-span-7">
          <ClaimFlow />
        </div>
      </Container>
    </section>
  )
}
