'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { formatUsdc, parseChannelRef, parseUsdc } from '@tipee/shared'

import { resolveChannel } from './api'

/**
 * The hero lookup — step one of `/claim`, sitting on the landing page.
 *
 * Parsing runs through `@tipee/shared`'s `parseChannelRef`, the same function
 * the extension and the API use, so what the site accepts and what the backend
 * accepts cannot drift.
 *
 * The balance is live: the API resolves the handle against YouTube and reads
 * what the escrow contract holds under that channel ID on Stellar testnet. No
 * samples — a figure shown here is a figure on chain.
 */
type Result =
  | { state: 'balance'; handle: string; balance: bigint }
  | { state: 'zero'; handle: string }
  | { state: 'unparseable' }
  | { state: 'error'; message: string }

export function ChannelLookup({
  autoFocus = false,
  size = 'lg',
}: {
  autoFocus?: boolean
  size?: 'md' | 'lg'
}) {
  const [value, setValue] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const inputId = useId()
  const large = size === 'lg'

  async function lookUp(event: React.FormEvent) {
    event.preventDefault()
    const ref = parseChannelRef(value)
    // The API resolves handles; a channel URL or ID is shown the claim page,
    // which asks for the handle it needs.
    if (!ref || ref.kind !== 'handle') {
      setResult({ state: 'unparseable' })
      return
    }

    setBusy(true)
    try {
      const found = await resolveChannel(ref.handle)
      const balance = parseUsdc(found.unclaimed_balance)
      setResult(
        balance > 0n ? { state: 'balance', handle: found.handle, balance } : { state: 'zero', handle: found.handle },
      )
    } catch (error) {
      setResult({ state: 'error', message: error instanceof Error ? error.message : 'Could not look that up.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <form onSubmit={lookUp} className="w-full">
        <label htmlFor={inputId} className="sr-only">
          Your YouTube channel
        </label>

        {/* One pill holding both halves. A separate input and button read as a
            form; this reads as a search, which is what it is. */}
        <div
          className={`flex flex-col gap-2 rounded-lg border border-rule bg-card p-2 shadow-lift transition-colors focus-within:border-forest sm:flex-row sm:items-center sm:rounded-pill ${
            large ? 'sm:p-2.5' : 'sm:p-2'
          }`}
        >
          <input
            id={inputId}
            name="channel"
            autoFocus={autoFocus}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="youtube.com/@yourhandle"
            spellCheck={false}
            autoComplete="off"
            enterKeyHint="search"
            className={`min-w-0 flex-1 rounded-pill border-0 bg-transparent px-4 font-mono text-ink outline-none placeholder:text-faint ${
              large ? 'py-3 text-[15px]' : 'py-2.5 text-[14px]'
            }`}
          />
          <button
            type="submit"
            disabled={busy}
            className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-pill bg-forest font-bold text-on-forest transition-all duration-200 hover:bg-deep disabled:opacity-60 ${
              large ? 'px-7 py-3.5 text-[15px]' : 'px-6 py-3 text-[14px]'
            }`}
          >
            {busy ? 'Checking…' : 'Check'}
          </button>
        </div>
      </form>

      {/* Without this, every first-time visitor sees the zero state and never
          learns what a hit looks like. */}
      {!result && (
        <p className="m-0 text-[13px] text-muted">
          Nothing to sign up for. Any channel works — the balance is read live from the escrow
          contract on Stellar testnet.
        </p>
      )}

      <div aria-live="polite" className="contents">
        {result?.state === 'balance' && (
          <div className="bracket">
            <div className="flex flex-col gap-2 rounded-md bg-mint p-6 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[11.5px] tracking-[0.12em] text-deep uppercase">
                  Waiting for {result.handle}
                </span>
                <span className="rounded-pill bg-deep/10 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-deep">
                  Live · Stellar testnet
                </span>
              </div>
              <span className="text-[clamp(2.4rem,7vw,3.4rem)] leading-none font-extrabold tabular-nums text-deep">
                ${formatUsdc(result.balance)}
              </span>
              <span className="text-[14px] text-deep/75">
                in escrow · yours once you verify the channel
              </span>
              <Link
                href={`/claim?handle=${encodeURIComponent(result.handle)}`}
                className="mt-2 inline-flex w-fit items-center gap-2 rounded-pill bg-forest px-5 py-2.5 text-[14px] font-bold text-on-forest no-underline transition-colors hover:bg-deep"
              >
                Claim it →
              </Link>
            </div>
          </div>
        )}

        {/* The common outcome, and the one that has to do real work: a dead end
            here is most of the traffic bouncing. */}
        {result?.state === 'zero' && (
          <div className="flex flex-col gap-3 rounded-lg border border-rule bg-card p-6 shadow-soft sm:p-7">
            <span className="text-[19px] font-bold tracking-[-0.02em]">
              Nothing yet — but {result.handle} is ready for it.
            </span>
            <p className="m-0 text-[14px] leading-relaxed text-muted">
              No tips are waiting for this channel. There is nothing for you to sign up for: the
              moment someone tips it, the money is held in the escrow contract under your channel ID
              until you come and get it.
            </p>
            <p className="m-0 text-[14px] leading-relaxed text-muted">
              The fastest way to change that is to let your viewers know the button exists.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Link
                href="/install"
                className="inline-flex items-center rounded-pill bg-forest px-5 py-2.5 text-[14px] font-bold text-on-forest no-underline transition-colors hover:bg-deep"
              >
                Get the extension
              </Link>
              <Link
                href="/viewers"
                className="inline-flex items-center rounded-pill border border-rule bg-card px-5 py-2.5 text-[14px] font-semibold text-ink no-underline transition-colors hover:border-forest hover:text-forest"
              >
                Send your viewers here
              </Link>
            </div>
          </div>
        )}

        {result?.state === 'error' && (
          <p className="m-0 text-[13.5px] text-danger">{result.message}</p>
        )}

        {result?.state === 'unparseable' && (
          <p className="m-0 flex flex-wrap items-center gap-1.5 text-[13.5px] text-danger">
            That does not look like a handle. Try your channel URL — something like
            <code className="rounded-sm bg-card px-2 py-0.5 font-mono text-[12.5px]">
              youtube.com/@yourhandle
            </code>
            — or just the handle on its own.
          </p>
        )}
      </div>
    </div>
  )
}
