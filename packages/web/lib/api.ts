import type {
  ClaimResponse,
  ResolveCreatorResponse,
  VerifyConfirmResponse,
  VerifyInitResponse,
} from '@tipee/shared'

/**
 * The Tipee API, from the browser. Set at build time with
 * `NEXT_PUBLIC_TIPEE_API`; every call here is public or proven on chain, so
 * nothing secret ever passes through the site.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_TIPEE_API ?? 'http://localhost:3000').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      },
    })
  } catch {
    throw new ApiError('unreachable', 'Could not reach Tipee. Check your connection and try again.')
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: string; message?: string }) | null
  if (!response.ok || !body) {
    throw new ApiError(body?.error ?? 'error', body?.message ?? 'Tipee could not do that just now.')
  }
  return body
}

export function resolveChannel(handle: string): Promise<ResolveCreatorResponse> {
  return call(`/api/creators/resolve?handle=${encodeURIComponent(handle)}`)
}

export function startVerification(
  handle: string,
): Promise<VerifyInitResponse & { channel_id: string; display_name: string }> {
  return call('/api/creators/verify/init', { method: 'POST', body: JSON.stringify({ handle }) })
}

export function confirmVerification(token: string): Promise<VerifyConfirmResponse & { unclaimed_balance: string }> {
  return call('/api/creators/verify/confirm', { method: 'POST', body: JSON.stringify({ token }) })
}

export function claim(token: string, destination: string): Promise<ClaimResponse> {
  return call('/api/creators/claim', {
    method: 'POST',
    body: JSON.stringify({ token, destination_address: destination }),
  })
}

/* Creator accounts ------------------------------------------------------------ */

const SESSION_KEY = 'tipee.session'

/** The signed-in creator's session, kept in this browser only. */
export function savedSession(): string | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const { token, expires_at } = JSON.parse(raw) as { token: string; expires_at: string }
    return new Date(expires_at).getTime() > Date.now() ? token : null
  } catch {
    return null
  }
}

export function saveSession(session: { session: string; expires_at: string }): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ token: session.session, expires_at: session.expires_at }))
  } catch {
    // Private windows can refuse storage; the creator just signs in again next time.
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY)
  } catch {
    // Nothing to clear.
  }
}

function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = savedSession()
  return call<T>(path, { ...init, headers: token ? { authorization: `Bearer ${token}` } : {} })
}

export interface SessionResponse {
  session: string
  expires_at: string
  channel_id: string
}

export interface ChannelEvent {
  kind: 'tip' | 'claim'
  tx_hash: string
  at: string | null
  amount?: string
  note?: string
  from?: string
  net?: string
  fee?: string
  to?: string
}

export interface Dashboard {
  channel: { channel_id: string; handle: string; display_name: string; avatar_url: string | null }
  payout_address: string
  balance: string
  lifetime: string
  claimed: string
  passkeys: number
  activity_unavailable: boolean
  activity_partial: boolean
  activity: ChannelEvent[]
}

export interface PayoutResponse {
  tx_hash: string
  amount_gross: string
  platform_fee: string
  amount_net: string
  to: string
}

/** Creates a passkey for a channel just verified with its code, and saves where to pay. */
export async function registerPasskey(token: string, payoutAddress: string): Promise<SessionResponse> {
  const { startRegistration } = await import('@simplewebauthn/browser')
  const { challenge_id, options } = await call<{ challenge_id: string; options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>(
    '/api/accounts/register/options',
    { method: 'POST', body: JSON.stringify({ token }) },
  )
  const response = await startRegistration({ optionsJSON: options }).catch(() => {
    throw new ApiError('passkey_cancelled', 'The passkey was not created. Try again when you are ready.')
  })
  const session = await call<SessionResponse>('/api/accounts/register/verify', {
    method: 'POST',
    body: JSON.stringify({ challenge_id, response, payout_address: payoutAddress }),
  })
  saveSession(session)
  return session
}

export async function signInWithPasskey(): Promise<SessionResponse> {
  const { startAuthentication } = await import('@simplewebauthn/browser')
  const { challenge_id, options } = await call<{ challenge_id: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>(
    '/api/accounts/signin/options',
    { method: 'POST', body: JSON.stringify({}) },
  )
  const response = await startAuthentication({ optionsJSON: options }).catch(() => {
    throw new ApiError('passkey_cancelled', 'Sign-in was cancelled. Try again when you are ready.')
  })
  const session = await call<SessionResponse>('/api/accounts/signin/verify', {
    method: 'POST',
    body: JSON.stringify({ challenge_id, response }),
  })
  saveSession(session)
  return session
}

export function dashboard(): Promise<Dashboard> {
  return authed('/api/accounts/me')
}

export function payOut(): Promise<PayoutResponse> {
  return authed('/api/accounts/me/payout', { method: 'POST', body: JSON.stringify({}) })
}

export function changePayoutAddress(address: string): Promise<{ payout_address: string }> {
  return authed('/api/accounts/me/payout-address', { method: 'POST', body: JSON.stringify({ address }) })
}
