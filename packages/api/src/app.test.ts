import { describe, expect, it, vi } from 'vitest'

import { ESCROW_CONTRACT_ID } from '@tipee/shared'

import { VERIFICATION_TTL_MS, buildApp } from './app.ts'
import {
  ChainUnavailableError,
  RelayRefusedError,
  TransactionFailedError,
  type StellarGateway,
  type VerifiedTip,
} from './stellar.ts'
import { memoryStore, type Store } from './store.ts'

const CHANNEL = 'UCsBjURrPoezykLs9EqgamOA'
const OTHER_CHANNEL = 'UCBJycsmduvYEL83R_U4JriQ'
const WALLET = 'CALSZXYNONPSDJD4UCZO5PE2MO66NGUEHP2SR5ZLHVLZEBR2XSGAQWZ2'
const OWNER = 'GCBOETCF6JUQIVT46TOINOEESGRK536Q3DNS57BNNKDQJ24A4RAEA27L'
const CREATOR_DEST = 'GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP'
const TX = 'ab'.repeat(32)

function channelPage(handle = 'Fireship', extra = ''): string {
  return `<meta itemprop="identifier" content="${CHANNEL}"><meta property="og:title" content="${handle}">${extra}`
}

/** YouTube, as far as the API can tell: the channel page, and its About page. */
function fakeYouTube(about = ''): typeof fetch {
  return vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => (String(url).endsWith('/about') ? channelPage('Fireship', about) : channelPage()),
  })) as unknown as typeof fetch
}

function fakeStellar(overrides: Partial<StellarGateway> = {}): StellarGateway {
  return {
    escrowBalance: vi.fn(async () => 0n),
    verifyTip: vi.fn(async (): Promise<VerifiedTip | null> => null),
    deployWallet: vi.fn(async () => ({ address: WALLET, deployed: true, txHash: TX })),
    usdcBalance: vi.fn(async () => 0n),
    fund: vi.fn(async () => TX),
    relay: vi.fn(async () => TX),
    claim: vi.fn(async () => ({ txHash: TX, net: 9_600_000n, fee: 400_000n })),
    escrowLifetime: vi.fn(async () => 0n),
    channelActivity: vi.fn(async () => ({ events: [], partial: false })),
    ...overrides,
  }
}

function app(options: { store?: Store; stellar?: StellarGateway; about?: string; now?: () => Date } = {}) {
  return buildApp({
    store: options.store ?? memoryStore(),
    stellar: options.stellar ?? fakeStellar(),
    fetchImpl: fakeYouTube(options.about),
    now: options.now,
  })
}

async function resolve(server: ReturnType<typeof buildApp>, handle = '@fireship') {
  return server.inject({ method: 'GET', url: `/api/creators/resolve?handle=${encodeURIComponent(handle)}` })
}

describe('resolving a creator', () => {
  it('names the one escrow contract, and the channel’s balance in it', async () => {
    const stellar = fakeStellar({ escrowBalance: vi.fn(async () => 2_500_000n) })
    const response = await resolve(app({ stellar }))

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.channel_id).toBe(CHANNEL)
    expect(body.escrow_contract).toBe(ESCROW_CONTRACT_ID)
    expect(body.unclaimed_balance).toBe('2.50')
    expect(body.is_verified).toBe(false)
    expect(stellar.escrowBalance).toHaveBeenCalledWith(CHANNEL)
  })

  it('still resolves when the chain will not say the balance', async () => {
    const stellar = fakeStellar({ escrowBalance: vi.fn(async () => { throw new ChainUnavailableError() }) })
    const response = await resolve(app({ stellar }))
    expect(response.statusCode).toBe(200)
    expect(response.json().unclaimed_balance).toBe('0.00')
  })

  it('refuses something that is not a handle', async () => {
    const response = await resolve(app(), 'not a handle!')
    expect(response.statusCode).toBe(400)
  })
})

describe('recording a tip', () => {
  async function withCreator(stellar: StellarGateway) {
    const server = app({ stellar })
    await resolve(server)
    return server
  }

  function report(server: ReturnType<typeof buildApp>, body: Record<string, unknown> = {}) {
    return server.inject({
      method: 'POST',
      url: '/api/tips',
      payload: { gifter_address: WALLET, creator_channel_id: CHANNEL, amount: '5.00', tx_hash: TX, ...body },
    })
  }

  it('records the amount the chain reports, not the one claimed', async () => {
    const stellar = fakeStellar({
      verifyTip: vi.fn(async () => ({ from: WALLET, channelId: CHANNEL, amount: 2_000_000n, note: 'hi' })),
    })
    const response = await report(await withCreator(stellar), { amount: '500.00' })

    expect(response.statusCode).toBe(201)
    expect(response.json().amount).toBe('2.00')
  })

  it('refuses a tip that paid a different channel', async () => {
    const stellar = fakeStellar({
      verifyTip: vi.fn(async () => ({ from: WALLET, channelId: OTHER_CHANNEL, amount: 2_000_000n, note: '' })),
    })
    expect((await report(await withCreator(stellar))).statusCode).toBe(422)
  })

  it('records one transaction once', async () => {
    const verifyTip = vi.fn(async () => ({ from: WALLET, channelId: CHANNEL, amount: 2_000_000n, note: '' }))
    const server = await withCreator(fakeStellar({ verifyTip }))

    expect((await report(server)).statusCode).toBe(201)
    expect((await report(server)).statusCode).toBe(200)
    expect(verifyTip).toHaveBeenCalledTimes(1)
  })

  it('says "come back" when the chain cannot answer yet', async () => {
    const stellar = fakeStellar({ verifyTip: vi.fn(async () => { throw new ChainUnavailableError() }) })
    expect((await report(await withCreator(stellar))).statusCode).toBe(503)
  })

  it('refuses an Arc-style hash', async () => {
    const response = await report(await withCreator(fakeStellar()), { tx_hash: `0x${TX}` })
    expect(response.statusCode).toBe(400)
  })
})

describe('gifter wallets', () => {
  it('deploys a wallet for an owner key', async () => {
    const stellar = fakeStellar()
    const response = await app({ stellar }).inject({ method: 'POST', url: '/api/wallets', payload: { owner: OWNER } })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ wallet_address: WALLET, deployed: true, tx_hash: TX })
    expect(stellar.deployWallet).toHaveBeenCalledWith(OWNER)
  })

  it('refuses a contract address or a secret as the owner', async () => {
    for (const owner of [WALLET, `S${OWNER.slice(1)}`, '0xabc']) {
      const response = await app().inject({ method: 'POST', url: '/api/wallets', payload: { owner } })
      expect(response.statusCode).toBe(400)
    }
  })

  it('funds an empty wallet once', async () => {
    const stellar = fakeStellar()
    const response = await app({ stellar }).inject({
      method: 'POST',
      url: '/api/faucet',
      payload: { wallet_address: WALLET },
    })
    expect(response.statusCode).toBe(201)
    expect(response.json().amount).toBe('10.00')
  })

  it('gives nothing to a wallet that already has a dollar', async () => {
    const stellar = fakeStellar({ usdcBalance: vi.fn(async () => 1_000_000n) })
    const response = await app({ stellar }).inject({
      method: 'POST',
      url: '/api/faucet',
      payload: { wallet_address: WALLET },
    })
    expect(response.statusCode).toBe(409)
    expect(stellar.fund).not.toHaveBeenCalled()
  })
})

describe('the relay', () => {
  it('submits what the wallet signed', async () => {
    const stellar = fakeStellar()
    const response = await app({ stellar }).inject({
      method: 'POST',
      url: '/api/relay',
      payload: { func: 'AAAA', auth: ['BBBB'] },
    })
    expect(response.statusCode).toBe(201)
    expect(response.json().tx_hash).toBe(TX)
    expect(stellar.relay).toHaveBeenCalledWith('AAAA', ['BBBB'])
  })

  it('passes on a refusal as a 400 and a chain rejection as a 422', async () => {
    const refused = fakeStellar({ relay: vi.fn(async () => { throw new RelayRefusedError('No.') }) })
    const failed = fakeStellar({ relay: vi.fn(async () => { throw new TransactionFailedError('Over the cap.') }) })
    const payload = { func: 'AAAA', auth: [] }

    const a = await app({ stellar: refused }).inject({ method: 'POST', url: '/api/relay', payload })
    const b = await app({ stellar: failed }).inject({ method: 'POST', url: '/api/relay', payload })
    expect([a.statusCode, a.json().message]).toEqual([400, 'No.'])
    expect([b.statusCode, b.json().message]).toEqual([422, 'Over the cap.'])
  })
})

describe('verifying a channel and claiming', () => {
  async function start(options: { about?: string; stellar?: StellarGateway; now?: () => Date } = {}) {
    const server = app(options)
    const init = await server.inject({
      method: 'POST',
      url: '/api/creators/verify/init',
      payload: { handle: '@fireship' },
    })
    expect(init.statusCode).toBe(201)
    return { server, token: init.json().token as string }
  }

  it('issues a token and an instruction naming it', async () => {
    const { token } = await start()
    expect(token).toMatch(/^tipee-[0-9a-f]{16}$/)
  })

  it('refuses to verify until the token is on the channel page', async () => {
    const { server, token } = await start({ about: 'nothing here' })
    const response = await server.inject({ method: 'POST', url: '/api/creators/verify/confirm', payload: { token } })
    expect(response.statusCode).toBe(409)
  })

  it('verifies, then pays the escrow balance out once', async () => {
    const stellar = fakeStellar({ escrowBalance: vi.fn(async () => 10_000_000n) })
    // The About page must carry whichever token gets issued, so issue it first
    // on one app and check it on a second that shares the store.
    const store = memoryStore()
    const first = buildApp({ store, stellar, fetchImpl: fakeYouTube() })
    const init = await first.inject({ method: 'POST', url: '/api/creators/verify/init', payload: { handle: '@fireship' } })
    const token = init.json().token as string
    const live = buildApp({ store, stellar, fetchImpl: fakeYouTube(`Tips welcome ${token}`) })

    const confirm = await live.inject({ method: 'POST', url: '/api/creators/verify/confirm', payload: { token } })
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json()).toMatchObject({ verified: true, channel_id: CHANNEL, unclaimed_balance: '10.00' })

    const claim = await live.inject({
      method: 'POST',
      url: '/api/creators/claim',
      payload: { token, destination_address: CREATOR_DEST },
    })
    expect(claim.statusCode).toBe(201)
    expect(claim.json()).toEqual({ tx_hash: TX, amount_gross: '10.00', platform_fee: '0.40', amount_net: '9.60' })
    expect(stellar.claim).toHaveBeenCalledWith(CHANNEL, CREATOR_DEST)

    const again = await live.inject({
      method: 'POST',
      url: '/api/creators/claim',
      payload: { token, destination_address: CREATOR_DEST },
    })
    expect(again.statusCode).toBe(409)
    expect(stellar.claim).toHaveBeenCalledTimes(1)
  })

  it('will not claim on an unproven token', async () => {
    const { server, token } = await start({ stellar: fakeStellar({ escrowBalance: vi.fn(async () => 10_000_000n) }) })
    const claim = await server.inject({
      method: 'POST',
      url: '/api/creators/claim',
      payload: { token, destination_address: CREATOR_DEST },
    })
    expect(claim.statusCode).toBe(403)
  })

  it('expires a token after an hour', async () => {
    let clock = new Date('2026-10-12T10:00:00Z')
    const { server, token } = await start({ now: () => clock })
    clock = new Date(clock.getTime() + VERIFICATION_TTL_MS + 1)
    const response = await server.inject({ method: 'POST', url: '/api/creators/verify/confirm', payload: { token } })
    expect(response.statusCode).toBe(410)
  })
})
