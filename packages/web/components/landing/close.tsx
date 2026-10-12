import { Button, Container, Section } from '../primitives'
import { Reveal } from '../motion'
import { Photo } from '../photo'

export function Close() {
  return (
    <Section space="tight">
      <Container>
        <div className="grid gap-4 md:grid-cols-2">
          <Reveal className="flex flex-col items-start gap-5 overflow-hidden rounded-feature bg-tile p-8 shadow-card sm:p-12">
            <Photo
              src="/people/viewer.jpg"
              className="-mx-8 -mt-8 mb-2 aspect-[16/9] w-[calc(100%+4rem)] max-w-none object-cover sm:-mx-12 sm:-mt-12 sm:w-[calc(100%+6rem)]"
              fallback={null}
            />
            <p className="t-label">Watching</p>
            <h2 className="t-display-m">Halfway through a video that just saved your afternoon?</h2>
            <p className="t-small max-w-[40ch] text-fg-mute">
              Install the extension and you get a wallet with 10 test USDC to tip with. Tipee pays the fees.
            </p>
            <Button href="/install" size="lg" className="mt-auto">
              Add Tipee to Chrome
            </Button>
          </Reveal>
          <Reveal delay={80} className="flex flex-col items-start gap-5 overflow-hidden rounded-feature bg-tile p-8 shadow-card sm:p-12">
            <Photo
              src="/people/creator-wide.jpg"
              className="-mx-8 -mt-8 mb-2 aspect-[16/9] w-[calc(100%+4rem)] max-w-none object-cover sm:-mx-12 sm:-mt-12 sm:w-[calc(100%+6rem)]"
              fallback={null}
            />
            <p className="t-label">Making</p>
            <h2 className="t-display-m">Run a channel? Your viewers may already have paid you.</h2>
            <p className="t-small max-w-[40ch] text-fg-mute">
              Find your channel, prove it with a code in the description, and send the balance to any Stellar address.
            </p>
            <Button href="/claim" size="lg" variant="ghost" className="mt-auto">
              Claim your tips
            </Button>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
