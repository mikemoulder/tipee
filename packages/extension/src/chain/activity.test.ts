import type { PublicClient } from 'viem'
import { describe, expect, it } from 'vitest'

import { ACTIVITY_LOOKBACK_BLOCKS, ActivityUnavailableError, recentMovements } from './activity'

const ME = '0x742d35cc6634c0532925a3b844bc454e4438f44e' as const
const THEM = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' as const

interface FakeLog {
  transactionHash: `0x${string}`
  blockNumber: bigint
  args: { from: `0x${string}`; to: `0x${string}`; value: bigint }
}

function transfer(from: `0x${string}`, to: `0x${string}`, value: bigint, block: bigint): FakeLog {
  return { transactionHash: `0x${block.toString(16).padStart(64, '0')}`, blockNumber: block, args: { from, to, value } }
}

/** Answers the two directional queries the way an RPC would. */
function fakeClient(options: {
  sent?: FakeLog[]
  received?: FakeLog[]
  head?: bigint
  failOn?: 'head' | 'logs'
}): PublicClient {
  const calls: Array<Record<string, unknown>> = []
  return {
    calls,
    getBlockNumber: async () => {
      if (options.failOn === 'head') throw new Error('rpc down')
      return options.head ?? 1_000_000n
    },
    getLogs: async (query: { args?: { from?: string; to?: string } }) => {
      if (options.failOn === 'logs') throw new Error('range too wide')
      calls.push(query as Record<string, unknown>)
      return query.args?.from ? (options.sent ?? []) : (options.received ?? [])
    },
  } as unknown as PublicClient
}

describe('reading activity', () => {
  it('tells sending apart from receiving', async () => {
    // The direction decides whether a row reads as money leaving or arriving.
    // Getting it backwards would misreport every transaction in the wallet.
    const client = fakeClient({
      sent: [transfer(ME, THEM, 1_000_000n, 900n)],
      received: [transfer(THEM, ME, 25_000_000n, 950n)],
    })

    const [newest, older] = await recentMovements(client, ME)

    expect(newest).toMatchObject({ outgoing: false, counterparty: THEM, amount: 25_000_000n })
    expect(older).toMatchObject({ outgoing: true, counterparty: THEM, amount: 1_000_000n })
  })

  it('reads direction from the log, not from the query that found it', async () => {
    // A checksummed address on one side and a lowercase one on the other is
    // the same wallet; a case-sensitive compare would call this incoming.
    const shouty = ME.toUpperCase().replace('0X', '0x') as `0x${string}`
    const client = fakeClient({ sent: [transfer(shouty, THEM, 1_000_000n, 900n)] })

    expect((await recentMovements(client, ME))[0]?.outgoing).toBe(true)
  })

  it('puts the newest first and honours the limit', async () => {
    const client = fakeClient({
      sent: [transfer(ME, THEM, 1n, 10n), transfer(ME, THEM, 2n, 30n)],
      received: [transfer(THEM, ME, 3n, 20n)],
    })

    const movements = await recentMovements(client, ME, 2)
    expect(movements.map((movement) => movement.blockNumber)).toEqual([30n, 20n])
  })

  it('asks for a bounded window, because public RPCs cap the range', async () => {
    const client = fakeClient({ head: 1_000_000n })
    await recentMovements(client, ME)

    const query = (client as unknown as { calls: Array<{ fromBlock: bigint; toBlock: bigint }> }).calls[0]
    expect(query?.toBlock).toBe(1_000_000n)
    expect(query?.fromBlock).toBe(1_000_000n - ACTIVITY_LOOKBACK_BLOCKS)
  })

  it('never asks for a negative block on a young chain', async () => {
    const client = fakeClient({ head: 5n })
    await recentMovements(client, ME)

    const query = (client as unknown as { calls: Array<{ fromBlock: bigint }> }).calls[0]
    expect(query?.fromBlock).toBe(0n)
  })

  it('raises rather than returning nothing when the chain will not answer', async () => {
    // An empty list and an unanswered question look identical on screen and
    // mean opposite things, so the caller has to be able to tell them apart.
    await expect(recentMovements(fakeClient({ failOn: 'logs' }), ME)).rejects.toBeInstanceOf(
      ActivityUnavailableError,
    )
    await expect(recentMovements(fakeClient({ failOn: 'head' }), ME)).rejects.toBeInstanceOf(
      ActivityUnavailableError,
    )
  })

  it('returns an empty list when there genuinely is nothing', async () => {
    await expect(recentMovements(fakeClient({}), ME)).resolves.toEqual([])
  })
})
