import { ArrowLink, Button, Container, Eyebrow } from '../primitives'
import { TipStage } from './tip-stage'

export function Hero() {
  return (
    <section className="pt-12 pb-[calc(var(--section-y)*0.35)] sm:pt-20">
      <Container className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="flex flex-col lg:col-span-6">
          <Eyebrow>Chrome extension · Stellar testnet</Eyebrow>
          <h1 className="t-display-xl mt-5">
            Tip any YouTuber. Even one who’s never heard of us.
          </h1>
          <p className="t-lead mt-6 max-w-[46ch]">
            A gift button beside Like sends USDC on Stellar. It waits in an escrow contract under the
            channel’s ID until the creator proves the channel is theirs.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-4">
            <Button href="/install" size="lg">
              Add Tipee to Chrome
            </Button>
            <ArrowLink href="/#creators">Check a channel for tips</ArrowLink>
          </div>
          <p className="mt-8 font-mono text-[12.5px] text-fg-mute">No XLM · no fees for you · 4% only when claimed</p>
        </div>
        <TipStage className="lg:col-span-6" />
      </Container>
    </section>
  )
}
