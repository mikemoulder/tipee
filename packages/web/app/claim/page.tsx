import { ClaimFlow } from '@/components/claim-flow'
import { TestnetNotice } from '@/components/shared-sections'
import { Container, Eyebrow } from '@/components/ui'

export const metadata = {
  title: 'Claim your tips · Tipee',
  description: 'Prove your YouTube channel is yours and claim the USDC tips waiting for it in escrow on Stellar.',
}

export default function ClaimPage() {
  return (
    <section className="relative overflow-hidden">
      <div className="aurora" aria-hidden="true" />
      <Container className="relative z-10 pt-16 pb-24 sm:pt-24">
        <div className="flex max-w-[720px] flex-col gap-7">
          <Eyebrow>For creators</Eyebrow>
          <h1 className="m-0 text-hero font-extrabold text-balance">Claim your tips.</h1>
          <p className="prose-measure m-0 text-[18px] leading-relaxed text-muted">
            Viewers have been able to tip your channel since before you heard of Tipee. The money waits in an escrow
            contract on Stellar under your channel ID. Prove the channel is yours and it is paid to any address you
            choose.
          </p>
          <TestnetNotice className="w-fit" />
          <ClaimFlow />
        </div>
      </Container>
    </section>
  )
}
