'use client'

import { useEffect, useRef, useState } from 'react'

import { GiftGlyph } from '../brand'
import { useInView, useReducedMotion } from '../motion'
import { cx } from '../primitives'

/**
 * The signature (DESIGN.md §2): a video's action bar, the gift is pressed, the
 * composer sends, and the tip lands in a ledger addressed to a channel ID whose
 * owner has never opened Tipee.
 *
 * The composer is a copy of the extension's own (composer/main.ts): same
 * headline, same presets (TIP_PRESETS: 1, 5, 10, 25), same "Sent … USDC".
 * The channel is invented on purpose: a real creator beside a tip button reads
 * as an endorsement nobody gave. The live, real lookup is section 4.
 *
 * Without JavaScript, or with reduced motion, it renders the frame after the
 * first tip has landed and stays there.
 */

type Tip = { amount: number; note: string }

const CHANNEL = {
  name: 'Mira Okafor',
  handle: '@miracodes',
  id: 'UC7f3kQm2rVxN8tLpW4aZy1Q',
  initials: 'MO',
}

const EARLIER: Array<Tip & { when: string }> = [
  { amount: 10, note: 'Thanks for the deep dive', when: 'yesterday' },
  { amount: 1, note: '', when: '3 days ago' },
]

const TIPS: Tip[] = [
  { amount: 5, note: 'This fixed my build at 2am' },
  { amount: 1, note: '' },
  { amount: 10, note: 'For the next video' },
  { amount: 25, note: 'Saved me a week, honestly' },
]

const PRESETS = [1, 5, 10, 25]

type Phase = 'idle' | 'compose' | 'sending' | 'sent'

/** ms from the start of a cycle at which each phase begins. */
const AT = { compose: 1300, sending: 2900, sent: 3900, next: 7200 }

const usd = (n: number) => n.toFixed(2)

export function TipStage({ className }: { className?: string }) {
  const reduced = useReducedMotion()
  const [ref, visible] = useInView<HTMLDivElement>({ threshold: 0.2, rootMargin: '0px', once: false })
  const [sent, setSent] = useState(1)
  const [phase, setPhase] = useState<Phase>('sent')
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (reduced || !visible) return
    const clear = () => timers.current.splice(0).forEach((t) => window.clearTimeout(t))
    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))

    function cycle() {
      setPhase('idle')
      later(AT.compose, () => setPhase('compose'))
      later(AT.sending, () => setPhase('sending'))
      later(AT.sent, () => {
        setPhase('sent')
        setSent((n) => (n >= 12 ? 1 : n + 1))
      })
      later(AT.next, cycle)
    }
    // Resume from the landed frame the server rendered, then start over.
    later(2400, cycle)
    return clear
  }, [reduced, visible])

  // The tip in the composer is the one about to land.
  const pending = TIPS[sent % TIPS.length]
  const shownTip = phase === 'sent' ? TIPS[(sent - 1) % TIPS.length] : pending

  const landed = Array.from({ length: sent }, (_, i) => ({
    ...TIPS[i % TIPS.length],
    key: i,
    when: i === sent - 1 ? 'just now' : '1 min ago',
  })).reverse()
  const rows = [...landed, ...EARLIER.map((tip, i) => ({ ...tip, key: -1 - i }))].slice(0, 3)
  const total = [...landed, ...EARLIER].reduce((sum, tip) => sum + tip.amount, 0)

  return (
    <div
      ref={ref}
      className={cx('panel-atmos relative rounded-panel bg-surface p-4 sm:p-6', className)}
      role="img"
      aria-label={`A tip of ${usd(shownTip.amount)} USDC sent from the gift button beside Like lands in escrow for ${CHANNEL.handle}, a channel that is not on Tipee yet. ${usd(total)} USDC is held for it.`}
    >
      <div className="field" aria-hidden />
      <div aria-hidden className="flex flex-col gap-4">
        <WatchBar phase={phase} />
        <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
          <Composer phase={phase} amount={shownTip.amount} className="hidden sm:flex" />
          <Ledger rows={rows} total={total} newestKey={phase === 'sent' ? sent - 1 : -99} />
        </div>
      </div>
    </div>
  )
}

/* ── The watch page, below the player ───────────────────────────────────── */

function WatchBar({ phase }: { phase: Phase }) {
  const pressed = phase === 'compose' || phase === 'sending'
  return (
    <div className="rounded-tile bg-tile p-4 shadow-card sm:p-5">
      <div className="flex items-center gap-2 text-[12px] text-fg-faint">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-fill-strong">
          <span className="block h-full w-[64%] rounded-full bg-fg-soft" />
        </span>
        <span className="font-mono tabular-nums">14:02 / 21:47</span>
      </div>
      <p className="mt-3 truncate text-[16px] font-semibold tracking-[-0.01em] sm:text-[17px]">
        Fixing a race condition in nine minutes
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-semibold text-fg-soft">
            {CHANNEL.initials}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[14px] font-semibold">{CHANNEL.name}</span>
            <span className="truncate text-[12px] text-fg-mute">48.2K subscribers</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-9 items-center rounded-button bg-fill text-[13px] font-semibold">
            <span className="flex items-center gap-1.5 px-3">
              <ThumbIcon /> 3.1K
            </span>
            <span className="h-5 w-px bg-line-strong" />
            <span className="px-3">
              <ThumbIcon down />
            </span>
          </span>
          <span className="hidden h-9 items-center gap-1.5 rounded-button bg-fill px-3 text-[13px] font-semibold min-[420px]:flex">
            <ShareIcon /> Share
          </span>
          <span
            className={cx(
              'relative grid h-9 w-9 place-items-center rounded-full transition-colors duration-200',
              pressed ? 'bg-accent text-white' : 'bg-accent-soft text-on-accent-soft',
            )}
          >
            {phase === 'idle' ? <span className="gift-cue absolute inset-0 rounded-full" /> : null}
            <GiftGlyph className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── The extension's composer ───────────────────────────────────────────── */

function Composer({ phase, amount, className }: { phase: Phase; amount: number; className?: string }) {
  const open = phase !== 'idle'
  return (
    <div
      className={cx(
        'flex-col gap-3 rounded-tile bg-tile p-4 shadow-card transition-[opacity,transform] duration-[var(--dur-ui)] ease-out',
        open ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-40',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold tracking-[-0.02em]">tipee</span>
        <span className="font-mono text-[11px] text-fg-faint">{CHANNEL.handle}</span>
      </div>
      <p className="text-[19px] leading-tight font-semibold tracking-[-0.02em]">
        Send a little <em className="font-semibold">thanks</em>.
      </p>
      <div className="flex items-baseline justify-between rounded-input border border-line bg-panel px-3.5 py-2.5">
        <span className="font-mono text-[22px] font-medium tabular-nums">{usd(open ? amount : PRESETS[0])}</span>
        <span className="font-mono text-[12px] text-fg-mute">USDC</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {PRESETS.map((preset) => (
          <span
            key={preset}
            className={cx(
              'rounded-button py-1.5 text-center font-mono text-[12px] transition-colors duration-200',
              open && preset === amount ? 'bg-fg text-on-action' : 'bg-fill text-fg-soft',
            )}
          >
            ${preset}
          </span>
        ))}
      </div>
      <div
        className={cx(
          'flex h-10 items-center justify-center gap-2 rounded-button text-[13px] font-semibold transition-colors duration-200',
          phase === 'sent' ? 'bg-accent-soft text-on-accent-soft' : 'bg-accent text-white',
        )}
      >
        {phase === 'sending' ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> Sending
          </>
        ) : phase === 'sent' ? (
          <>
            <CheckIcon /> Sent {usd(amount)} USDC
          </>
        ) : (
          'Continue'
        )}
      </div>
    </div>
  )
}

/* ── The escrow, as the creator would find it ───────────────────────────── */

function Ledger({
  rows,
  total,
  newestKey,
}: {
  rows: Array<Tip & { when: string; key: number }>
  total: number
  newestKey: number
}) {
  const shown = useCountTo(total)
  return (
    <div className="flex flex-col rounded-tile bg-tile p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="t-label whitespace-nowrap">In escrow</span>
        <span className="rounded-chip bg-fill px-2 py-0.5 text-[11px] whitespace-nowrap text-fg-mute">not on Tipee yet</span>
      </div>
      <p className="mt-2 text-[15px] font-semibold">{CHANNEL.handle}</p>
      <p className="truncate font-mono text-[11px] text-fg-faint">channel {CHANNEL.id}</p>
      <p className="mt-3 font-mono text-[34px] leading-none font-medium tracking-[-0.03em] text-accent tabular-nums">
        {usd(shown)}
        <span className="ml-1.5 text-[13px] tracking-normal text-fg-mute">USDC</span>
      </p>
      <ul className="mt-4 flex flex-col border-t border-line">
        {rows.map((row) => (
          <li
            key={row.key}
            className={cx(
              'flex items-center gap-3 border-b border-line py-2 text-[12.5px] last:border-b-0',
              row.key === newestKey && 'ledger-in',
            )}
          >
            <span className="w-12 shrink-0 font-mono text-accent tabular-nums">+{usd(row.amount)}</span>
            <span className="min-w-0 flex-1 truncate text-fg-soft">{row.note || 'No note'}</span>
            <span className="shrink-0 text-fg-faint">{row.when}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function useCountTo(target: number) {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = performance.now()
    const begin = from.current
    if (begin === target) return
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = begin + (target - begin) * eased
      setValue(next)
      from.current = next
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return value
}

/* ── Icons: 1.5 stroke, drawn for this page ─────────────────────────────── */

function ThumbIcon({ down }: { down?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx('h-[17px] w-[17px]', down && 'rotate-180')}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      <path d="M7 10v10H4V10h3Zm0 0 4-7c1.3 0 2.2 1.1 2 2.4L12.5 9H19a2 2 0 0 1 2 2.3l-1.2 6.8A2.3 2.3 0 0 1 17.5 20H7" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
      <path d="M14 5l7 7-7 7v-4c-5 0-8 1.5-11 5 1-5 4-10 11-11V5Z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}
