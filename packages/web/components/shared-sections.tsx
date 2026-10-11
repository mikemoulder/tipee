import { PLATFORM_FEE_BPS, formatUsdc, splitWithdrawal } from '@tipee/shared'

import { Reveal } from './reveal'
import { Card, Eyebrow, Pill, Section } from './ui'

/**
 * Written once, read correctly by both audiences.
 *
 * These sit below whichever spine is showing and never swap with the toggle —
 * duplicating them per audience is how a two-audience site ends up with two
 * half-maintained copies of its own security claims.
 */

export function BuiltOn() {
  const marks = [
    {
      name: 'Stellar',
      claim: 'Smart accounts, no XLM',
      body: 'Your Tipee wallet is an OpenZeppelin smart account on Stellar — the account Stellar’s own smart-account kit deploys. It holds USDC with no trustline and no XLM reserve, and Tipee pays every network fee, so you never need a second token before you can give someone a dollar.',
    },
    {
      name: 'Soroban escrow',
      claim: 'Held by channel ID',
      body: 'Tips wait in one escrow contract, keyed to the channel ID rather than the handle — so renaming a channel never separates a creator from their money, and nobody needs a wallet before they can be tipped.',
    },
  ]

  return (
    <Section
      id="built-on"
      tone="deep"
      eyebrow="Built on"
      title="Two pieces of infrastructure, doing what each is good at"
    >
      <div className="grid gap-5 md:grid-cols-2">
        {marks.map((mark, index) => (
          <Reveal key={mark.name} delay={index * 90}>
            <div className="flex h-full flex-col gap-4 rounded-lg border border-white/12 bg-white/[0.06] p-7">
              <div className="flex items-center gap-3">
                <span className="text-[24px] font-extrabold tracking-[-0.03em] text-on-forest">
                  {mark.name}
                </span>
                <span className="rounded-pill bg-mint px-3 py-1 font-mono text-[11px] font-semibold text-deep">
                  {mark.claim}
                </span>
              </div>
              <p className="m-0 text-[15px] leading-relaxed text-mint/75">{mark.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

export function Custody() {
  const pillars = [
    {
      title: 'Your keys stay in your browser',
      body: 'A gifter wallet is generated locally and encrypted with AES-256-GCM. The seed never leaves the extension and no server of ours can sign for you.',
    },
    {
      title: 'Creator funds sit in escrow, not our wallet',
      body: 'Tips are held by the Tipee escrow contract on Stellar, under the channel ID. Releasing them takes our verifier’s signature, which we give only after the channel proves it is yours.',
    },
    {
      title: 'Identity is resolved server-side',
      body: 'A handle is turned into a channel ID by the backend, reading YouTube. Handles get reassigned; channel IDs do not, and a client cannot claim to be a channel it is not.',
    },
    {
      title: 'Nothing is custodial after withdrawal',
      body: 'Once a creator verifies and withdraws, the money is in their own wallet and out of the system entirely.',
    },
  ]

  return (
    <Section
      id="custody"
      tone="cream"
      eyebrow="Custody"
      title="Who can move the money, and when"
      lede="The honest version, including the part where we hold something. A product that is vague about custody is telling you which answer it did not like."
    >
      <div className="grid gap-5 md:grid-cols-2">
        {pillars.map((pillar, index) => (
          <Reveal key={pillar.title} delay={index * 70}>
            <Card className="h-full">
              <span className="grid size-9 place-items-center rounded-pill bg-mint text-deep">
                <LockGlyph />
              </span>
              <h3 className="m-0 text-[18px] font-bold tracking-[-0.02em]">{pillar.title}</h3>
              <p className="m-0 text-[14.5px] leading-relaxed text-muted">{pillar.body}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

/**
 * The split, on a real number, computed by the same function that will charge
 * it. A fee quoted on a landing page and a fee taken at withdrawal drifting
 * apart is exactly the sort of thing nobody notices until a creator does.
 */
export function TheSplit() {
  const gross = 100_000_000n
  const { fee, net } = splitWithdrawal(gross)
  const percent = Number(PLATFORM_FEE_BPS) / 100

  return (
    <Section
      id="cost"
      tone="tint"
      eyebrow="What it costs"
      title={
        <>
          <span className="text-forest">96%</span> to you, {percent}% to Tipee
        </>
      }
      lede="Taken once, at withdrawal — not on each tip. A viewer who sends $5 sends $5, and the number you see waiting is the number you are withdrawing from."
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center">
        <Reveal className="flex flex-col gap-5">
          {[
            {
              title: 'Nothing is skimmed on the way in',
              body: 'The full tip reaches the channel escrow in the transaction the gifter signs. We touch it once, when it leaves.',
            },
            {
              title: 'No monthly charge, nothing to subscribe to',
              body: 'If nobody tips you, you pay nothing, because there is nothing to take a percentage of.',
            },
            {
              title: 'Network fees are separate and tiny',
              body: 'Tipee pays them. They are a fraction of a cent on Stellar, and paying them is what lets a wallet hold nothing but USDC.',
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-pill bg-forest" />
              <div>
                <p className="m-0 text-[16px] font-bold tracking-[-0.015em]">{item.title}</p>
                <p className="m-0 mt-1 text-[14.5px] leading-relaxed text-muted">{item.body}</p>
              </div>
            </div>
          ))}
        </Reveal>

        <Reveal delay={120}>
          <div className="overflow-hidden rounded-lg border border-rule bg-card shadow-lift">
            {/* A bar, so the proportion is seen before the arithmetic is read. */}
            <div className="flex h-3 w-full" aria-hidden="true">
              <span className="h-full flex-[96] bg-forest" />
              <span className="h-full flex-[4] bg-butter" />
            </div>
            <div className="flex flex-col p-6">
              {(
                [
                  ['You withdraw', `$${formatUsdc(gross)}`, 'text-ink'],
                  [`Tipee fee (${percent}%)`, `−$${formatUsdc(fee)}`, 'text-muted'],
                ] as const
              ).map(([label, value, tone]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 border-b border-rule py-3.5"
                >
                  <span className="text-[14px] text-muted">{label}</span>
                  <span className={`font-mono text-[16px] font-semibold tabular-nums ${tone}`}>
                    {value}
                  </span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 pt-4">
                <span className="text-[14px] font-semibold text-ink">You receive</span>
                <span className="font-mono text-[26px] leading-none font-extrabold tabular-nums text-forest">
                  ${formatUsdc(net)}
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}

type Audience = 'creator' | 'viewer'

const questions: { q: string; a: string; who: Audience | 'both' }[] = [
  {
    who: 'both',
    q: 'Is this real money?',
    a: 'Not yet. Tipee runs on Stellar testnet, so the USDC moving through it has no value outside the test network. Everything else — the wallets, the escrow contract, the split — works exactly as it would on mainnet.',
  },
  {
    who: 'creator',
    q: 'Do I need an account before people can tip me?',
    a: 'No, and that is the point. Tips wait in the escrow contract under your channel ID from the first one. You only turn up when you want to take the money out.',
  },
  {
    who: 'creator',
    q: 'How do you know the channel is mine?',
    a: 'You add a short code we give you to your channel description. Only someone who can edit the channel can do it, which is the same thing as controlling it. Then you remove it again if you like.',
  },
  {
    who: 'creator',
    q: 'What if I change my handle?',
    a: 'Nothing happens. The escrow is keyed to the channel ID, which never changes, rather than the handle, which can be reassigned to someone else entirely.',
  },
  {
    who: 'creator',
    q: 'What if nobody ever claims a channel?',
    a: 'The money stays in the escrow under that channel ID. There is no expiry and no sweep in the contract — it is not ours, and a deadline would only mean taking it from someone who was slow to hear about us.',
  },
  {
    who: 'viewer',
    q: 'Where is my wallet kept?',
    a: 'Your key is in your browser: the extension generates it on first run and encrypts it with a PIN you choose. Your money is in a Stellar smart wallet that only that key controls. Nothing secret is uploaded and we cannot recover it for you — which is why it asks you to write the recovery phrase down first. The phrase is standard (SEP-5), so it works in other Stellar wallets too.',
  },
  {
    who: 'viewer',
    q: 'What does it cost me to send a tip?',
    a: 'The tip, and nothing else. Tipee pays the Stellar network fee, so your wallet only ever holds USDC — no XLM, no second token.',
  },
  {
    who: 'viewer',
    q: 'Does the creator get it straight away?',
    a: 'The money reaches the escrow in the same transaction you sign, about five seconds later. They collect it whenever they verify the channel — there is no waiting period on our side.',
  },
  {
    who: 'viewer',
    q: 'What if the creator never signs up?',
    a: 'It waits for them. Nothing is refunded automatically, so only tip what you would be happy to have sitting there — the same as handing cash to someone who has stepped away from the counter.',
  },
]

export function Faq({ audience }: { audience: Audience }) {
  const shown = questions.filter((entry) => entry.who === audience || entry.who === 'both')

  return (
    <Section
      id="faq"
      tone="cream"
      eyebrow="Questions"
      title="The ones people actually ask"
      align="center"
    >
      <div className="mx-auto flex max-w-[820px] flex-col gap-3">
        {shown.map((entry, index) => (
          <Reveal key={entry.q} delay={Math.min(index * 50, 200)}>
            <details className="group overflow-hidden rounded-md border border-rule bg-card shadow-soft">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-[16px] font-semibold tracking-[-0.015em] marker:content-none [&::-webkit-details-marker]:hidden">
                {entry.q}
                <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-tint text-muted transition-transform duration-300 group-open:rotate-45">
                  <PlusGlyph />
                </span>
              </summary>
              <p className="m-0 px-5 pb-5 text-[14.5px] leading-relaxed text-muted">{entry.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

/**
 * The disclaimer, near the fold.
 *
 * A site that reads as a live money product and turns out to be testnet burns
 * exactly the trust the custody section is trying to build, so this is stated
 * where it will be seen rather than only in the FAQ and the footer.
 */
export function TestnetNotice({ className = '' }: { className?: string }) {
  return (
    /* Outline, not butter. This is a caveat, not a highlight — the yellow
       version drew the eye harder than the headline did, and on a white page
       beside a black-and-white clip it was the last warm thing left. */
    <Pill tone="outline" className={className}>
      <span className="size-1.5 shrink-0 rounded-pill bg-faint" />
      <span>
        <strong className="font-bold">Stellar testnet.</strong> The USDC is test currency — worth
        nothing anywhere else.
      </span>
    </Pill>
  )
}

/** A quiet strip of what the product is, for the space under a hero. */
export function ProofStrip({ items }: { items: { value: string; label: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
          <span className="font-mono text-[22px] leading-none font-extrabold tracking-[-0.03em] text-forest sm:text-[26px]">
            {item.value}
          </span>
          <span className="text-[13px] leading-snug text-muted">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

export function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <Eyebrow>{children}</Eyebrow>
}

function LockGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" fill="currentColor" />
      <path
        d="M7.8 10.5V7.6a4.2 4.2 0 1 1 8.4 0v2.9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PlusGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}
