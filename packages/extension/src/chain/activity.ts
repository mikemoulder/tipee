import type { PublicClient } from 'viem'

import { ERC20_ABI, USDC_ADDRESS } from './arc'

/** One USDC movement in or out of the wallet. */
export interface Movement {
  txHash: `0x${string}`
  /** The other side of the transfer. */
  counterparty: `0x${string}`
  /** Accounting units, always positive — `outgoing` carries the direction. */
  amount: bigint
  outgoing: boolean
  blockNumber: bigint
}

/**
 * Raised when the chain will not answer, so the UI can say so.
 *
 * An empty list and an unanswered question look identical on screen and mean
 * opposite things — "you have sent no tips" against "we could not find out".
 * A wallet that shows the first when it means the second is lying about money.
 */
export class ActivityUnavailableError extends Error {
  constructor() {
    super('Could not read activity from Arc.')
    this.name = 'ActivityUnavailableError'
  }
}

/**
 * How far back to look.
 *
 * Public RPCs cap `eth_getLogs` ranges, and there is no indexer behind this
 * extension to ask instead — so history is a recent window rather than the
 * whole chain. The window is stated in the UI rather than presented as a
 * complete ledger.
 */
export const ACTIVITY_LOOKBACK_BLOCKS = 50_000n

/**
 * Recent USDC movements for one wallet, newest first.
 *
 * Read straight from `Transfer` logs. That means it reflects the chain rather
 * than anything Tipee recorded — a tip sent from this wallet by other means
 * still shows up, and a tip our backend failed to record does not disappear.
 */
export async function recentMovements(
  client: PublicClient,
  owner: `0x${string}`,
  limit = 20,
): Promise<Movement[]> {
  const transfer = ERC20_ABI.find(
    (entry) => entry.type === 'event' && entry.name === 'Transfer',
  )
  if (!transfer) throw new ActivityUnavailableError()

  let head: bigint
  try {
    head = await client.getBlockNumber()
  } catch {
    throw new ActivityUnavailableError()
  }

  const fromBlock = head > ACTIVITY_LOOKBACK_BLOCKS ? head - ACTIVITY_LOOKBACK_BLOCKS : 0n

  try {
    // Two queries because `from` and `to` are separate indexed topics: one
    // filter cannot express "either side is me" without matching everything.
    const [sent, received] = await Promise.all([
      client.getLogs({ address: USDC_ADDRESS, event: transfer, args: { from: owner }, fromBlock, toBlock: head }),
      client.getLogs({ address: USDC_ADDRESS, event: transfer, args: { to: owner }, fromBlock, toBlock: head }),
    ])

    return [...sent, ...received]
      .map((log) => toMovement(log, owner))
      .filter((movement): movement is Movement => movement !== null)
      .sort((a, b) => Number(b.blockNumber - a.blockNumber))
      .slice(0, limit)
  } catch {
    throw new ActivityUnavailableError()
  }
}

function toMovement(log: unknown, owner: `0x${string}`): Movement | null {
  const entry = log as {
    transactionHash?: `0x${string}`
    blockNumber?: bigint
    args?: { from?: `0x${string}`; to?: `0x${string}`; value?: bigint }
  }
  const { from, to, value } = entry.args ?? {}
  if (!from || !to || value === undefined || !entry.transactionHash) return null

  const outgoing = from.toLowerCase() === owner.toLowerCase()
  return {
    txHash: entry.transactionHash,
    counterparty: outgoing ? to : from,
    amount: value,
    outgoing,
    blockNumber: entry.blockNumber ?? 0n,
  }
}
