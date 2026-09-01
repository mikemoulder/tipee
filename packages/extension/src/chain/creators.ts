import type { ResolveCreatorResponse } from '@tipee/shared'
import { isAddress } from 'viem'

/** Where the backend lives. Absent until someone configures one. */
const API_BASE_KEY = 'tipee.apiBase.v1'

/**
 * Raised when the escrow wallet for a channel cannot be established.
 *
 * Every path here fails closed. The extension is not allowed to guess a
 * destination, fall back to a bundled address, or reuse the last one it saw:
 * the only thing worse than a tip that does not send is a tip that sends
 * somewhere unintended, and both failures look identical to the gifter until
 * the money is gone.
 */
export class EscrowUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EscrowUnavailableError'
  }
}

async function apiBase(): Promise<string | null> {
  const stored = await chrome.storage.local.get(API_BASE_KEY)
  const base = stored[API_BASE_KEY]
  return typeof base === 'string' && base !== '' ? base.replace(/\/+$/, '') : null
}

/**
 * Asks the backend which escrow wallet receives tips for a channel.
 *
 * The backend resolves this, not the extension: it establishes the channel id
 * server-side by fetching the channel page, because a client-supplied id could
 * be forged to point a tip at somebody else's escrow (idea.md §8). All this
 * side does is refuse anything that does not come back as a real address.
 */
export async function resolveEscrowAddress(handle: string): Promise<`0x${string}`> {
  const base = await apiBase()
  if (!base) {
    throw new EscrowUnavailableError('Tipee is not connected to a backend yet.')
  }

  let response: Response
  try {
    response = await fetch(`${base}/api/creators/resolve?handle=${encodeURIComponent(handle)}`)
  } catch {
    throw new EscrowUnavailableError('Could not reach Tipee to look up this creator.')
  }

  if (!response.ok) {
    throw new EscrowUnavailableError('Tipee could not find an escrow wallet for this channel.')
  }

  let body: unknown
  try {
    body = (await response.json()) as unknown
  } catch {
    throw new EscrowUnavailableError('Tipee sent back something unreadable.')
  }

  const address = (body as Partial<ResolveCreatorResponse> | null)?.wallet_address
  if (typeof address !== 'string' || !isAddress(address)) {
    throw new EscrowUnavailableError('Tipee sent back an invalid escrow address.')
  }

  return address as `0x${string}`
}
