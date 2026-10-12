'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useState } from 'react'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { explorerTxUrl, isStellarAddress, parseChannelRef } from '@tipee/shared'

import {
  ApiError,
  claim,
  confirmVerification,
  payOut,
  registerPasskey,
  resolveChannel,
  signInWithPasskey,
  startVerification,
} from '@/lib/api'
import { Button, cx } from './primitives'
import { toast } from './states'

/**
 * Claiming a channel's tips, in the order it happens:
 *
 *   1. find the channel     the escrow balance under its ID, read live
 *   2. prove it is yours    a one-hour code in the channel description
 *   3. say where to pay     any Stellar address, account or contract, saved
 *                           with a passkey so the next payout needs no code
 *   4. receipt              net, fee, and the transaction on the explorer
 *
 * Nothing here holds a secret. The code is useless to anyone who cannot edit
 * the channel, and the claim itself is signed by Tipee's verifier key on the
 * server, which the escrow contract requires for every payout.
 */
type Step =
  | { name: 'find' }
  | { name: 'found'; handle: string; displayName: string; balance: string; hasAccount: boolean }
  | { name: 'prove'; handle: string; displayName: string; token: string }
  | { name: 'pay'; handle: string; displayName: string; token: string; balance: string }
  | { name: 'done'; handle: string; net: string; fee: string; gross: string; txHash: string; to: string }

const STEPS = ['Find your channel', 'Prove it’s yours', 'Get paid'] as const

export function ClaimFlow() {
  const [step, setStep] = useState<Step>({ name: 'find' })
  const [handle, setHandle] = useState('')
  const [destination, setDestination] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [passkeys, setPasskeys] = useState(false)
  const router = useRouter()
  const handleId = useId()
  const destId = useId()

  // Arriving from the homepage lookup carries the handle along.
  useEffect(() => {
    setPasskeys(browserSupportsWebAuthn())
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
      setProblem(error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function find(raw: string) {
    return run(async () => {
      const ref = parseChannelRef(raw)
      if (!ref || ref.kind !== 'handle') throw new Error('Enter your channel handle, like @yourchannel.')
      const found = await resolveChannel(ref.handle)
      setStep({
        name: 'found',
        handle: found.handle,
        displayName: found.display_name,
        balance: found.unclaimed_balance,
        hasAccount: Boolean(found.has_account),
      })
    })
  }

  function prove(current: Extract<Step, { name: 'found' }>) {
    return run(async () => {
      const issued = await startVerification(current.handle)
      setStep({ name: 'prove', handle: current.handle, displayName: current.displayName, token: issued.token })
    })
  }

  function check(current: Extract<Step, { name: 'prove' }>) {
    return run(async () => {
      const confirmed = await confirmVerification(current.token)
      setStep({ ...current, name: 'pay', balance: confirmed.unclaimed_balance })
      toast.success(`Verified ${current.handle}`)
    })
  }

  function pay(current: Extract<Step, { name: 'pay' }>) {
    return run(async () => {
      const to = destination.trim()
      if (!isStellarAddress(to)) throw new Error('That isn’t a Stellar wallet address. It starts with G or C and is 56 characters long.')
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
      toast.success(`Claimed ${paid.amount_net} USDC`)
    })
  }

  function signIn() {
    return run(async () => {
      await signInWithPasskey()
      router.push('/dashboard')
    })
  }

  /** Saves the payout address behind a new passkey, pays out what is waiting, and opens the dashboard. */
  function saveAndClaim(current: Extract<Step, { name: 'pay' }>) {
    return run(async () => {
      const to = destination.trim()
      if (!isStellarAddress(to)) throw new Error('That isn’t a Stellar wallet address. It starts with G or C and is 56 characters long.')
      await registerPasskey(current.token, to)
      if (Number(current.balance) > 0) {
        const paid = await payOut()
        toast.success(`Paid ${paid.amount_net} USDC to your wallet`)
      } else {
        toast.success('Your passkey is set up')
      }
      router.push('/dashboard')
    })
  }

  const at = step.name === 'find' || step.name === 'found' ? 0 : step.name === 'prove' ? 1 : 2

  return (
    <div className="flex w-full flex-col gap-6">
      <ol className="grid grid-cols-3 gap-2" aria-label="Progress">
        {STEPS.map((label, index) => {
          const done = index < at || step.name === 'done'
          return (
            <li
              key={label}
              aria-current={index === at && step.name !== 'done' ? 'step' : undefined}
              className={cx('flex flex-col gap-2 border-t-2 pt-3', done ? 'border-accent' : index === at ? 'border-fg' : 'border-line-strong')}
            >
              <span className="font-mono text-[12px] text-fg-faint">0{index + 1}</span>
              <span className={cx('text-[14px] font-semibold', index > at && step.name !== 'done' && 'text-fg-faint')}>{label}</span>
            </li>
          )
        })}
      </ol>

      <div className="rounded-panel bg-tile p-6 shadow-card sm:p-8">
        {step.name === 'find' && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void find(handle)
            }}
          >
            <label htmlFor={handleId} className="t-title">
              Which channel is yours?
            </label>
            <p className="t-small -mt-2 text-fg-mute">Your handle, or your channel’s URL. We’ll show you what’s waiting.</p>
            <input
              id={handleId}
              className="field-input font-mono"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="@yourchannel"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={problem ? true : undefined}
            />
            <Button type="submit" size="lg" busy={busy} className="w-full sm:w-fit">
              Find my tips
            </Button>
          </form>
        )}

        {step.name === 'found' && (
          <div className="flex flex-col gap-5">
            <Amount label={`Waiting for ${step.handle}`} value={step.balance} />
            {step.hasAccount ? (
              <p className="t-small text-fg-mute">
                {step.displayName} already has a Tipee account. Sign in with your passkey to pay this out, no code needed.
              </p>
            ) : (
              <p className="t-small text-fg-mute">
                Tips from {step.displayName}’s viewers, held safely until the owner claims them. Prove the channel is
                yours once, and next time a passkey is all it takes.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {step.hasAccount && passkeys ? (
                <>
                  <Button size="lg" busy={busy} onClick={() => void signIn()}>
                    Sign in with passkey
                  </Button>
                  <Button variant="text" size="lg" onClick={() => void prove(step)}>
                    Lost your passkey? Verify again
                  </Button>
                </>
              ) : (
                <Button size="lg" busy={busy} onClick={() => void prove(step)}>
                  Verify this channel
                </Button>
              )}
              <Button variant="text" size="lg" onClick={() => setStep({ name: 'find' })}>
                Not my channel
              </Button>
            </div>
          </div>
        )}

        {step.name === 'prove' && (
          <div className="flex flex-col gap-5">
            <p className="t-title">Put this code in your channel description</p>
            <p className="t-small text-fg-mute">
              In YouTube Studio, open Customization, then Basic info, and paste it anywhere in the description of{' '}
              {step.handle}. Save, then come back and check. The code works for one hour, and you can delete it once you
              have claimed.
            </p>
            <div className="flex flex-col gap-3 rounded-tile bg-surface p-4 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 font-mono text-[18px] font-medium break-all">{step.token}</code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard
                    .writeText(step.token)
                    .then(() => toast.success('Code copied'))
                    .catch(() => toast.error('Could not copy. Select the code and copy it instead.'))
                }}
              >
                Copy code
              </Button>
            </div>
            <Button size="lg" busy={busy} onClick={() => void check(step)} className="w-full sm:w-fit">
              I’ve added it, check now
            </Button>
          </div>
        )}

        {step.name === 'pay' && (
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              void pay(step)
            }}
          >
            <Amount label={`Verified · ${step.handle}`} value={step.balance} />
            <div className="flex flex-col gap-2">
              <label htmlFor={destId} className="text-[15px] font-semibold">
                Pay it to
              </label>
              <input
                id={destId}
                className="field-input font-mono text-[13.5px]"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="G… or C…"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={problem ? true : undefined}
              />
              <p className="t-small text-fg-mute">
                Any Stellar wallet that can hold USDC, including your own Tipee wallet. Tipee keeps 4% now, and took
                nothing on the way in.
              </p>
            </div>
            {passkeys ? (
              <div className="flex flex-col gap-3">
                <Button size="lg" busy={busy} className="w-full sm:w-fit" onClick={() => void saveAndClaim(step)}>
                  {Number(step.balance) > 0 ? `Save with a passkey and claim ${step.balance} USDC` : 'Save with a passkey'}
                </Button>
                <p className="t-small text-fg-mute">
                  A passkey uses your fingerprint, face or screen lock. Next time you just sign in: no code, and payouts go
                  straight to this address.
                </p>
                {Number(step.balance) > 0 ? (
                  <button type="submit" disabled={busy} className="arrow-link w-fit text-fg-mute hover:text-fg">
                    Just claim this once, without a passkey
                  </button>
                ) : null}
              </div>
            ) : (
              <Button type="submit" size="lg" busy={busy} className="w-full sm:w-fit">
                Claim {step.balance} USDC
              </Button>
            )}
          </form>
        )}

        {step.name === 'done' && (
          <div className="flex flex-col gap-6">
            <Amount label={`Claimed · ${step.handle}`} value={step.net} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-line pt-5 text-[14px]">
              <dt className="text-fg-mute">Waiting for you</dt>
              <dd className="m-0 text-right font-mono tabular-nums">{step.gross}</dd>
              <dt className="text-fg-mute">Tipee fee, 4%</dt>
              <dd className="m-0 text-right font-mono tabular-nums">−{step.fee}</dd>
              <dt className="font-semibold">Paid to you</dt>
              <dd className="m-0 text-right font-mono font-medium tabular-nums">{step.net}</dd>
              <dt className="text-fg-mute">To</dt>
              <dd className="m-0 text-right font-mono text-[12px] break-all">{step.to}</dd>
            </dl>
            <Button href={explorerTxUrl(step.txHash)} variant="ghost" className="w-fit">
              See the receipt ↗
            </Button>
          </div>
        )}

        {problem && (
          <p role="alert" className="t-small mt-5 rounded-input bg-danger-soft px-4 py-3 text-fg">
            {problem}
          </p>
        )}
      </div>
    </div>
  )
}

function Amount({ label, value }: { label: string; value: string }) {
  const waiting = Number(value) > 0
  return (
    <div>
      <p className="t-label">{label}</p>
      <p
        className={cx(
          'mt-2 font-mono text-[clamp(40px,6vw,56px)] leading-none font-medium tracking-[-0.04em] tabular-nums',
          waiting ? 'text-accent' : 'text-fg-faint',
        )}
      >
        {value}
        <span className="ml-2 text-[15px] tracking-normal text-fg-mute">USDC</span>
      </p>
    </div>
  )
}
