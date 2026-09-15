'use client'

import { formatUsdc } from '@tipee/shared'

import { BrowserFrame, Cursor } from './frame'
import { reached, useDemoTimeline, type DemoStep } from './use-demo-timeline'

/**
 * The hero demo: one tip, end to end, on a watch page.
 *
 * This is the argument the whole site rests on — that giving a creator a dollar
 * takes one click from the video you were already watching, and never leaves
 * the page. Told in prose it is a paragraph nobody finishes. Told as the actual
 * sequence it is about nine seconds.
 *
 * The watch page is a deliberate abstraction, not a screenshot: a stylised
 * player, a generic action bar and a fictional channel. Reproducing YouTube's
 * own marks would be both a trademark problem and a lie about what is running —
 * what is true is the *position*, the button sitting between Share and the rest
 * of the bar, and that is what this draws. The address bar carries the rest of
 * the claim.
 *
 * Amounts run through `formatUsdc` from `@tipee/shared` rather than being typed
 * as strings, so a demo cannot quietly show a number the product would render
 * differently.
 */
const STEPS = [
  { name: 'idle', ms: 1900 },
  { name: 'notice', ms: 1500 },
  { name: 'open', ms: 1700 },
  { name: 'amount', ms: 1700 },
  { name: 'confirm', ms: 1800 },
  { name: 'sending', ms: 1200 },
  { name: 'sent', ms: 2800 },
] as const satisfies readonly DemoStep<string>[]

type Step = (typeof STEPS)[number]['name']

/** Five dollars, in accounting units, formatted by the product's own function. */
const TIP = 5_000_000n

const CREATOR = {
  name: 'Pixelforge',
  handle: '@pixelforge',
  initial: 'P',
  title: 'I rebuilt my studio for under $400',
  views: '148K views',
  when: '2 days ago',
}

export function TipDemo({ className = '' }: { className?: string }) {
  const demo = useDemoTimeline<Step>(STEPS, { staticStep: 'sent' })
  const at = (target: Step) => reached(STEPS, demo.step, target)

  const composerOpen = at('open')
  const signing = at('confirm')
  const sent = at('sent')

  return (
    <div
      ref={demo.ref}
      className={`relative ${className}`}
      role="img"
      aria-label={`A demonstration: on a video page, a Tip button beside Like opens the Tipee composer, ${formatUsdc(
        TIP,
      )} USDC is chosen, a PIN confirms it, and the tip is sent to ${CREATOR.handle}.`}
    >
      <BrowserFrame url="youtube.com/watch?v=dQw4w9WgXcQ" tone="dark">
        <div className="relative p-4 sm:p-5">
          {/* Player ------------------------------------------------------ */}
          <div className="relative grid aspect-[16/8] w-full place-items-center overflow-hidden rounded-md bg-gradient-to-br from-[#2b2b2b] via-[#1f1f1f] to-[#111]">
            <span className="grid size-14 place-items-center rounded-pill bg-white/10 backdrop-blur">
              <svg width="20" height="22" viewBox="0 0 20 22" fill="none" aria-hidden="true">
                <path d="M19 11L0.999999 21.3923L1 0.607696L19 11Z" fill="white" />
              </svg>
            </span>
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
              <div className="h-full w-[38%] bg-[#ff0033]" />
            </div>
          </div>

          {/* Title and channel ------------------------------------------- */}
          <h3 className="mt-4 mb-3 text-[15px] font-semibold text-white/90 sm:text-[17px]">
            {CREATOR.title}
          </h3>
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-gradient-to-br from-[#ffd24a] to-[#ff9f43] text-[14px] font-bold text-[#171f12]">
              {CREATOR.initial}
            </span>
            <div className="min-w-0">
              <p className="m-0 truncate text-[13.5px] font-semibold text-white/90">
                {CREATOR.name}
              </p>
              <p className="m-0 truncate font-mono text-[11px] text-white/45">
                {CREATOR.views} · {CREATOR.when}
              </p>
            </div>
          </div>

          {/* Action bar — the whole point of the demo -------------------- */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-4 py-2 text-[12.5px] font-medium text-white/75">
              <ThumbIcon /> 12K
            </span>
            <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-4 py-2 text-[12.5px] font-medium text-white/75">
              <ThumbIcon flipped />
            </span>
            <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-4 py-2 text-[12.5px] font-medium text-white/75">
              Share
            </span>

            {/* The injected button. It carries the brand colour rather than
                YouTube's chrome, because a reader has to be able to tell which
                part of this bar we added. */}
            <span
              data-state={demo.step}
              className={`relative inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[12.5px] font-bold transition-all duration-500 ${
                sent
                  ? 'bg-mint text-deep'
                  : 'bg-forest text-on-forest ' +
                    (demo.step === 'notice' && !demo.frozen ? 'animate-pulse-ring' : '')
              }`}
            >
              {sent ? <CheckIcon /> : <GiftIcon />}
              {sent ? 'Tipped' : 'Tip'}
            </span>
          </div>

          {/* The cursor travels to the button, then parks on the composer. */}
          <Cursor
            show={demo.step === 'notice' || demo.step === 'open'}
            className={
              demo.step === 'notice'
                ? 'bottom-[22px] left-[63%] sm:left-[54%]'
                : 'bottom-[38%] left-[52%]'
            }
          />

          {/* Composer ---------------------------------------------------- */}
          <div
            className={`absolute right-4 bottom-4 z-20 w-[248px] origin-bottom-right transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:right-6 sm:bottom-6 sm:w-[268px] ${
              composerOpen
                ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
                : 'pointer-events-none translate-y-3 scale-95 opacity-0'
            }`}
          >
            <Composer step={demo.step} signing={signing} sent={sent} />
          </div>
        </div>
      </BrowserFrame>

      {/* A caption, because a demo that looks like a screenshot invites the
          reader to believe it is one. */}
      <p className="mt-4 mb-0 text-center font-mono text-[11.5px] text-faint">
        A live re-creation of the extension · not a recording
      </p>
    </div>
  )
}

/**
 * The composer, rebuilt.
 *
 * Kept in the extension's own colours — sage ground, white cards, monospace —
 * rather than restyled into the site's warmer palette. It is a picture of a
 * different surface, and repainting it to match the page would misrepresent
 * what a reader is about to install.
 */
function Composer({ step, signing, sent }: { step: Step; signing: boolean; sent: boolean }) {
  const typed = reached(STEPS, step, 'amount')

  return (
    <div className="overflow-hidden rounded-md border border-[#e2e6dd] bg-[#ecefe8] shadow-float">
      <div className="flex flex-col gap-3 p-4 font-mono">
        <span className="text-[13px] font-semibold tracking-[-0.02em] text-[#121a0f]">tipee</span>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="grid size-11 place-items-center rounded-pill bg-gradient-to-br from-[#ffd24a] to-[#ff9f43] text-[15px] font-bold text-[#171f12]">
            {CREATOR.initial}
          </span>
          <span className="text-[12px] font-semibold text-[#121a0f]">{CREATOR.name}</span>
          <span className="text-[10.5px] text-[#8b9784]">{CREATOR.handle}</span>
        </div>

        {signing || sent ? (
          <SigningPanel sent={sent} sending={step === 'sending'} />
        ) : (
          <>
            <p className="m-0 text-center text-[13px] font-semibold text-[#121a0f]">
              Send a little <em className="text-[#2f6a1f] not-italic">thanks</em>.
            </p>

            <div className="flex items-center justify-between rounded-sm border border-[#e2e6dd] bg-white px-3 py-2.5">
              <span className="text-[16px] font-semibold tabular-nums text-[#121a0f]">
                ${typed ? formatUsdc(TIP) : '0.00'}
                {!typed && <span className="animate-caret text-[#2f6a1f]">|</span>}
              </span>
              <span className="text-[10px] text-[#8b9784]">USDC</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {['1', '5', '10', '25'].map((amount) => (
                <span
                  key={amount}
                  className={`rounded-sm border py-1.5 text-center text-[10.5px] font-medium transition-colors duration-300 ${
                    typed && amount === '5'
                      ? 'border-[#2f6a1f] bg-[#caffb8] text-[#121a0f]'
                      : 'border-[#e2e6dd] bg-white text-[#55634e]'
                  }`}
                >
                  ${amount}
                </span>
              ))}
            </div>

            <div className="bracket" style={{ ['--tick' as string]: '8px', padding: '4px' }}>
              <span className="block rounded-sm bg-[#2f6a1f] py-2 text-center text-[11.5px] font-semibold text-[#f2f4f2]">
                Continue
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SigningPanel({ sent, sending }: { sent: boolean; sending: boolean }) {
  if (sent) {
    return (
      <div className="flex flex-col items-center gap-2 py-3">
        <span className="grid size-10 place-items-center rounded-pill bg-[#caffb8] text-[#2f6a1f]">
          <CheckIcon size={18} />
        </span>
        <span className="text-[12.5px] font-semibold text-[#121a0f]">
          Sent ${formatUsdc(TIP)} USDC
        </span>
        <span className="text-[10px] text-[#8b9784]">Held for {CREATOR.handle}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-center text-[10.5px] text-[#55634e]">
        ${formatUsdc(TIP)} USDC · to {CREATOR.handle}
      </p>
      <p className="m-0 text-center text-[10.5px] text-[#8b9784]">
        {sending ? 'Sending…' : 'Enter your PIN to sign'}
      </p>
      <div className="flex justify-center gap-2">
        {[0, 1, 2, 3].map((slot) => (
          <span
            key={slot}
            className={`size-2.5 rounded-pill transition-colors duration-200 ${
              sending ? 'bg-[#2f6a1f]' : 'bg-[#2f6a1f]'
            }`}
            style={{ transitionDelay: `${slot * 120}ms` }}
          />
        ))}
      </div>
      <div className="bracket" style={{ ['--tick' as string]: '8px', padding: '4px' }}>
        <span className="block rounded-sm bg-[#2f6a1f] py-2 text-center text-[11.5px] font-semibold text-[#f2f4f2]">
          {sending ? 'Sending…' : `Send $${formatUsdc(TIP)} USDC`}
        </span>
      </div>
    </div>
  )
}

function GiftIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="10" width="18" height="11" rx="2" fill="currentColor" opacity="0.9" />
      <rect x="2" y="7" width="20" height="5" rx="1.5" fill="currentColor" />
      <rect x="10.5" y="7" width="3" height="14" fill="#ffd24a" />
      <path
        d="M12 7S9.5 7 8.5 6 8.5 3.5 10 3.5s2 2 2 3.5ZM12 7s2.5 0 3.5-1-.5-2.5-2-2.5-1.5 2-1.5 3.5Z"
        fill="#ffd24a"
      />
    </svg>
  )
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12.5L9.5 18L20 6.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ThumbIcon({ flipped = false }: { flipped?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={flipped ? { transform: 'rotate(180deg)' } : undefined}
    >
      <path d="M2 10h4v11H2V10Zm6 0 4.5-8c1.4 0 2.3 1.2 2 2.6L13.8 9H20a2 2 0 0 1 2 2.4l-1.6 7A2 2 0 0 1 18.4 20H8V10Z" />
    </svg>
  )
}
