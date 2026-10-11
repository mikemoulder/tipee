import { MIN_TIP, formatUsdc } from '@tipee/shared'

import { ChannelLookup } from '@/components/channel-lookup'
import { HeroClip } from '@/components/hero-clip'
import { TipDemo } from '@/components/demo/tip-demo'
import { VerifyDemo } from '@/components/demo/verify-demo'
import { Reveal } from '@/components/reveal'
import {
  BuiltOn,
  Custody,
  Faq,
  ProofStrip,
  TestnetNotice,
  TheSplit,
} from '@/components/shared-sections'
import { Container, Eyebrow, Section, Steps } from '@/components/ui'

export const metadata = {
  title: 'Tipee — you might already have money waiting',
  description:
    'Viewers can tip your YouTube channel in USDC from the video page, whether or not you have heard of Tipee. Check whether anything is waiting for you.',
}

/**
 * The creator spine, and the site's default.
 *
 * Every other creator-funding product opens with "start your page", because
 * until the creator signs up there is nothing. Tipee is the other shape: the
 * gifter's tip provisions the escrow, so a creator arrives to an account
 * somebody else already made. The hero is therefore a lookup, not a signup —
 * and it is literally step one of /claim rather than a teaser for it.
 *
 * The lookup keeps the fold to itself. A product demo beside it would be the
 * conventional choice and it would halve the one thing here nobody else can
 * say; the demo gets the whole width immediately below instead, where it is
 * bigger than it could ever have been in a column.
 *
 * ## The backdrop
 *
 * The clip runs behind the whole hero, under frosted white glass — see
 * components/hero-clip.tsx for why it is frosted rather than faded. The type
 * sits on top of it and stays black, because the frost is graded to be nearly
 * solid white down the left, where the type column is.
 *
 * There is no nameplate here. An earlier pass set "tipee" at poster size above
 * the headline and it was wrong twice over: the wordmark already appears in the
 * nav directly above it, and a hero whose largest element is the brand name is
 * a hero that spends its fold telling you what it is called instead of what it
 * does. The wordmark lives in the nav and nowhere else on the page.
 *
 * Kept from every version before it: the lookup is still the hero's only call
 * to action, and it is still literally step one of /claim rather than a teaser
 * for it. That is the one thing on this page no competitor can say, and no
 * amount of art direction is worth spending it.
 */
export default function CreatorPage() {
  return (
    <>
      {/* Hero ------------------------------------------------------------- */}
      {/* The aurora is gone from this page. It was a soft wash standing in for
          exactly the depth the clip now supplies, and running both put two
          competing light sources behind one headline. */}
      <section className="relative isolate overflow-hidden">
        <HeroClip />

        <Container className="relative z-10 pt-20 pb-24 sm:pt-28 sm:pb-32">
          <div className="flex max-w-[780px] flex-col gap-7">
            {/* `muted`, not the default `faint`: this one sits over the clip.
                See the contrast note on Eyebrow. */}
            <Eyebrow tone="muted">For creators</Eyebrow>

            <h1 className="m-0 text-hero font-extrabold text-balance">
              You might already have{' '}
              {/* The full stop lives inside the span. Left outside it, JSX puts
                  a space before it and the line reads "money waiting ." */}
              <span className="relative whitespace-nowrap">
                <span className="text-forest">money waiting</span>.
                {/* A hand-drawn underline rather than a highlight box — it
                    emphasises without boxing the line in. Inset from the right
                    so the stroke underlines the words, not the full stop. */}
                {/* Offset in em, not px: a fixed -4px sits clear of the
                    baseline at 76px and cuts through the descenders at 42px. */}
                <svg
                  className="absolute -bottom-[0.1em] left-0 h-[0.16em] w-[calc(100%-0.35em)]"
                  height="14"
                  viewBox="0 0 320 14"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {/* Forest, not the butter yellow this was. Green is the only
                      hue left on the page and it means "actionable"; the words
                      it underlines are the ones the lookup below answers. */}
                  <path
                    d="M2 9.5C58 4.2 128 2.5 190 4.1c40 1 90 3.4 128 6.6"
                    stroke="#1c7a34"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>

            <p className="prose-measure m-0 text-[18px] leading-relaxed text-muted sm:text-[19px]">
              Viewers can tip your channel in USDC straight from the video page — whether or not
              you have ever heard of Tipee. Paste your channel and see if anyone has.
            </p>

            <div className="max-w-[640px]">
              <ChannelLookup autoFocus />
            </div>

            <TestnetNotice className="w-fit" />
          </div>
        </Container>
      </section>

      {/* The demo band ---------------------------------------------------- */}
      <section className="border-y border-rule bg-shell py-20 sm:py-24">
        <Container width="wide">
          <Reveal className="mx-auto mb-12 flex max-w-[720px] flex-col gap-4 text-center">
            <Eyebrow>What your viewers see</Eyebrow>
            <h2 className="m-0 text-display font-extrabold text-balance">
              A gift button, right where they already click
            </h2>
            <p className="m-0 text-[17px] leading-relaxed text-muted text-pretty">
              No landing page to send anyone to, no link in the description, nothing for them to
              sign up for. The tip happens on the video they are already watching.
            </p>
          </Reveal>

          <Reveal delay={90} className="mx-auto max-w-[900px]">
            <TipDemo />
          </Reveal>

          <Reveal delay={140} className="mx-auto mt-14 max-w-[900px]">
            <ProofStrip
              items={[
                { value: '0', label: 'Signup steps before money can reach you' },
                { value: '96%', label: 'Of every tip is yours at withdrawal' },
                { value: `$${formatUsdc(MIN_TIP, { minDecimals: 2 })}`, label: 'Smallest tip a viewer can send' },
                { value: '1', label: 'Click from the video to the composer' },
              ]}
            />
          </Reveal>
        </Container>
      </section>

      {/* How it works ----------------------------------------------------- */}
      <Section
        id="how"
        tone="cream"
        eyebrow="How it works"
        title="Three steps, and you only turn up for the last one"
        lede="The unusual part is the order. Your account is created by somebody else — a viewer who wanted to give you a dollar — and it exists before you do anything at all."
      >
        <Steps
          items={[
            {
              title: 'A viewer tips you',
              body: 'They click a gift button beside Like on your video, pick an amount and confirm. Nothing is needed from you — not an account, not a link in your description, not even knowing this exists.',
            },
            {
              title: 'It is held for you',
              body: 'The tip lands in the Tipee escrow contract on Stellar, held under your channel ID. Not your handle — channel IDs never change hands, so renaming your channel can never separate you from it.',
            },
            {
              title: 'You verify and withdraw',
              body: 'Add a code we give you to your channel description to prove the channel is yours, then claim to any Stellar address you like. The code can come straight back down afterwards.',
            },
          ]}
        />
      </Section>

      {/* Verification ----------------------------------------------------- */}
      <Section
        id="verify"
        tone="tint"
        eyebrow="Claiming a channel"
        title="Proving it is yours takes one link and about a minute"
        lede="No email, no password, no document upload, and no account to be locked out of later. If you can edit your own About page, you can prove you own the channel."
      >
        <Reveal>
          <VerifyDemo />
        </Reveal>
      </Section>

      <TheSplit />
      <BuiltOn />
      <Custody />
      <Faq audience="creator" />

      {/* Closing CTA ------------------------------------------------------ */}
      <section className="relative overflow-hidden border-t border-rule bg-shell py-20 sm:py-28">
        <Container>
          <Reveal className="mx-auto flex max-w-[680px] flex-col items-center gap-7 text-center">
            <h2 className="m-0 text-display font-extrabold text-balance">So — is anything waiting?</h2>
            <p className="m-0 text-[17px] leading-relaxed text-muted text-pretty">
              It takes one paste to find out, and there is still nothing to sign up for.
            </p>
            <div className="w-full">
              <ChannelLookup />
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  )
}
