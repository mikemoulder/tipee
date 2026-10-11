import { Address, nativeToScVal, scValToNative, type rpc } from '@stellar/stellar-sdk'

import { USDC_CONTRACT_ID, fromStroops } from '@tipee/shared'

import { stellarServer } from './stellar'

/** One USDC movement in or out of the wallet. */
export interface Movement {
  txHash: string
  /** The other side of the transfer: an account, a wallet, or the escrow. */
  counterparty: string
  /** Accounting units, always positive — `outgoing` carries the direction. */
  amount: bigint
  outgoing: boolean
  /** The ledger it closed in. */
  blockNumber: bigint
  /** When that ledger closed. Stellar's RPC reports it with every event. */
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
    super('Could not read activity from Stellar.')
    this.name = 'ActivityUnavailableError'
  }
}

/**
 * How wide one `getEvents` query may be, in ledgers.
 *
 * Measured against the public testnet RPC: the USDC contract is one of the
 * busiest on the network, and a topic-filtered query over 100,000 ledgers is
 * refused outright ("exceeded processing limit"), while 17,280 quietly comes
 * back short. 5,000 ledgers (about seven hours) answered completely in a
 * quarter of a second, so windows are kept under that.
 */
export const ACTIVITY_CHUNK_LEDGERS = 4_000

/** How many windows a scan walks before stopping: about a day and a half. */
export const ACTIVITY_CHUNKS = 6

/** Stellar closes a ledger about every five seconds. */
export const LEDGER_SECONDS = 5

/** What one read found, and how much history it managed to cover. */
export interface ActivityReport {
  /** Newest first, at most `limit` of them. */
  movements: Movement[]
  source: 'chain'
  /** The ledger the scan measured back from. */
  head?: bigint
  /** How many ledgers the scan covered. */
  scannedBlocks?: bigint
  /** True when an RPC refusal cut the scan short of its own budget. */
  partial: boolean
}

const TRANSFER = nativeToScVal('transfer', { type: 'symbol' }).toXDR('base64')

/**
 * Recent USDC movements for one wallet, newest first.
 *
 * Read straight from the USDC contract's `transfer` events, so it reflects the
 * chain rather than anything Tipee recorded: a tip is the wallet's transfer
 * into the escrow, and shows up here whether or not the backend heard of it.
 *
 * The scan walks backwards in windows the RPC will serve and stops once the
 * list is full. A window that fails *after* the first ends the scan and comes
 * back `partial`: what was read is still true, it just covers less than
 * intended, and the screen says so instead of implying the wallet is empty.
 */
export async function walletActivity(owner: string, limit = 20): Promise<ActivityReport> {
  const server = stellarServer()

  let head: number
  let oldest: number
  try {
    const latest = await server.getLatestLedger()
    head = latest.sequence
    // The RPC only keeps a retention window; asking before it is an error.
    const health = await server.getHealth()
    oldest = health.oldestLedger
  } catch {
    throw new ActivityUnavailableError()
  }

  const me = Address.fromString(owner).toScVal().toXDR('base64')
  const found = new Map<string, Movement>()
  let end = head
  let reached = head
  let partial = false

  for (let chunk = 0; chunk < ACTIVITY_CHUNKS && end > oldest; chunk += 1) {
    const start = Math.max(end - ACTIVITY_CHUNK_LEDGERS + 1, oldest)

    // Two filters: `from` and `to` are separate topics, and one filter cannot
    // say "either side is me" without matching every transfer on the network.
    let events: rpc.Api.EventResponse[]
    try {
      const page = await server.getEvents({
        startLedger: start,
        endLedger: end + 1,
        filters: [
          { type: 'contract', contractIds: [USDC_CONTRACT_ID], topics: [[TRANSFER, me, '*', '*']] },
          { type: 'contract', contractIds: [USDC_CONTRACT_ID], topics: [[TRANSFER, '*', me, '*']] },
        ],
        limit: 100,
      })
      events = page.events
    } catch {
      if (chunk === 0) throw new ActivityUnavailableError()
      partial = true
      break
    }

    for (const event of events) {
      const movement = toMovement(event, owner)
      if (movement) found.set(`${movement.txHash}:${event.id}`, movement)
    }

    reached = start
    end = start - 1
    if (found.size >= limit) break
  }

  const movements = [...found.values()]
    .sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1))
    .slice(0, limit)

  return {
    movements,
    source: 'chain',
    head: BigInt(head),
    scannedBlocks: BigInt(head - reached + 1),
    partial,
  }
}

/**
 * A SAC `transfer` event as a movement. Topics are `[transfer, from, to,
 * asset]`; the value is the amount, or a map carrying it when the recipient is
 * muxed.
 */
export function toMovement(event: rpc.Api.EventResponse, owner: string): Movement | null {
  let from: string
  let to: string
  let stroops: bigint
  try {
    from = String(scValToNative(event.topic[1]!))
    to = String(scValToNative(event.topic[2]!))
    const value = scValToNative(event.value) as bigint | { amount?: bigint }
    stroops = typeof value === 'bigint' ? value : BigInt(value.amount ?? 0n)
  } catch {
    return null
  }

  if (stroops <= 0n || (from !== owner && to !== owner) || from === to) return null
  const outgoing = from === owner

  return {
    txHash: event.txHash,
    counterparty: outgoing ? to : from,
    amount: fromStroops(stroops),
    outgoing,
    blockNumber: BigInt(event.ledger),
    at: new Date(event.ledgerClosedAt),
  }
}
