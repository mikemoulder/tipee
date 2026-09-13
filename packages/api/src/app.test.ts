import { encodeAbiParameters, encodeEventTopics, parseAbi } from 'viem'
import type { PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.ts'
import { EscrowUnavailableError, fakeEscrow, type EscrowProvider } from './circle.ts'
import { USDC_ADDRESS } from './chain.ts'
import { memoryStore, type Store } from './store.ts'

const CHANNEL = 'UCsBjURrPoezykLs9EqgamOA'
const GIFTER = '0x742d35cc6634c0532925a3b844bc454e4438f44e'
const TX = `0x${'ab'.repeat(32)}`

const TRANSFER_ABI = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])

function channelPage(handle = 'Fireship'): string {
  return `<meta itemprop="identifier" content="${CHANNEL}"><meta property="og:title" content="${handle}">`
}

function fakeYouTube(html = channelPage()): typeof fetch {
  return vi.fn(async () => ({ ok: true, status: 200, text: async () => html })) as unknown as typeof fetch
}

/** A receipt carrying real, decodable `Transfer` logs. */
function receiptWith(transfers: Array<{ from: string; to: string; value: bigint }>, status = 'success') {
  return {
    status,
    logs: transfers.map((transfer) => ({
      address: USDC_ADDRESS,
      topics: encodeEventTopics({
        abi: TRANSFER_ABI,
        eventName: 'Transfer',
        args: { from: transfer.from as `0x${string}`, to: transfer.to as `0x${string}` },
      }),
      data: encodeAbiParameters([{ type: 'uint256' }], [transfer.value]),
    })),
  }
}

function fakeChain(receipt: unknown, fail = false): PublicClient {
  return {
    getTransactionReceipt: async () => {
      if (fail) throw new Error('rpc down')
      return receipt
    },
  } as unknown as PublicClient
}

function app(options: { store?: Store; escrow?: EscrowProvider; chain?: PublicClient; html?: string } = {}) {
  return buildApp({
    store: options.store ?? memoryStore(),
    escrow: options.escrow ?? fakeEscrow(),
    chain: options.chain ?? fakeChain(receiptWith([])),
    fetchImpl: fakeYouTube(options.html),
  })
}

async function resolve(server: ReturnType<typeof buildApp>, handle = '@fireship') {
  return server.inject({ method: 'GET', url: `/api/creators/resolve?handle=${encodeURIComponent(handle)}` })
}

describe('resolving a creator', () => {
  it('provisions an escrow the first time anyone tries to tip a channel', async () => {
    const server = app()
    const response = await resolve(server)

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.channel_id).toBe(CHANNEL)
    expect(body.wallet_address).toMatch(/^0x[0-9a-f]{40}$/i)
    expect(body.unclaimed_balance).toBe('0.00')
    expect(body.is_verified).toBe(false)
  })

  it('gives the same channel the same wallet, however often it is asked', async () => {
    // A second escrow for one creator is tips paid into an address that never
    // appears on their dashboard.
    const escrow = { create: vi.fn(fakeEscrow().create) }
    const server = app({ store: memoryStore(), escrow })

    const first = await resolve(server)
    const second = await resolve(server)

    expect(first.json().wallet_address).toBe(second.json().wallet_address)
    expect(escrow.create).toHaveBeenCalledTimes(1)
  })

  it('follows a rename without moving the money', async () => {
    // The escrow belongs to the channel ID. A handle is re-assignable, and an
    // escrow that followed it would follow it to whoever claimed it next.
    const store = memoryStore()
    const before = await resolve(buildApp({
      store,
      escrow: fakeEscrow(),
      chain: fakeChain(receiptWith([])),
      fetchImpl: fakeYouTube(channelPage('Fireship')),
    }))

    const after = await resolve(
      buildApp({
        store,
        escrow: fakeEscrow(99),
        chain: fakeChain(receiptWith([])),
        fetchImpl: fakeYouTube(
          `<meta itemprop="identifier" content="${CHANNEL}"><meta property="og:title" content="Fireship Live">`,
        ),
      }),
      '@fireshiplive',
    )

    expect(after.json().wallet_address).toBe(before.json().wallet_address)
    expect(after.json().display_name).toBe('Fireship Live')
    expect(after.json().handle).toBe('@fireshiplive')
  })

  it('writes nothing when the escrow could not be created', async () => {
    // A creator row with no real wallet collects tips into an address nobody
    // holds, and it would look completely normal on screen.
    const store = memoryStore()
    const server = app({
      store,
      escrow: {
        create: async () => {
          throw new EscrowUnavailableError('Circle is not configured.')
        },
      },
    })

    const response = await resolve(server)
    expect(response.statusCode).toBe(503)
    expect(response.json().error).toBe('escrow_unavailable')
    expect(await store.creatorByChannelId(CHANNEL)).toBeNull()
  })

  it('refuses a handle that is not one', async () => {
    const response = await resolve(app(), '   ')
    expect(response.statusCode).toBe(400)
  })

  it('tells a missing channel apart from an unreachable YouTube', async () => {
    const missing = buildApp({
      store: memoryStore(),
      escrow: fakeEscrow(),
      chain: fakeChain(receiptWith([])),
      fetchImpl: vi.fn(async () => ({ ok: false, status: 404, text: async () => '' })) as unknown as typeof fetch,
    })
    const broken = buildApp({
      store: memoryStore(),
      escrow: fakeEscrow(),
      chain: fakeChain(receiptWith([])),
      fetchImpl: vi.fn(async () => ({ ok: false, status: 500, text: async () => '' })) as unknown as typeof fetch,
    })

    expect((await resolve(missing)).statusCode).toBe(404)
    expect((await resolve(broken)).statusCode).toBe(502)
  })
})

describe('recording a tip', () => {
  let store: Store
  let escrowAddress: string

  beforeEach(async () => {
    store = memoryStore()
    const response = await resolve(app({ store }))
    escrowAddress = response.json().wallet_address
  })

  function post(body: Record<string, unknown>, chain?: PublicClient) {
    const server = app(chain ? { store, chain } : { store })
    return server.inject({ method: 'POST', url: '/api/tips', payload: body })
  }

  const validBody = () => ({
    gifter_address: GIFTER,
    creator_channel_id: CHANNEL,
    amount: '5.00',
    tx_hash: TX,
  })

  it('records what the chain says, not what the request claimed', async () => {
    // Anyone can POST an amount. Believing it would let a stranger inflate a
    // creator's balance to any figure they liked.
    const chain = fakeChain(receiptWith([{ from: GIFTER, to: escrowAddress, value: 2_000_000n }]))
    const response = await post({ ...validBody(), amount: '500.00' }, chain)

    expect(response.statusCode).toBe(201)
    expect(response.json().amount).toBe('2.00')
    expect(response.json().status).toBe('confirmed')
  })

  it('credits a creator once for one transaction, however many times it is reported', async () => {
    const chain = fakeChain(receiptWith([{ from: GIFTER, to: escrowAddress, value: 2_000_000n }]))

    const first = await post(validBody(), chain)
    const second = await post(validBody(), chain)

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(200)
    expect(second.json().tip_id).toBe(first.json().tip_id)

    const creator = await store.creatorByChannelId(CHANNEL)
    expect(await store.unclaimedBalance(creator!.id)).toBe(2_000_000n)
  })

  it('shows up in the creator unclaimed balance', async () => {
    const chain = fakeChain(receiptWith([{ from: GIFTER, to: escrowAddress, value: 7_500_000n }]))
    await post(validBody(), chain)

    const response = await resolve(app({ store }))
    expect(response.json().unclaimed_balance).toBe('7.50')
  })

  it('refuses a transaction that paid this creator nothing', async () => {
    const elsewhere = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'
    const chain = fakeChain(receiptWith([{ from: GIFTER, to: elsewhere, value: 2_000_000n }]))

    const response = await post(validBody(), chain)
    expect(response.statusCode).toBe(422)
    expect(response.json().error).toBe('not_a_tip')
  })

  it('refuses a transaction that reverted', async () => {
    const chain = fakeChain(
      receiptWith([{ from: GIFTER, to: escrowAddress, value: 2_000_000n }], 'reverted'),
    )

    expect((await post(validBody(), chain)).statusCode).toBe(422)
  })

  it('asks the reporter to come back when Arc will not answer', async () => {
    // Not yet mined and never mined look identical from here, so this is never
    // a verdict on the tip.
    const response = await post(validBody(), fakeChain(null, true))
    expect(response.statusCode).toBe(503)
    expect(response.json().error).toBe('chain_unavailable')
  })

  it('sums transfers that reached the escrow in one transaction', async () => {
    const chain = fakeChain(
      receiptWith([
        { from: GIFTER, to: escrowAddress, value: 1_000_000n },
        { from: GIFTER, to: escrowAddress, value: 500_000n },
      ]),
    )

    expect((await post(validBody(), chain)).json().amount).toBe('1.50')
  })

  it('rejects a body that is malformed before it reads anything', async () => {
    expect((await post({ ...validBody(), creator_channel_id: 'not-a-channel' })).statusCode).toBe(400)
    expect((await post({ ...validBody(), tx_hash: '0xshort' })).statusCode).toBe(400)
    expect((await post({ ...validBody(), amount: 'five dollars' })).statusCode).toBe(400)
    expect((await post({ ...validBody(), amount: '0.10' })).statusCode).toBe(400)
  })

  it('refuses a channel it has never provisioned', async () => {
    const response = await post({ ...validBody(), creator_channel_id: 'UCaaaaaaaaaaaaaaaaaaaaaa' })
    expect(response.statusCode).toBe(404)
  })
})
