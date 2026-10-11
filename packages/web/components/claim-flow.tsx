'use client'

import { useEffect, useId, useState } from 'react'
import { explorerTxUrl, isStellarAddress, parseChannelRef } from '@tipee/shared'

import { ApiError, claim, confirmVerification, resolveChannel, startVerification } from './api'

/**
 * Claiming a channel's tips, in the order it happens:
 *
 *   1. find the channel     — the escrow balance under its ID, read live
 *   2. prove it is yours    — a one-hour code in the channel description
 *   3. say where to pay     — any Stellar address, account or contract
 *   4. receipt              — net, fee, and the transaction on the explorer
 *
 * Nothing here holds a secret. The code is useless to anyone who cannot edit
 * the channel, and the claim itself is signed by Tipee's verifier key on the
 * server, which the escrow contract requires for every payout.
 */
type Step =
  | { name: 'find' }
  | { name: 'found'; handle: string; displayName: string; balance: string }
  | { name: 'prove'; handle: string; displayName: string; token: string; instruction: string }
  | { name: 'pay'; handle: string; displayName: string; token: string; balance: string }
  | { name: 'done'; handle: string; net: string; fee: string; gross: string; txHash: string; to: string }

export function ClaimFlow() {
  const [step, setStep] = useState<Step>({ name: 'find' })
  const [handle, setHandle] = useState('')
  const [destination, setDestination] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const handleId = useId()
  const destId = useId()

  // Arriving from the homepage lookup carries the handle along.
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('handle')
    if (fromQuery) {
      setHandle(fromQuery)
      void find(fromQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run(work: () => Promise<void>) {
    setBusy(true)
    setProblem(null)
    try {
      await work()
    } catch (error) {
      setProblem(error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function find(raw: string) {
    return run(async () => {
      const ref = parseChannelRef(raw)
      if (!ref || ref.kind !== 'handle') throw new Error('Enter your channel handle, like @yourchannel.')
      const found = await resolveChannel(ref.handle)
      setStep({ name: 'found', handle: found.handle, displayName: found.display_name, balance: found.unclaimed_balance })
    })
  }

  function prove(current: Extract<Step, { name: 'found' }>) {
    return run(async () => {
      const issued = await startVerification(current.handle)
      setStep({
        name: 'prove',
        handle: current.handle,
        displayName: current.displayName,
        token: issued.token,
        instruction: issued.instruction,
      })
    })
  }

  function check(current: Extract<Step, { name: 'prove' }>) {
    return run(async () => {
      const confirmed = await confirmVerification(current.token)
      setStep({
        name: 'pay',
        handle: current.handle,
        displayName: current.displayName,
        token: current.token,
        balance: confirmed.unclaimed_balance,
      })
    })
  }

  function pay(current: Extract<Step, { name: 'pay' }>) {
    return run(async () => {
      const to = destination.trim()
      if (!isStellarAddress(to)) throw new Error('Enter a Stellar address: G… for an account, C… for a contract wallet.')
      const paid = await claim(current.token, to)
      setStep({
        name: 'done',
        handle: current.handle,
        net: paid.amount_net,
        fee: paid.platform_fee,
        gross: paid.amount_gross,
        txHash: paid.tx_hash,
        to,
      })
    })
  }

  return (
    <div className="flex w-full max-w-[640px] flex-col gap-5">
      <Progress step={step.name} />

      {step.name === 'find' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void find(handle)
          }}
        >
          <label htmlFor={handleId} className="text-[14px] font-semibold">
            Your YouTube channel
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={handleId}
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="@yourchannel"
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-pill border border-rule bg-card px-5 py-3 font-mono text-[15px] outline-none focus:border-forest"
            />
            <button type="submit" disabled={busy} className={PRIMARY}>
              {busy ? 'Looking…' : 'Find my tips'}
            </button>
          </div>
        </form>
      )}

      {step.name === 'found' && (
        <Panel>
          <Kicker>Waiting for {step.handle}</Kicker>
          <Amount>${step.balance}</Amount>
          <p className="m-0 text-[14.5px] leading-relaxed text-muted">
            Held in the Tipee escrow contract under {step.displayName}’s channel ID. To release it, prove the
            channel is yours — it takes a minute and needs no account.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={PRIMARY} onClick={() => void prove(step)}>
              {busy ? 'One moment…' : 'Verify this channel'}
            </button>
            <button type="button" className={SECONDARY} onClick={() => setStep({ name: 'find' })}>
              Not my channel
            </button>
          </div>
        </Panel>
      )}

      {step.name === 'prove' && (
        <Panel>
          <Kicker>Prove it is yours</Kicker>
          <p className="m-0 text-[15px] leading-relaxed">
            Paste this code anywhere in the <strong>description</strong> of {step.handle} on YouTube (Studio →
            Customization → Basic info), save, then check. It works for one hour, and you can remove it once you
            have claimed.
          </p>
          <div className="flex flex-col gap-2 rounded-md border border-rule bg-card p-4 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 font-mono text-[17px] font-semibold break-all text-deep">{step.token}</code>
            <button
              type="button"
              className={SECONDARY}
              onClick={() => {
                void navigator.clipboard
                  .writeText(step.token)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false))
                window.setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" disabled={busy} className={PRIMARY} onClick={() => void check(step)}>
            {busy ? 'Checking YouTube…' : 'I have added it — check'}
          </button>
        </Panel>
      )}

      {step.name === 'pay' && (
        <Panel>
          <Kicker>Verified · {step.handle}</Kicker>
          <Amount>${step.balance}</Amount>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void pay(step)
            }}
          >
            <label htmlFor={destId} className="text-[14px] font-semibold">
              Pay it to
            </label>
            <input
              id={destId}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="G… or C…"
              spellCheck={false}
              autoComplete="off"
              className="rounded-pill border border-rule bg-card px-5 py-3 font-mono text-[13.5px] outline-none focus:border-forest"
            />
            <p className="m-0 text-[13px] leading-relaxed text-muted">
              Any Stellar address. An account (G…) needs a USDC trustline; a contract wallet (C…), such as your own
              Tipee wallet, does not. Tipee keeps 4% when you claim — nothing was taken on the way in.
            </p>
            <button type="submit" disabled={busy} className={PRIMARY}>
              {busy ? 'Claiming on Stellar…' : `Claim $${step.balance}`}
            </button>
          </form>
        </Panel>
      )}

      {step.name === 'done' && (
        <Panel>
          <Kicker>Claimed · {step.handle}</Kicker>
          <Amount>${step.net}</Amount>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[14px]">
            <dt className="text-muted">In escrow</dt>
            <dd className="m-0 text-right tabular-nums">${step.gross}</dd>
            <dt className="text-muted">Tipee fee (4%)</dt>
            <dd className="m-0 text-right tabular-nums">−${step.fee}</dd>
            <dt className="font-semibold">Paid to you</dt>
            <dd className="m-0 text-right font-semibold tabular-nums">${step.net}</dd>
            <dt className="text-muted">To</dt>
            <dd className="m-0 text-right font-mono text-[12px] break-all">{step.to}</dd>
          </dl>
          <a href={explorerTxUrl(step.txHash)} target="_blank" rel="noreferrer noopener" className={SECONDARY}>
            View the transaction on Stellar Expert →
          </a>
        </Panel>
      )}

      {problem && (
        <p role="alert" className="m-0 text-[14px] text-danger">
          {problem}
        </p>
      )}
    </div>
  )
}

const PRIMARY =
  'inline-flex w-fit items-center justify-center rounded-pill bg-forest px-6 py-3 text-[15px] font-bold text-on-forest transition-colors hover:bg-deep disabled:opacity-60'
const SECONDARY =
  'inline-flex w-fit items-center justify-center rounded-pill border border-rule bg-card px-5 py-2.5 text-[14px] font-semibold text-ink no-underline transition-colors hover:border-forest hover:text-forest'

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 rounded-lg border border-rule bg-card p-6 shadow-soft sm:p-7">{children}</div>
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11.5px] tracking-[0.12em] text-deep uppercase">{children}</span>
}

function Amount({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[clamp(2.4rem,7vw,3.4rem)] leading-none font-extrabold tabular-nums text-deep">{children}</span>
  )
}

const STEPS = ['Find', 'Verify', 'Claim'] as const

function Progress({ step }: { step: Step['name'] }) {
  const at = step === 'find' || step === 'found' ? 0 : step === 'prove' ? 1 : 2
  return (
    <ol className="m-0 flex list-none gap-2 p-0" aria-label="Progress">
      {STEPS.map((label, index) => (
        <li
          key={label}
          aria-current={index === at ? 'step' : undefined}
          className={`rounded-pill px-3 py-1 font-mono text-[11.5px] font-semibold ${
            index < at || step === 'done' ? 'bg-mint text-deep' : index === at ? 'bg-forest text-on-forest' : 'bg-card text-faint'
          }`}
        >
          {index + 1}. {label}
        </li>
      ))}
    </ol>
  )
}
