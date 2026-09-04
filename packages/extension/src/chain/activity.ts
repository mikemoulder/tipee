import type { PublicClient } from 'viem'

import { ERC20_ABI, USDC_ADDRESS } from './arc'
import { explorerMovements } from './explorer'

/** One USDC movement in or out of the wallet. */
export interface Movement {
  txHash: `0x${string}`
  /** The other side of the transfer. */
  counterparty: `0x${string}`
  /** Accounting units, always positive — `outgoing` carries the direction. */
  amount: bigint
  outgoing: boolean
  blockNumber: bigint
  /**
   * When it happened, if the source knew. The explorer reports it; a log scan
   * would need one more RPC call per row to find out, so those rows carry only
   * a block number and the screen estimates from it.
   */
  at?: Date
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
 * How wide one `eth_getLogs` query may be.
 *
 * Measured against Arc's public testnet RPCs: a 28,000-block range is served,
 * 30,000 comes back as "requested range too large", and all three endpoints
 * behave the same. 25,000 keeps a margin under that ceiling — a query that
 * exceeds it is refused outright, which reads on screen as a wallet with no
 * history rather than as a request that was too greedy.
 *
 * There is a second ceiling — 20,000 matching logs per query — which a single
 * wallet's own transfers will not approach, but an unfiltered query would.
 */
export const ACTIVITY_CHUNK_BLOCKS = 25_000n

/**
 * How many of those windows a scan will walk before giving up.
 *
 * Each one is two queries — `from` and `to` are separate indexed topics — and
 * the public endpoints rate-limit a burst, so this is a budget rather than a
 * target: the scan stops as soon as it has enough movements to fill the list.
 */
export const ACTIVITY_CHUNKS = 6

/** The furthest back a scan can reach: about a day at Arc's block time. */
export const ACTIVITY_LOOKBACK_BLOCKS = ACTIVITY_CHUNK_BLOCKS * BigInt(ACTIVITY_CHUNKS)

/** What one read found, and how much history it managed to cover. */
export interface ActivityReport {
  /** Newest first, at most `limit` of them. */
  movements: Movement[]
  /** Which source answered — they reach back different distances. */
  source: 'explorer' | 'chain'
  /** The head a log scan measured back from. Absent for explorer reads. */
  head?: bigint
  /** How many blocks a log scan covered. Absent for explorer reads. */
  scannedBlocks?: bigint
  /** True when an RPC refusal cut a scan short of its own budget. */
  partial: boolean
}

/**
 * Recent USDC movements for one wallet, newest first.
 *
 * Read straight from `Transfer` logs. That means it reflects the chain rather
 * than anything Tipee recorded — a tip sent from this wallet by other means
 * still shows up, and a tip our backend failed to record does not disappear.
 *
 * The scan walks backwards in windows the RPC will accept and stops as soon as
 * the list is full, so a busy wallet costs two queries and an empty one costs
 * the budget. A window that fails *after* the first one ends the scan and comes
 * back `partial`: what was read is still true, it just covers less chain than
 * intended, and the screen says so instead of implying the wallet is empty.
 */
export async function recentMovements(
  client: PublicClient,
  owner: `0x${string}`,
  limit = 20,
): Promise<ActivityReport> {
  const transfer = ERC20_ABI.find((entry) => entry.type === 'event' && entry.name === 'Transfer')
  if (!transfer) throw new ActivityUnavailableError()

  let head: bigint
  try {
    head = await client.getBlockNumber()
  } catch {
    throw new ActivityUnavailableError()
  }

  const found = new Map<string, Movement>()
  let toBlock = head
  let oldest = head
  let partial = false

  for (let chunk = 0; chunk < ACTIVITY_CHUNKS; chunk += 1) {
    // Inclusive of both ends, so windows tile the chain exactly: no block is
    // asked for twice, and none falls between two of them.
    const fromBlock = toBlock >= ACTIVITY_CHUNK_BLOCKS ? toBlock - ACTIVITY_CHUNK_BLOCKS + 1n : 0n

    // Two queries per window because `from` and `to` are separate indexed
    // topics: one filter cannot express "either side is me" without matching
    // every transfer on the chain.
    const [sent, received] = await Promise.allSettled([
      client.getLogs({ address: USDC_ADDRESS, event: transfer, args: { from: owner }, fromBlock, toBlock }),
      client.getLogs({ address: USDC_ADDRESS, event: transfer, args: { to: owner }, fromBlock, toBlock }),
    ])

    if (sent.status !== 'fulfilled' || received.status !== 'fulfilled') {
      // Half a window is not a smaller window — it is a window missing one
      // direction, which would show sends without receipts. Never keep it.
      if (chunk === 0) throw new ActivityUnavailableError()
      partial = true
      break
    }

    for (const log of [...sent.value, ...received.value]) {
      const movement = toMovement(log, owner)
      if (movement) found.set(logKey(log), movement)
    }

    oldest = fromBlock
    if (found.size >= limit || fromBlock === 0n) break
    toBlock = fromBlock - 1n
  }

  const movements = [...found.values()]
    .sort((a, b) => Number(b.blockNumber - a.blockNumber))
    .slice(0, limit)

  return { movements, source: 'chain', head, scannedBlocks: head - oldest + 1n, partial }
}

/**
 * Wallet history, from whichever source can answer.
 *
 * The explorer is asked first because it has the whole history indexed, with
 * timestamps; the log scan behind it reaches back about a day and estimates
 * ages from block distance. Preferring the explorer is a display decision and
 * nothing more — it never sees a key, and it cannot make a tip that did not
 * happen appear, because the fallback would contradict it on the next open.
 *
 * An explorer that answers with an empty list is believed. It indexes within
 * seconds of a block, and re-running the scan behind it would double the cost
 * of the common case — a new wallet — to hedge against a lag the refresh
 * button already covers.
 */
export async function walletActivity(
  client: PublicClient,
  owner: `0x${string}`,
  limit = 20,
): Promise<ActivityReport> {
  try {
    const movements = await explorerMovements(owner, limit)
    return { movements, source: 'explorer', partial: false }
  } catch {
    // Down, rate-limited, or answering with something unrecognisable. The
    // chain itself is still there.
    return recentMovements(client, owner, limit)
  }
}

/**
 * Identifies one log. A transaction can hold several transfers, so the hash
 * alone would collapse a tip and its change into a single row.
 */
function logKey(log: unknown): string {
  const entry = log as { transactionHash?: string; logIndex?: number }
  return `${entry.transactionHash ?? ''}:${entry.logIndex ?? 0}`
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
