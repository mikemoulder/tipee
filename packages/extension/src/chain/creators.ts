import { formatUsdc, isValidChannelId, type RecordTipRequest, type ResolveCreatorResponse } from '@tipee/shared'
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

export async function apiBase(): Promise<string | null> {
  const stored = await chrome.storage.local.get(API_BASE_KEY)
  const base = stored[API_BASE_KEY]
  return typeof base === 'string' && base !== '' ? base.replace(/\/+$/, '') : null
}

/** Where Tipee's service lives. Settable, because it moves between local work and a deployment. */
export async function setApiBase(base: string): Promise<void> {
  await chrome.storage.local.set({ [API_BASE_KEY]: base.trim().replace(/\/+$/, '') })
}

/** The creator behind a handle, as the backend establishes them. */
export interface ResolvedCreator {
  channelId: string
  escrowAddress: `0x${string}`
  displayName: string
}

/**
 * Asks the backend which escrow wallet receives tips for a channel.
 *
 * The backend resolves this, not the extension: it establishes the channel id
 * server-side by fetching the channel page, because a client-supplied id could
 * be forged to point a tip at somebody else's escrow (idea.md §8). All this
 * side does is refuse anything that does not come back as a real address.
 */
export async function resolveCreator(handle: string): Promise<ResolvedCreator> {
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

  const resolved = body as Partial<ResolveCreatorResponse> | null
  const address = resolved?.wallet_address

  // Shape only, not checksum: Circle returns lowercase addresses, and a
  // checksum rule here would reject every escrow it ever created.
  if (typeof address !== 'string' || !isAddress(address, { strict: false })) {
    throw new EscrowUnavailableError('Tipee sent back an invalid escrow address.')
  }
  if (!isValidChannelId(resolved?.channel_id)) {
    throw new EscrowUnavailableError('Tipee sent back an unusable creator.')
  }

  return {
    channelId: resolved.channel_id as string,
    escrowAddress: address as `0x${string}`,
    displayName: typeof resolved?.display_name === 'string' ? resolved.display_name : handle,
  }
}

/**
 * Tells the backend a tip happened, once it has.
 *
 * Best effort on purpose. The transaction is already on Arc, which is the
 * record that decides what a creator is owed; this call only lets the backend
 * notice it sooner than a scan would. The backend re-reads the transaction
 * before believing any of it, so nothing here can inflate a balance — and a
 * failure must never turn a successful tip into an error on screen.
 */
export async function reportTip(tip: {
  channelId: string
  gifterAddress: `0x${string}`
  amount: bigint
  txHash: `0x${string}`
}): Promise<void> {
  const base = await apiBase()
  if (!base) return

  const body: RecordTipRequest = {
    gifter_address: tip.gifterAddress,
    creator_channel_id: tip.channelId,
    amount: formatUsdc(tip.amount),
    tx_hash: tip.txHash,
  }

  try {
    await fetch(`${base}/api/tips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // The chain has it. Nothing to tell the gifter.
  }
}
