import { isAddress } from 'viem'

import { USDC_ADDRESS } from './arc'
import type { Movement } from './activity'

/**
 * Arc's block explorer, which is a Blockscout instance.
 *
 * Reading history from it rather than from `eth_getLogs` is what lets this
 * screen show more than the last day. A log scan is bounded by what a public
 * RPC will serve in one query — under 30,000 blocks, about four hours of Arc —
 * so reaching back a week costs dozens of round trips against endpoints that
 * rate-limit bursts. The explorer has already done that indexing: one request
 * returns the whole history, newest first, with real timestamps.
 *
 * What that costs is a third party in the read path, so it is kept to exactly
 * that: history for display. Balances, gas, and every signature stay on the
 * RPC, nothing here is trusted with money, and a wallet whose explorer is down
 * falls back to the log scan rather than showing nothing.
 */
export const ARC_EXPLORER = 'https://testnet.arcscan.app'

/** Blockscout answers a plain GET with `access-control-allow-origin: *`. */
const TRANSFERS = `${ARC_EXPLORER}/api/v2/addresses`

/** Long enough for a slow answer, short enough to fall back and still feel live. */
const TIMEOUT_MS = 8_000

export class ExplorerUnavailableError extends Error {
  constructor(message = 'Could not read history from the Arc explorer.') {
    super(message)
    this.name = 'ExplorerUnavailableError'
  }
}

interface TransferItem {
  block_number?: number
  transaction_hash?: string
  log_index?: number
  timestamp?: string
  from?: { hash?: string }
  to?: { hash?: string }
  token?: { address_hash?: string; address?: string; decimals?: string }
  total?: { value?: string; decimals?: string }
}

/**
 * USDC movements for one wallet, newest first.
 *
 * The query is filtered to the USDC contract, but the reply is checked against
 * it again: this is somebody else's server, and a row for another token would
 * otherwise be rendered with USDC's decimals — a 10^12 error in what a person
 * reads as dollars.
 */
export async function explorerMovements(owner: `0x${string}`, limit = 20): Promise<Movement[]> {
  const url =
    `${TRANSFERS}/${owner}/token-transfers?type=ERC-20&token=${USDC_ADDRESS}`

  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    })
  } catch {
    throw new ExplorerUnavailableError()
  }

  if (!response.ok) throw new ExplorerUnavailableError()

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ExplorerUnavailableError()
  }

  const items = (body as { items?: unknown } | null)?.items
  if (!Array.isArray(items)) throw new ExplorerUnavailableError()

  return items
    .map((item) => toMovement(item as TransferItem, owner))
    .filter((movement): movement is Movement => movement !== null)
    .slice(0, limit)
}

function toMovement(item: TransferItem, owner: `0x${string}`): Movement | null {
  const token = (item.token?.address_hash ?? item.token?.address ?? '').toLowerCase()
  if (token !== USDC_ADDRESS.toLowerCase()) return null

  // USDC is a 6-decimal token and every amount in this extension is in those
  // units. A row claiming anything else is not describing the same money.
  if ((item.total?.decimals ?? item.token?.decimals) !== '6') return null

  const from = item.from?.hash
  const to = item.to?.hash
  const value = item.total?.value
  const txHash = item.transaction_hash

  // Shape, not checksum. Blockscout returns checksummed addresses, but a
  // lowercase one is the same address, and dropping a real movement over its
  // capitalisation would be a worse answer than showing it. Nothing is paid to
  // these — the escrow address a tip is sent to is checked strictly, in
  // `creators.ts`.
  if (!from || !to || !isAddress(from, { strict: false }) || !isAddress(to, { strict: false })) {
    return null
  }
  if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return null
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null

  const outgoing = from.toLowerCase() === owner.toLowerCase()
  const movement: Movement = {
    txHash: txHash as `0x${string}`,
    counterparty: (outgoing ? to : from) as `0x${string}`,
    amount: BigInt(value),
    outgoing,
    blockNumber: BigInt(item.block_number ?? 0),
  }

  const at = item.timestamp ? new Date(item.timestamp) : undefined
  return at && !Number.isNaN(at.getTime()) ? { ...movement, at } : movement
}
