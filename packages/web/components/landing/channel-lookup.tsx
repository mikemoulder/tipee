'use client'

import { useId, useState } from 'react'
import { formatUsdc, parseChannelRef, parseUsdc, type ResolveCreatorResponse } from '@tipee/shared'

import { ApiError, resolveChannel } from '@/lib/api'
import { ESCROW_URL, contractUrl } from '@/lib/site'
import { ArrowLink, Button, cx } from '../primitives'
import { Skeleton } from '../states'

/**
 * The creator beat: type a channel, read what the escrow contract holds for it.
 *
 * Live, not a sample. The API resolves the handle against YouTube and calls
 * `escrow.balance(channel_id)` on Stellar testnet; the figure shown is the
 * figure on chain. Parsing is `@tipee/shared`'s `parseChannelRef`, the same
 * function the extension and the API use.
 */
type Result =
  | { state: 'idle' }
  | { state: 'loading'; handle: string }
  | { state: 'found'; found: ResolveCreatorResponse; balance: bigint }
  | { state: 'unparseable' }
  | { state: 'error'; message: string; handle: string }

/** A channel with real testnet tips in escrow (16.50 USDC on 2026-10-12), so a first visit can see a hit. */
const SAMPLE = '@fireship'

export function ChannelLookup() {
  const [value, setValue] = useState('')
  const [result, setResult] = useState<Result>({ state: 'idle' })
  const inputId = useId()

  async function lookUp(raw: string) {
    const ref = parseChannelRef(raw)
    // The API resolves handles; a bare channel ID or URL without one cannot be looked up here.
    if (!ref || ref.kind !== 'handle') {
      setResult({ state: 'unparseable' })
      return
    }
    setResult({ state: 'loading', handle: ref.handle })
    try {
      const found = await resolveChannel(ref.handle)
      setResult({ state: 'found', found, balance: parseUsdc(found.unclaimed_balance) })
    } catch (error) {
      setResult({
        state: 'error',
        handle: ref.handle,
        message: error instanceof ApiError || error instanceof Error ? error.message : 'Could not look that up.',
      })
    }
  }

  const busy = result.state === 'loading'

  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col gap-5">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void lookUp(value)
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Your YouTube channel handle
        </label>
        <div className="flex flex-col gap-2 rounded-tile border border-line-strong bg-panel p-2 transition-colors focus-within:border-fg sm:flex-row sm:items-center sm:rounded-button">
          <input
            id={inputId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="@yourchannel or youtube.com/@yourchannel"
            spellCheck={false}
            autoComplete="off"
            enterKeyHint="search"
            aria-invalid={result.state === 'unparseable' || undefined}
            className="h-12 min-w-0 flex-1 bg-transparent px-4 font-mono text-[15px] text-fg outline-none placeholder:text-fg-faint"
          />
          <Button type="submit" size="lg" busy={busy}>
            Check balance
          </Button>
        </div>
      </form>

      <p className="text-center text-[13px] text-fg-mute">
        Or try{' '}
        <button
          type="button"
          onClick={() => {
            setValue(SAMPLE)
            void lookUp(SAMPLE)
          }}
          className="rounded-chip bg-fill px-2.5 py-0.5 font-mono text-[12.5px] text-fg-soft transition-colors hover:bg-fill-strong hover:text-fg"
        >
          {SAMPLE}
        </button>
        , which has test tips waiting from our own runs.
      </p>

      <div aria-live="polite" className="min-h-[1px] text-left">
        {result.state === 'loading' ? <LoadingCard handle={result.handle} /> : null}
        {result.state === 'found' ? <FoundCard found={result.found} balance={result.balance} /> : null}
        {result.state === 'unparseable' ? (
          <p role="alert" className="t-small rounded-tile bg-danger-soft px-5 py-4 text-fg">
            That doesn’t look like a channel handle. Try the part of your channel URL that starts with @, like{' '}
            <code className="font-mono">@yourchannel</code>.
          </p>
        ) : null}
        {result.state === 'error' ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-tile bg-danger-soft px-5 py-4 sm:flex-row sm:items-center">
            <p className="t-small flex-1 text-fg">{result.message}</p>
            <Button variant="ghost" size="sm" onClick={() => void lookUp(result.handle)}>
              Try again
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function LoadingCard({ handle }: { handle: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-tile bg-tile p-6 shadow-card" role="status">
      <span className="sr-only">Reading the escrow contract for {handle}</span>
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-10 w-48" />
      <p className="t-small text-fg-mute">Reading the escrow contract on Stellar testnet…</p>
    </div>
  )
}

function FoundCard({ found, balance }: { found: ResolveCreatorResponse; balance: bigint }) {
  const waiting = balance > 0n
  return (
    <div className="ledger-in flex flex-col gap-5 rounded-tile bg-tile p-6 shadow-card sm:p-7">
      <div className="flex items-center gap-3">
        <Avatar src={found.avatar_url} name={found.display_name} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[16px] font-semibold">{found.display_name}</span>
          <span className="truncate font-mono text-[12px] text-fg-faint">
            {found.handle} · {found.channel_id}
          </span>
        </div>
      </div>

      <div>
        <p className="t-label">{waiting ? 'Waiting in escrow' : 'In escrow'}</p>
        <p
          className={cx(
            'mt-2 font-mono text-[clamp(40px,6vw,56px)] leading-none font-medium tracking-[-0.04em] tabular-nums',
            waiting ? 'text-accent' : 'text-fg-faint',
          )}
        >
          {formatUsdc(balance)}
          <span className="ml-2 text-[15px] tracking-normal text-fg-mute">USDC</span>
        </p>
      </div>

      {waiting ? (
        <>
          <p className="t-small text-fg-mute">
            Held by the{' '}
            <a href={ESCROW_URL} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-4 hover:decoration-fg">
              escrow contract
            </a>{' '}
            under this channel’s ID. The owner can claim it in a few minutes, with no account.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button href={`/claim?handle=${encodeURIComponent(found.handle)}`}>Claim it</Button>
            <ArrowLink href={contractUrl(found.escrow_contract)}>
              See the contract
            </ArrowLink>
          </div>
        </>
      ) : (
        <>
          <p className="t-small text-fg-mute">
            Nothing yet, and nothing to set up either. The first tip anyone sends this channel will wait here, under its
            ID, until the owner claims it.
          </p>
          <ArrowLink href="/install">Send the first one</ArrowLink>
        </>
      )}
    </div>
  )
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const initial = name.trim().slice(0, 1).toUpperCase() || '?'
  if (!src || failed) {
    return (
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-[15px] font-semibold text-fg-soft">
        {initial}
      </span>
    )
  }
  return (
    // A remote YouTube avatar: next/image would need its host allow-listed for a 44px picture.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={44}
      height={44}
      onError={() => setFailed(true)}
      className="h-11 w-11 shrink-0 rounded-full object-cover"
      referrerPolicy="no-referrer"
    />
  )
}
