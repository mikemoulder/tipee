'use client'

import { formatUsdc, splitWithdrawal } from '@tipee/shared'

import { BrowserFrame } from './frame'
import { reached, useDemoTimeline, type DemoStep } from './use-demo-timeline'

/**
 * Verification, as the round trip it actually is.
 *
 * Proving channel ownership by editing a page on the channel is the single
 * most unfamiliar thing this product asks of anyone, and prose does not carry
 * it — "add a link to your About page" sounds like more work than it is, and
 * leaves the reader wondering what happens to the link afterwards. Watching the
 * token appear, the check run, and the withdraw button unlock answers all of
 * it in about eight seconds.
 *
 * The split at the end is computed by `splitWithdrawal` from `@tipee/shared` —
 * the same function that will take the fee. A demo quoting one number while the
 * backend charges another is the kind of drift a creator finds, not us.
 */
const STEPS = [
  { name: 'token', ms: 2200 },
  { name: 'pasting', ms: 2000 },
  { name: 'checking', ms: 1600 },
  { name: 'verified', ms: 2200 },
  { name: 'withdraw', ms: 3000 },
] as const satisfies readonly DemoStep<string>[]

type Step = (typeof STEPS)[number]['name']

const TOKEN = 'tipee.xyz/v/a7f3c1'
const WAITING = 127_000_000n

export function VerifyDemo({ className = '' }: { className?: string }) {
  const demo = useDemoTimeline<Step>(STEPS, { staticStep: 'verified', threshold: 0.3 })
  const at = (target: Step) => reached(STEPS, demo.step, target)

  const split = splitWithdrawal(WAITING)

  return (
    <div
      ref={demo.ref}
      className={`grid gap-5 lg:grid-cols-2 lg:items-start ${className}`}
      role="img"
      aria-label="A demonstration: a verification link is added to a channel's About page, Tipee checks for it, the channel is marked verified, and the balance becomes withdrawable."
    >
      {/* Left: the creator's About page ------------------------------------ */}
      <BrowserFrame url="youtube.com/@pixelforge/about" className="lg:sticky lg:top-24">
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-pill bg-gradient-to-br from-butter to-peach text-[16px] font-bold text-ink">
              P
            </span>
            <div>
              <p className="m-0 text-[15px] font-bold tracking-[-0.02em]">Pixelforge</p>
              <p className="m-0 font-mono text-[11.5px] text-faint">@pixelforge · 148K subscribers</p>
            </div>
          </div>

          <div className="h-px bg-rule" />

          <p className="m-0 text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">
            Links
          </p>

          <div className="flex flex-col gap-2">
            {['pixelforge.studio', 'github.com/pixelforge'].map((link) => (
              <span
                key={link}
                className="rounded-sm bg-tint px-3 py-2 font-mono text-[12px] text-muted"
              >
                {link}
              </span>
            ))}

            {/* The token, arriving. */}
            <span
              className={`flex items-center justify-between gap-2 rounded-sm border px-3 py-2 font-mono text-[12px] transition-all duration-500 ${
                at('pasting')
                  ? 'translate-y-0 border-forest bg-mint text-deep opacity-100'
                  : '-translate-y-1 border-rule bg-tint text-faint opacity-0'
              }`}
            >
              <span className="truncate">
                {TOKEN}
                {demo.step === 'pasting' && !demo.frozen && (
                  <span className="animate-caret text-forest">|</span>
                )}
              </span>
              {at('verified') && <CheckBadge />}
            </span>
          </div>

          <p className="m-0 text-[12.5px] leading-relaxed text-muted">
            Only someone who can edit this page can put a link on it — which is the same thing as
            controlling the channel.
          </p>
        </div>
      </BrowserFrame>

      {/* Right: the claim panel -------------------------------------------- */}
      <div className="flex flex-col gap-4 rounded-lg border border-rule bg-card p-6 shadow-lift sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <p className="m-0 font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
            tipee.xyz/claim
          </p>
          <StatusPill step={demo.step} />
        </div>

        <div className="flex flex-col gap-1 rounded-md bg-tint p-5">
          <span className="font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
            Waiting for @pixelforge
          </span>
          <span className="text-[38px] leading-none font-extrabold tabular-nums text-forest">
            ${formatUsdc(WAITING)}
          </span>
          <span className="text-[13px] text-muted">across 41 tips</span>
        </div>

        {/* The instruction, then its result. */}
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          <VerifyRow
            done={at('pasting')}
            active={demo.step === 'token'}
            title="Add this link to your About page"
            detail={TOKEN}
            mono
          />
          <VerifyRow
            done={at('verified')}
            active={demo.step === 'checking'}
            title={demo.step === 'checking' ? 'Checking your About page…' : 'We check for it'}
            detail="Usually under a minute. Take the link back off afterwards if you like."
          />
          <VerifyRow
            done={at('withdraw')}
            active={demo.step === 'verified'}
            title="Withdraw to any wallet"
            detail="No account, no password, nothing to be locked out of later."
          />
        </ol>

        {/* The split, shown only once withdrawal is actually on the table. */}
        <div
          className={`overflow-hidden rounded-md border border-rule transition-all duration-500 ${
            at('withdraw') ? 'max-h-52 opacity-100' : 'max-h-0 border-transparent opacity-0'
          }`}
        >
          {(
            [
              ['You withdraw', `$${formatUsdc(WAITING)}`, 'text-ink'],
              ['Tipee fee (4%)', `−$${formatUsdc(split.fee)}`, 'text-muted'],
              ['You receive', `$${formatUsdc(split.net)}`, 'text-forest'],
            ] as const
          ).map(([label, value, tone], index) => (
            <div
              key={label}
              className={`flex items-baseline justify-between gap-4 px-4 py-2.5 ${
                index < 2 ? 'border-b border-rule bg-card' : 'bg-mint'
              }`}
            >
              <span className="text-[12.5px] text-muted">{label}</span>
              <span className={`font-mono text-[13.5px] font-semibold tabular-nums ${tone}`}>
                {value}
              </span>
            </div>
          ))}
        </div>

        <span
          className={`rounded-pill py-3 text-center text-[14px] font-bold transition-all duration-500 ${
            at('withdraw')
              ? 'bg-forest text-on-forest shadow-lift'
              : 'cursor-not-allowed bg-tint text-faint'
          }`}
        >
          {at('withdraw') ? `Withdraw $${formatUsdc(split.net)}` : 'Verify to withdraw'}
        </span>
      </div>
    </div>
  )
}

function VerifyRow({
  done,
  active,
  title,
  detail,
  mono = false,
}: {
  done: boolean
  active: boolean
  title: string
  detail: string
  mono?: boolean
}) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-pill text-[11px] font-bold transition-colors duration-400 ${
          done
            ? 'bg-forest text-on-forest'
            : active
              ? 'bg-butter text-ink'
              : 'bg-tint text-faint'
        }`}
      >
        {done ? <CheckGlyph /> : '·'}
      </span>
      <div className="min-w-0">
        <p className="m-0 text-[14px] font-semibold tracking-[-0.01em]">{title}</p>
        <p
          className={`m-0 mt-0.5 text-[12.5px] leading-relaxed text-muted ${
            mono ? 'font-mono break-all' : ''
          }`}
        >
          {detail}
        </p>
      </div>
    </li>
  )
}

function StatusPill({ step }: { step: Step }) {
  const verified = step === 'verified' || step === 'withdraw'
  const checking = step === 'checking'

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1 text-[11.5px] font-semibold transition-colors duration-400 ${
        verified ? 'bg-mint text-deep' : checking ? 'bg-butter/40 text-ink' : 'bg-tint text-faint'
      }`}
    >
      {verified && <CheckGlyph />}
      {verified ? 'Verified' : checking ? 'Checking…' : 'Unverified'}
    </span>
  )
}

function CheckGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12.5L9.5 18L20 6.5"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckBadge() {
  return (
    <span className="grid size-4 shrink-0 place-items-center rounded-pill bg-forest text-on-forest">
      <CheckGlyph />
    </span>
  )
}
