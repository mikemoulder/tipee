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
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
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
