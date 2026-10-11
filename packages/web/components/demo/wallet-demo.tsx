'use client'

import { formatUsdc } from '@tipee/shared'

import { PopupFrame } from './frame'
import { useDemoTimeline, type DemoStep } from './use-demo-timeline'

/**
 * The wallet, cycling through its three screens.
 *
 * A gifter's objection is never "how do I click a button" — it is "where is my
 * money and who can touch it". So this demo shows custody rather than flow:
 * a balance with a real address on it, an activity list that names who was
 * tipped, and a deposit QR. Three screens, no interaction implied.
 *
 * Amounts and addresses are fictional but shaped exactly like real ones,
 * because a balance of "$1,234.56" on a testnet product is a small lie that
 * costs more trust than it buys.
 */
const STEPS = [
  { name: 'home', ms: 3200 },
  { name: 'activity', ms: 3400 },
  { name: 'deposit', ms: 3000 },
] as const satisfies readonly DemoStep<string>[]

type Step = (typeof STEPS)[number]['name']

const BALANCE = 42_180_000n
const ADDRESS = '0x7a3f…c41e'

const ACTIVITY = [
  { label: 'Tipped @pixelforge', amount: -5_000_000n, age: '3h ago' },
  { label: 'Tipped @northbound', amount: -1_000_000n, age: '1d ago' },
  { label: 'Deposit', amount: 50_000_000n, age: '2d ago' },
]

const SCREENS: { name: Step; label: string }[] = [
  { name: 'home', label: 'Balance' },
  { name: 'activity', label: 'Activity' },
  { name: 'deposit', label: 'Deposit' },
]

export function WalletDemo({ className = '' }: { className?: string }) {
  const demo = useDemoTimeline<Step>(STEPS, { staticStep: 'home', threshold: 0.3 })

  return (
    <div
      ref={demo.ref}
      className={`flex flex-col items-center gap-5 ${className}`}
      role="img"
      aria-label="The Tipee wallet popup, cycling through its balance, activity and deposit screens."
    >
      <PopupFrame className="w-[268px]">
        <div className="flex min-h-[318px] flex-col gap-3 p-4 font-mono">
          {/* Top bar — constant across screens, like the real popup. */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold tracking-[-0.02em] text-[#121a0f]">
              tipee
            </span>
            <span className="rounded-pill bg-white px-2 py-0.5 text-[9px] text-[#55634e]">
              Arc testnet
            </span>
          </div>

          {demo.step === 'home' && <HomeScreen />}
          {demo.step === 'activity' && <ActivityScreen />}
          {demo.step === 'deposit' && <DepositScreen />}
        </div>
      </PopupFrame>

      {/* Which screen is showing — also the only affordance, so a reader who
          wants a particular one does not have to wait for the loop. */}
      <div className="flex gap-2" role="tablist" aria-label="Wallet screen">
        {SCREENS.map((screen) => {
          const active = demo.step === screen.name
          return (
            <button
              key={screen.name}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => demo.goTo(screen.name)}
              className={`rounded-pill border px-3.5 py-1.5 text-[11.5px] font-medium transition-colors ${
                active
                  ? 'border-forest bg-forest text-on-forest'
                  : 'border-rule bg-card text-muted hover:border-forest hover:text-forest'
              }`}
            >
              {screen.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function HomeScreen() {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-sm border border-[#e2e6dd] bg-white p-4">
        <span className="text-[9.5px] uppercase tracking-[0.12em] text-[#8b9784]">Balance</span>
        <span className="text-[30px] leading-none font-semibold tabular-nums text-[#121a0f]">
          ${formatUsdc(BALANCE)}
        </span>
        <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-pill bg-[#f5f7f2] px-2 py-1 text-[9.5px] text-[#55634e]">
          {ADDRESS}
          <CopyGlyph />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <span className="rounded-sm bg-[#2f6a1f] py-2.5 text-center text-[11px] font-semibold text-[#f2f4f2]">
          Deposit
        </span>
        <span className="rounded-sm border border-[#e2e6dd] bg-white py-2.5 text-center text-[11px] font-semibold text-[#121a0f]">
          Withdraw
        </span>
      </div>

      <div className="mt-auto rounded-sm border border-[#e2e6dd] bg-[#f5f7f2] p-3">
        <p className="m-0 text-[9.5px] leading-relaxed text-[#55634e]">
          Your recovery phrase is the only copy of this key. It never leaves this browser.
        </p>
      </div>
    </div>
  )
}

function ActivityScreen() {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] uppercase tracking-[0.12em] text-[#8b9784]">Activity</span>
        <span className="text-[9px] text-[#8b9784]">last ~22h</span>
      </div>

      <div className="flex flex-col overflow-hidden rounded-sm border border-[#e2e6dd] bg-white">
        {ACTIVITY.map((row, index) => (
          <div
            key={row.label}
            className={`flex items-center justify-between gap-2 px-3 py-2.5 ${
              index < ACTIVITY.length - 1 ? 'border-b border-[#e2e6dd]' : ''
            }`}
          >
            <div className="min-w-0">
              <p className="m-0 truncate text-[10.5px] font-medium text-[#121a0f]">{row.label}</p>
              <p className="m-0 text-[9px] text-[#8b9784]">{row.age}</p>
            </div>
            <span
              className={`shrink-0 text-[11px] font-semibold tabular-nums ${
                row.amount > 0n ? 'text-[#2f6a1f]' : 'text-[#55634e]'
              }`}
            >
              {row.amount > 0n ? '+' : '−'}${formatUsdc(row.amount < 0n ? -row.amount : row.amount)}
            </span>
          </div>
        ))}
      </div>

      {/* The real popup says which source answered, because an out-of-range tip
          and a tip that never happened otherwise look identical. */}
      <p className="m-0 mt-auto text-[9px] leading-relaxed text-[#8b9784]">
        Read from the Arc explorer. Outgoing tips are named from a local journal —
        the chain only knows the address.
      </p>
    </div>
  )
}

function DepositScreen() {
  return (
    <div className="flex flex-1 flex-col items-center gap-3">
      <span className="self-start text-[9.5px] uppercase tracking-[0.12em] text-[#8b9784]">
        Deposit USDC
      </span>
      <div className="rounded-sm border border-[#e2e6dd] bg-white p-3">
        <QrGlyph />
      </div>
      <span className="rounded-pill bg-[#f5f7f2] px-2.5 py-1 text-[9.5px] text-[#55634e]">
        {ADDRESS}
      </span>
      <p className="m-0 mt-auto text-center text-[9px] leading-relaxed text-[#8b9784]">
        USDC on Arc testnet only. Sending another asset or another network loses it.
      </p>
    </div>
  )
}

/** A QR silhouette. Drawn, not encoded — an encoded one would be a live address. */
function QrGlyph() {
  const cells = [
    '1111111011011111111',
    '1000001000101000001',
    '1011101011101011101',
    '1011101000101011101',
    '1011101101101011101',
    '1000001010101000001',
    '1111111010101111111',
    '0000000110100000000',
    '1101101011011010110',
    '0100011000100101001',
    '1110110110111011011',
    '0101001011000100100',
    '1011110101101110111',
    '0000000100110101001',
    '1111111011010110110',
    '1000001001101001011',
    '1011101110110111010',
    '1011101010001010101',
    '1111111011011101101',
  ]

  return (
    <svg width="104" height="104" viewBox="0 0 19 19" shapeRendering="crispEdges" aria-hidden="true">
      {cells.map((row, y) =>
        row
          .split('')
          .map((cell, x) =>
            cell === '1' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#121a0f" /> : null,
          ),
      )}
    </svg>
  )
}

function CopyGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2.4" />
      <path d="M16 5H5a2 2 0 0 0-2 2v11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
