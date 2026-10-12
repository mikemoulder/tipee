import type { Metadata } from 'next'

import { ClaimFlow } from '@/components/claim-flow'
import { Container, Eyebrow } from '@/components/primitives'

export const metadata: Metadata = {
  title: 'Claim your tips',
  description: 'Find your channel, prove it with a code in the description, and send what your viewers tipped to any Stellar address.',
}

const FACTS = [
  { title: 'No account', body: 'You prove the channel, not yourself. There is nothing to sign up for.' },
  { title: '4%, once', body: 'Taken only when you claim. Nothing was taken when your viewers sent it.' },
  { title: 'Any Stellar address', body: 'Send it to any Stellar wallet that holds USDC, including your Tipee wallet.' },
]

export default function ClaimPage() {
  return (
    <section className="pt-12 pb-[var(--section-y)] sm:pt-20">
      <Container className="grid gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="flex flex-col lg:col-span-5">
          <Eyebrow>For creators</Eyebrow>
          <h1 className="t-display-l mt-5">Claim what your viewers sent.</h1>
          <p className="t-lead mt-5 max-w-[44ch]">
            Your viewers’ tips are waiting for you. Prove the channel is yours and they’re paid out in about a minute.
          </p>
          <dl className="mt-10 flex flex-col border-t border-line-strong">
            {FACTS.map((fact) => (
              <div key={fact.title} className="flex flex-col gap-1 border-b border-line py-4">
                <dt className="text-[15px] font-semibold">{fact.title}</dt>
                <dd className="t-small m-0 text-fg-mute">{fact.body}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="lg:col-span-7">
          <ClaimFlow />
        </div>
      </Container>
    </section>
  )
}
