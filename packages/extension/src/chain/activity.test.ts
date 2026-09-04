import type { PublicClient } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ACTIVITY_CHUNK_BLOCKS,
  ACTIVITY_LOOKBACK_BLOCKS,
  ActivityUnavailableError,
  recentMovements,
  walletActivity,
} from './activity'
import { USDC_ADDRESS } from './arc'

const ME = '0x742d35cc6634c0532925a3b844bc454e4438f44e' as const
const THEM = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' as const

interface FakeLog {
  transactionHash: `0x${string}`
  logIndex: number
  blockNumber: bigint
  args: { from: `0x${string}`; to: `0x${string}`; value: bigint }
}

function transfer(
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
  block: bigint,
  logIndex = 0,
): FakeLog {
  return {
    transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
    logIndex,
    blockNumber: block,
    args: { from, to, value },
  }
}

interface Query {
  fromBlock: bigint
  toBlock: bigint
  args?: { from?: string; to?: string }
}

/**
 * Answers the way an RPC would: only logs inside the queried range, and only
 * the side the query asked about. `failFrom` starts refusing after that many
 * `getLogs` calls, which is how the public endpoints behave under a burst.
 */
function fakeClient(options: {
  logs?: FakeLog[]
  head?: bigint
  failOn?: 'head'
  failFrom?: number
  failDirection?: 'from' | 'to'
}): PublicClient {
  const calls: Query[] = []
  const logs = options.logs ?? []

  return {
    calls,
    getBlockNumber: async () => {
      if (options.failOn === 'head') throw new Error('rpc down')
      return options.head ?? 1_000_000n
    },
    getLogs: async (query: Query) => {
      calls.push(query)
      if (options.failFrom !== undefined && calls.length > options.failFrom) {
        throw new Error('rate limit exceeded')
      }
      const side = query.args?.from ? 'from' : 'to'
      if (options.failDirection === side) throw new Error('rate limit exceeded')

      const owner = (query.args?.from ?? query.args?.to ?? '').toLowerCase()
      return logs.filter(
        (log) =>
          log.blockNumber >= query.fromBlock &&
          log.blockNumber <= query.toBlock &&
          (side === 'from' ? log.args.from : log.args.to).toLowerCase() === owner,
      )
    },
  } as unknown as PublicClient
}

const queriesOf = (client: PublicClient): Query[] => (client as unknown as { calls: Query[] }).calls

describe('reading activity', () => {
  it('tells sending apart from receiving', async () => {
    // The direction decides whether a row reads as money leaving or arriving.
    // Getting it backwards would misreport every transaction in the wallet.
    const client = fakeClient({
      logs: [
        transfer(ME, THEM, 1_000_000n, 999_900n),
        transfer(THEM, ME, 25_000_000n, 999_950n),
      ],
    })

    const [newest, older] = (await recentMovements(client, ME)).movements

    expect(newest).toMatchObject({ outgoing: false, counterparty: THEM, amount: 25_000_000n })
    expect(older).toMatchObject({ outgoing: true, counterparty: THEM, amount: 1_000_000n })
  })

  it('reads direction from the log, not from the query that found it', async () => {
    // A checksummed address on one side and a lowercase one on the other is
    // the same wallet; a case-sensitive compare would call this incoming.
    const shouty = ME.toUpperCase().replace('0X', '0x') as `0x${string}`
    const client = fakeClient({ logs: [transfer(shouty, THEM, 1_000_000n, 999_900n)] })

    expect((await recentMovements(client, ME)).movements[0]?.outgoing).toBe(true)
  })

  it('puts the newest first and honours the limit', async () => {
    const client = fakeClient({
      logs: [
        transfer(ME, THEM, 1n, 999_910n),
        transfer(THEM, ME, 3n, 999_920n),
        transfer(ME, THEM, 2n, 999_930n),
      ],
    })

    const { movements } = await recentMovements(client, ME, 2)
    expect(movements.map((movement) => movement.blockNumber)).toEqual([999_930n, 999_920n])
  })

  it('keeps every query inside the range an RPC will serve', async () => {
    // The bug this replaced: one 50,000-block query, which Arc's public RPCs
    // refuse outright as "requested range too large". Refused reads as a wallet
    // with no history, so the ceiling has to be respected per query, not in
    // total.
    const client = fakeClient({ head: 1_000_000n })
    await recentMovements(client, ME)

    for (const query of queriesOf(client)) {
      expect(query.toBlock - query.fromBlock + 1n).toBeLessThanOrEqual(ACTIVITY_CHUNK_BLOCKS)
    }
  })

  it('walks back no further than the stated window', async () => {
    const client = fakeClient({ head: 1_000_000n })
    const report = await recentMovements(client, ME)

    const oldest = queriesOf(client).reduce((low, query) => (query.fromBlock < low ? query.fromBlock : low), 1_000_000n)
    expect(oldest).toBe(1_000_000n - ACTIVITY_LOOKBACK_BLOCKS + 1n)
    expect(report.scannedBlocks).toBe(ACTIVITY_LOOKBACK_BLOCKS)
    expect(report.partial).toBe(false)
  })

  it('does not re-ask for blocks it has already covered', async () => {
    const client = fakeClient({ head: 1_000_000n })
    await recentMovements(client, ME)

    const windows = queriesOf(client)
      .filter((query) => query.args?.from)
      .sort((left, right) => Number(right.fromBlock - left.fromBlock))

    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index]?.toBlock).toBeLessThan(windows[index - 1]?.fromBlock as bigint)
    }
  })

  it('never asks for a negative block on a young chain', async () => {
    const client = fakeClient({ head: 5n })
    const report = await recentMovements(client, ME)

    expect(queriesOf(client).every((query) => query.fromBlock >= 0n)).toBe(true)
    expect(queriesOf(client)[0]?.fromBlock).toBe(0n)
    expect(report.scannedBlocks).toBe(6n)
    // Nothing older than the genesis block exists, so it stops rather than
    // spending the rest of the budget on empty windows.
    expect(queriesOf(client)).toHaveLength(2)
  })

  it('stops as soon as the list is full, rather than spending its whole budget', async () => {
    const logs = Array.from({ length: 4 }, (_, index) =>
      transfer(ME, THEM, 1_000_000n, 999_990n - BigInt(index)),
    )
    const client = fakeClient({ logs })

    const report = await recentMovements(client, ME, 3)
    expect(report.movements).toHaveLength(3)
    expect(queriesOf(client)).toHaveLength(2)
    expect(report.scannedBlocks).toBe(ACTIVITY_CHUNK_BLOCKS)
  })

  it('keeps looking when the newest window is empty', async () => {
    // One tip, older than the first window. A single-window scan would show
    // this wallet as having done nothing.
    const client = fakeClient({ logs: [transfer(THEM, ME, 5_000_000n, 960_000n)] })

    const report = await recentMovements(client, ME)
    expect(report.movements.map((movement) => movement.blockNumber)).toEqual([960_000n])
    expect(queriesOf(client).length).toBeGreaterThan(2)
  })

  it('counts two transfers in one transaction as two movements', async () => {
    const client = fakeClient({
      logs: [
        transfer(ME, THEM, 1_000_000n, 999_900n, 0),
        transfer(ME, THEM, 2_000_000n, 999_900n, 1),
      ],
    })

    expect((await recentMovements(client, ME)).movements).toHaveLength(2)
  })

  it('raises rather than returning nothing when the chain will not answer', async () => {
    // An empty list and an unanswered question look identical on screen and
    // mean opposite things, so the caller has to be able to tell them apart.
    await expect(recentMovements(fakeClient({ failFrom: 0 }), ME)).rejects.toBeInstanceOf(
      ActivityUnavailableError,
    )
    await expect(recentMovements(fakeClient({ failOn: 'head' }), ME)).rejects.toBeInstanceOf(
      ActivityUnavailableError,
    )
  })

  it('refuses a window that answered in only one direction', async () => {
    // Half a window is not a smaller window — it is sends without receipts,
    // which is a wrong ledger rather than a short one.
    await expect(recentMovements(fakeClient({ failDirection: 'to' }), ME)).rejects.toBeInstanceOf(
      ActivityUnavailableError,
    )
  })

  it('keeps what it read when a later window is refused, and says it is short', async () => {
    // Rate limits are the normal case on public endpoints. Throwing away four
    // good windows because the fifth was refused would hide real tips.
    const client = fakeClient({
      logs: [transfer(THEM, ME, 7_000_000n, 999_990n)],
      failFrom: 2,
    })

    const report = await recentMovements(client, ME)
    expect(report.movements).toHaveLength(1)
    expect(report.partial).toBe(true)
    expect(report.scannedBlocks).toBe(ACTIVITY_CHUNK_BLOCKS)
  })

  it('returns an empty list when there genuinely is nothing', async () => {
    const report = await recentMovements(fakeClient({}), ME)
    expect(report.movements).toEqual([])
    expect(report.partial).toBe(false)
  })
})

/** Blockscout's shape, enough of it to be parsed. */
function explorerRow(from: `0x${string}`, to: `0x${string}`, value: string) {
  return {
    block_number: 999_999,
    transaction_hash: `0x${'cd'.repeat(32)}`,
    log_index: 0,
    timestamp: '2026-09-04T08:52:24.000000Z',
    from: { hash: from },
    to: { hash: to },
    token: { address_hash: USDC_ADDRESS, decimals: '6' },
    total: { value, decimals: '6' },
  }
}

describe('choosing where history comes from', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('prefers the explorer, which reaches back further than a log scan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [explorerRow(THEM, ME, '4000000')] }) })))
    const client = fakeClient({})

    const report = await walletActivity(client, ME)
    expect(report.source).toBe('explorer')
    expect(report.movements[0]).toMatchObject({ amount: 4_000_000n, outgoing: false })
    // The explorer answered, so the chain was never asked.
    expect(queriesOf(client)).toHaveLength(0)
  })

  it('believes an empty answer from the explorer', async () => {
    // Re-scanning behind it would double the cost of the common case, a new
    // wallet, to hedge against an indexing lag the refresh button covers.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })))
    const client = fakeClient({ logs: [transfer(ME, THEM, 1n, 999_999n)] })

    const report = await walletActivity(client, ME)
    expect(report).toMatchObject({ source: 'explorer', movements: [] })
    expect(queriesOf(client)).toHaveLength(0)
  })

  it('falls back to the log scan when the explorer will not answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const client = fakeClient({ logs: [transfer(THEM, ME, 9_000_000n, 999_999n)] })

    const report = await walletActivity(client, ME)
    expect(report.source).toBe('chain')
    expect(report.movements[0]).toMatchObject({ amount: 9_000_000n })
    // One movement does not fill a list of 20, so the scan spends its budget.
    expect(report.scannedBlocks).toBe(ACTIVITY_LOOKBACK_BLOCKS)
  })

  it('still raises when neither source can answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(walletActivity(fakeClient({ failOn: 'head' }), ME)).rejects.toBeInstanceOf(
      ActivityUnavailableError,
    )
  })
})
