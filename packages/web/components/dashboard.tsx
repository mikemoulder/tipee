'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { explorerTxUrl, isStellarAddress } from '@tipee/shared'

import {
  ApiError,
  changePayoutAddress,
  clearSession,
  dashboard,
  payOut,
  savedSession,
  signInWithPasskey,
  type ChannelEvent,
  type Dashboard,
} from '@/lib/api'
import { ArrowLink, Button, Eyebrow, cx } from './primitives'
import { Skeleton, toast } from './states'

/**
 * The creator's home once their channel is verified: what is waiting, what
 * has come in, where it goes, and one button to pay it out. Every figure is
 * read from Stellar on load (GET /api/accounts/me); nothing here is cached.
 */
type View =
  | { state: 'checking' }
  | { state: 'signed-out' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: Dashboard }

export function CreatorDashboard() {
  const [view, setView] = useState<View>({ state: 'checking' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!savedSession()) {
      setView({ state: 'signed-out' })
      return
    }
    setView({ state: 'loading' })
    try {
      setView({ state: 'ready', data: await dashboard() })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'signed_out') {
        clearSession()
        setView({ state: 'signed-out' })
        return
      }
      setView({ state: 'error', message: error instanceof Error ? error.message : 'That did not load.' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function signIn() {
    setBusy(true)
    try {
      await signInWithPasskey()
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign-in did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (view.state === 'checking' || view.state === 'loading') return <DashboardSkeleton />
  if (view.state === 'signed-out') return <SignIn busy={busy} onSignIn={() => void signIn()} />
  if (view.state === 'error') {
    return (
      <div role="alert" className="mx-auto flex max-w-[520px] flex-col items-start gap-4 rounded-panel bg-danger-soft p-8">
        <p className="t-title">Your dashboard didn’t load</p>
        <p className="t-small text-fg-mute">{view.message}</p>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    )
  }
  return (
    <Ready
      data={view.data}
      onReload={() => void load()}
      onSignOut={() => {
        clearSession()
        setView({ state: 'signed-out' })
      }}
    />
  )
}

/* Signed out ------------------------------------------------------------------ */

function SignIn({ busy, onSignIn }: { busy: boolean; onSignIn: () => void }) {
  const [supported, setSupported] = useState(true)
  useEffect(() => setSupported(browserSupportsWebAuthn()), [])
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-start gap-6 rounded-panel bg-tile p-8 shadow-card sm:p-12">
      <Eyebrow>For creators</Eyebrow>
      <h1 className="t-display-l">Sign in to your channel.</h1>
      <p className="t-lead">
        Use the passkey you saved when you verified your channel. No password, no code in your description.
      </p>
      {supported ? (
        <Button size="lg" busy={busy} onClick={onSignIn}>
          Sign in with passkey
        </Button>
      ) : (
        <p className="t-small rounded-input bg-warning-soft px-4 py-3">
          This browser can’t use passkeys. Try a recent Chrome, Safari or Edge.
        </p>
      )}
      <p className="t-small text-fg-mute">
        Haven’t verified your channel yet? <ArrowLink href="/claim">Claim your tips</ArrowLink>
      </p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading your dashboard">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-48 w-full rounded-panel" />
      <p className="t-small text-fg-mute">Reading your channel from Stellar…</p>
    </div>
  )
}

/* Signed in ------------------------------------------------------------------- */

function Ready({ data, onReload, onSignOut }: { data: Dashboard; onReload: () => void; onSignOut: () => void }) {
  const [paying, setPaying] = useState(false)
  const waiting = Number(data.balance) > 0

  async function payNow() {
    setPaying(true)
    try {
      const paid = await payOut()
      toast.success(`Paid ${paid.amount_net} USDC to ${short(paid.to)}`, {
        action: { label: 'Receipt', onClick: () => window.open(explorerTxUrl(paid.tx_hash), '_blank', 'noopener') },
      })
      onReload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The payout did not go through.')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar src={data.channel.avatar_url} name={data.channel.display_name} />
          <div className="flex min-w-0 flex-col">
            <h1 className="t-display-m truncate">{data.channel.display_name}</h1>
            <p className="truncate font-mono text-[13px] text-fg-mute">{data.channel.handle}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onSignOut}>
          Sign out
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-6 rounded-panel bg-tile p-7 shadow-card sm:p-10 lg:col-span-7">
          <p className="t-label">Waiting for you</p>
          <p
            className={cx(
              'font-mono text-[clamp(48px,7vw,76px)] leading-none font-medium tracking-[-0.04em] tabular-nums',
              waiting ? 'text-accent' : 'text-fg-faint',
            )}
          >
            {data.balance}
            <span className="ml-2 text-[17px] tracking-normal text-fg-mute">USDC</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button size="lg" busy={paying} disabled={!waiting} onClick={() => void payNow()}>
              {waiting ? `Pay out ${data.balance} USDC` : 'Nothing to pay out yet'}
            </Button>
            <span className="t-small text-fg-mute">to {short(data.payout_address)} · Tipee keeps 4%</span>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4 lg:col-span-5 lg:grid-cols-1">
          <Stat label="Tipped to your channel, all time" value={data.lifetime} />
          <Stat label="Already paid out" value={data.claimed} />
        </dl>
      </div>

      <div className="grid gap-10 lg:grid-cols-12">
        <section className="lg:col-span-7" aria-labelledby="activity-title">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 id="activity-title" className="t-title">
              Recent activity
            </h2>
            <button type="button" onClick={onReload} className="arrow-link text-fg-mute hover:text-fg">
              Refresh
            </button>
          </div>
          <Activity data={data} />
        </section>
        <aside className="flex flex-col gap-4 lg:col-span-5">
          <PayoutAddress current={data.payout_address} onChanged={onReload} />
          <div className="rounded-tile bg-tile p-6 shadow-card">
            <p className="t-title">Grow it</p>
            <p className="t-small mt-2 text-fg-mute">
              Tell your viewers there’s a gift button beside Like. Anyone with the extension can tip you on any video.
            </p>
            <ArrowLink href="/install" className="mt-4">
              Share the extension
            </ArrowLink>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-between gap-6 rounded-tile bg-tile p-6 shadow-card">
      <dt className="t-small text-fg-mute">{label}</dt>
      <dd className="m-0 font-mono text-[32px] leading-none font-medium tracking-[-0.03em] tabular-nums">
        {value}
        <span className="ml-1.5 text-[13px] tracking-normal text-fg-mute">USDC</span>
      </dd>
    </div>
  )
}

function Activity({ data }: { data: Dashboard }) {
  if (data.activity_unavailable) {
    return (
      <p className="t-small rounded-tile bg-fill px-5 py-4 text-fg-mute">
        Stellar didn’t send the recent activity this time. Your totals above are up to date; refresh to try again.
      </p>
    )
  }
  if (data.activity.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-tile border border-dashed border-line-strong px-6 py-10">
        <p className="t-title">No tips in the last few days</p>
        <p className="t-small text-fg-mute">New tips show up here, with the note your viewer left.</p>
      </div>
    )
  }
  return (
    <>
      <ul className="overflow-hidden rounded-tile bg-tile shadow-card">
        {data.activity.map((event) => (
          <ActivityRow key={`${event.tx_hash}-${event.kind}`} event={event} />
        ))}
      </ul>
      {data.activity_partial ? <p className="t-small mt-3 text-fg-faint">Older activity may be missing.</p> : null}
    </>
  )
}

function ActivityRow({ event }: { event: ChannelEvent }) {
  const tip = event.kind === 'tip'
  return (
    <li className="border-b border-line last:border-b-0">
      <a
        href={explorerTxUrl(event.tx_hash)}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-4 px-5 py-4 text-fg no-underline transition-colors hover:bg-fill"
      >
        <span
          className={cx(
            'grid h-9 w-9 shrink-0 place-items-center rounded-full',
            tip ? 'bg-accent-soft text-on-accent-soft' : 'bg-fill text-fg-soft',
          )}
          aria-hidden
        >
          {tip ? '↓' : '↑'}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">
            {tip ? (event.note ? `“${event.note}”` : 'A tip, no note') : `Paid out to ${short(event.to ?? '')}`}
          </span>
          <span className="t-small truncate text-fg-faint">
            {when(event.at)}
            {tip ? ` · from ${short(event.from ?? '')}` : ` · Tipee fee ${event.fee}`}
          </span>
        </span>
        <span className={cx('shrink-0 font-mono text-[14px] tabular-nums', tip ? 'text-accent' : 'text-fg-soft')}>
          {tip ? `+${event.amount}` : `−${event.net}`}
        </span>
      </a>
    </li>
  )
}

function PayoutAddress({ current, onChanged }: { current: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(current)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const id = useId()

  async function save() {
    const address = value.trim()
    if (!isStellarAddress(address)) {
      setProblem('That isn’t a Stellar wallet address. It starts with G or C and is 56 characters long.')
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await changePayoutAddress(address)
      toast.success('Payout address saved')
      setEditing(false)
      onChanged()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-tile bg-tile p-6 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-title">Payouts go to</p>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} className="arrow-link text-fg-mute hover:text-fg">
            Change
          </button>
        ) : null}
      </div>
      {editing ? (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label htmlFor={id} className="sr-only">
            Stellar address for payouts
          </label>
          <input
            id={id}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="field-input font-mono text-[13px]"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={problem ? true : undefined}
          />
          {problem ? <p className="t-small text-danger">{problem}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" busy={busy}>
              Save
            </Button>
            <Button variant="text" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 font-mono text-[13px] break-all text-fg-soft">{current}</p>
      )}
    </div>
  )
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent-soft text-[20px] font-semibold text-on-accent-soft">
        {name.trim().slice(0, 1).toUpperCase() || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={56}
      height={56}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      className="h-14 w-14 shrink-0 rounded-full object-cover"
    />
  )
}

function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

function when(at: string | null): string {
  if (!at) return 'recently'
  const minutes = Math.round((Date.now() - new Date(at).getTime()) / 60_000)
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}
