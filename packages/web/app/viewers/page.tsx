import { MIN_TIP, formatUsdc } from '@tipee/shared'

import { TipDemo } from '@/components/demo/tip-demo'
import { WalletDemo } from '@/components/demo/wallet-demo'
import { Reveal } from '@/components/reveal'
import { BuiltOn, Custody, Faq, TestnetNotice } from '@/components/shared-sections'
import { ButtonLink, Card, Container, Eyebrow, Section, Steps } from '@/components/ui'

export const metadata = {
  title: 'Tip the creator, from the video',
  description:
    'A gift button next to Like. Pick an amount, confirm with your PIN, and the creator has it — in USDC, with your keys never leaving your browser.',
}

/**
 * The viewer spine.
 *
 * This half sells one image more than any sentence: the gift button sitting in
 * the action bar of a page the viewer already knows. So unlike the creator
 * spine — which keeps the fold for its lookup — this hero is a split, and the
 * demo runs in it. A viewer deciding whether to install something wants to see
 * the thing before they read about it.
 */
export default function ViewersPage() {
  return (
    <>
      {/* Hero ------------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="aurora" aria-hidden="true" />
        <Container width="wide" className="relative z-10 pt-14 pb-20 sm:pt-20 sm:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="flex flex-col gap-7">
              <Eyebrow>For viewers</Eyebrow>

              {/* The full stop sits inside the coloured span. Left outside it,
                  a 76px black period floats off the end of a green line and
                  reads as debris rather than punctuation. */}
              <h1 className="m-0 text-hero-sm font-extrabold text-balance">
                Tip the creator,{' '}
                <span className="text-forest">without leaving the video.</span>
              </h1>

              <p className="prose-measure m-0 text-[18px] leading-relaxed text-muted sm:text-[19px]">
                A gift button, right next to Like. Pick an amount, confirm with your PIN, done — in
                USDC, on the page you were already watching.
              </p>

              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/install" size="lg">
                  Add to Chrome
                </ButtonLink>
                <ButtonLink href="#how" tone="secondary" size="lg">
                  See how it works
                </ButtonLink>
              </div>

              <TestnetNotice className="w-fit" />
            </div>

            <TipDemo />
          </div>
        </Container>
      </section>

      {/* How it works ----------------------------------------------------- */}
      <Section
        id="how"
        tone="shell"
        eyebrow="How it works"
        title="Three steps, about fifteen seconds"
        lede="The setup happens once. After that, tipping is the same number of clicks as liking."
      >
        <Steps
          items={[
            {
              title: 'Install the extension',
              body: 'It sets up a wallet on first run and asks you to pick a PIN and write down a recovery phrase. That is the only setup there is.',
            },
            {
              title: 'Click the gift',
              body: 'It sits in the action bar next to Like and Share on any video. Clicking opens a small window with the creator already filled in.',
            },
            {
              title: 'Confirm with your PIN',
              body: 'Choose an amount, add a note if you want one, and confirm. Your wallet signs in your browser, Tipee pays the fee, and the tip lands on Stellar about five seconds later.',
            },
          ]}
        />
      </Section>

      {/* The wallet ------------------------------------------------------- */}
      <Section
        id="wallet"
        tone="cream"
        eyebrow="Your wallet"
        title="A wallet that lives in your browser and nowhere else"
        lede="Not an account you log into. It is generated on your machine the first time you open the extension, and the only copy of the key is the one you write down."
      >
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <Reveal className="flex flex-col gap-5">
            <p className="prose-measure m-0 text-[15.5px] leading-relaxed text-muted">
              The recovery phrase is encrypted with a key derived from your PIN and written to the
              browser&rsquo;s extension storage — not to us, not to a backup service, not to another
              device. The PIN itself never leaves the extension, and no server of ours can sign
              anything on your behalf.
            </p>
            <p className="prose-measure m-0 text-[15.5px] leading-relaxed text-muted">
              That is the good news and the catch in one sentence:{' '}
              <strong className="font-semibold text-ink">
                nobody can move your money except you, and nobody can recover it for you either.
              </strong>{' '}
              The extension makes you confirm three words of the recovery phrase before it will let
              you use the wallet, for exactly that reason.
            </p>

            <Card tone="tint" className="mt-2 max-w-[440px]">
              <Eyebrow>What a tip costs you</Eyebrow>
              <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3">
                <span className="text-[14px] text-muted">Minimum tip</span>
                <span className="font-mono text-[15px] font-semibold tabular-nums">
                  ${formatUsdc(MIN_TIP)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3">
                <span className="text-[14px] text-muted">Network fee</span>
                <span className="font-mono text-[15px] font-semibold tabular-nums">~$0.002</span>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[14px] text-muted">Tipee&rsquo;s cut from you</span>
                <span className="font-mono text-[15px] font-semibold text-forest">Nothing</span>
              </div>
              <p className="m-0 mt-1 text-[13px] leading-relaxed text-muted">
                Tipee&rsquo;s 4% is the creator&rsquo;s withdrawal fee. What you send is what
                arrives.
              </p>
            </Card>
          </Reveal>

          <Reveal delay={120}>
            <WalletDemo />
          </Reveal>
        </div>
      </Section>

      <BuiltOn />
      <Custody />
      <Faq audience="viewer" />

      {/* Closing CTA ------------------------------------------------------ */}
      <section className="border-t border-rule bg-shell py-20 sm:py-28">
        <Container>
          <Reveal className="mx-auto flex max-w-[620px] flex-col items-center gap-7 text-center">
            <h2 className="m-0 text-display font-extrabold text-balance">
              Next video you like, say so with something.
            </h2>
            <p className="m-0 text-[17px] leading-relaxed text-muted text-pretty">
              Free to install, ${formatUsdc(MIN_TIP)} to use, and the creator does not need to know
              Tipee exists for it to reach them.
            </p>
            <ButtonLink href="/install" size="lg">
              Add to Chrome
            </ButtonLink>
          </Reveal>
        </Container>
      </section>
    </>
  )
}
