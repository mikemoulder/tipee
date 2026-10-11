import {
  ESCROW_CONTRACT_ID,
  formatUsdc,
  isValidChannelId,
  type RecordTipRequest,
  type ResolveCreatorResponse,
} from '@tipee/shared'

/** Where the backend lives, when someone has pointed the extension elsewhere. */
const API_BASE_KEY = 'tipee.apiBase.v1'

/**
 * The deployed backend, baked in at build time (`VITE_TIPEE_API`), so a fresh
 * install works without a trip to Settings. Settings can still override it.
 */
export const DEFAULT_API_BASE: string = (import.meta.env?.VITE_TIPEE_API as string | undefined) ?? 'http://localhost:3000'

/**
 * Raised when the creator a tip is for cannot be established.
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

export async function apiBase(): Promise<string> {
  const stored = await chrome.storage.local.get(API_BASE_KEY)
  const base = stored[API_BASE_KEY]
  return (typeof base === 'string' && base !== '' ? base : DEFAULT_API_BASE).replace(/\/+$/, '')
}

/** Where Tipee's service lives. Settable, because it moves between local work and a deployment. */
export async function setApiBase(base: string): Promise<void> {
  await chrome.storage.local.set({ [API_BASE_KEY]: base.trim().replace(/\/+$/, '') })
}

/** The creator behind a handle, as the backend establishes them. */
export interface ResolvedCreator {
  channelId: string
  /** Always `ESCROW_CONTRACT_ID`; checked, never taken on trust. */
  escrowContract: string
  displayName: string
}

/**
 * Asks the backend which channel a handle belongs to.
 *
 * The backend resolves this, not the extension: it establishes the channel id
 * server-side by fetching the channel page, because a client-supplied id could
 * be forged to point a tip at somebody else's balance (idea.md §8). The escrow
 * it names must be the one this extension ships with; anything else is refused.
 */
export async function resolveCreator(handle: string): Promise<ResolvedCreator> {
  const base = await apiBase()

  let response: Response
  try {
    response = await fetch(`${base}/api/creators/resolve?handle=${encodeURIComponent(handle)}`)
  } catch {
    throw new EscrowUnavailableError('Could not reach Tipee to look up this creator.')
  }

  if (!response.ok) {
    throw new EscrowUnavailableError('Tipee could not find this channel on YouTube.')
  }

  let body: unknown
  try {
    body = (await response.json()) as unknown
  } catch {
    throw new EscrowUnavailableError('Tipee sent back something unreadable.')
  }

  const resolved = body as Partial<ResolveCreatorResponse> | null

  // One escrow for every creator, fixed in this build. A backend naming any
  // other contract is either misconfigured or not Tipee's, and either way the
  // tip does not go there.
  if (resolved?.escrow_contract !== ESCROW_CONTRACT_ID) {
    throw new EscrowUnavailableError('Tipee named an escrow this extension does not trust.')
  }
  if (!isValidChannelId(resolved?.channel_id)) {
    throw new EscrowUnavailableError('Tipee sent back an unusable creator.')
  }

  return {
    channelId: resolved.channel_id as string,
    escrowContract: ESCROW_CONTRACT_ID,
    displayName: typeof resolved?.display_name === 'string' ? resolved.display_name : handle,
  }
}

/**
 * Tells the backend a tip happened, once it has.
 *
 * Best effort on purpose. The transaction is already on Stellar, which is the
 * record that decides what a creator is owed; this call only lets the backend
 * notice it sooner than a scan would. The backend re-reads the transaction
 * before believing any of it, so nothing here can inflate a balance — and a
 * failure must never turn a successful tip into an error on screen.
 */
export async function reportTip(tip: {
  channelId: string
  gifterAddress: string
  amount: bigint
  txHash: string
}): Promise<void> {
  const base = await apiBase()

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
