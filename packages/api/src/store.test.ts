import { describe, expect, it, vi } from 'vitest'

import { formatUnits, memoryStore, parseUnits } from './store.ts'
import { createWalletSet, entitySecretCiphertext, fakeEscrow, idempotencyKeyFor } from './circle.ts'

const CHANNEL = 'UCsBjURrPoezykLs9EqgamOA'

describe('money in and out of Postgres', () => {
  it('reads numeric as exact units, never through a float', () => {
    // `pg` hands `numeric` back as a string for exactly this reason, and one
    // `Number()` on the way past would undo it.
    expect(parseUnits('12.500000')).toBe(12_500_000n)
    expect(parseUnits('0.000001')).toBe(1n)
    expect(parseUnits('0')).toBe(0n)
    expect(parseUnits('-3.250000')).toBe(-3_250_000n)
  })

  it('survives a figure a double could not hold', () => {
    expect(parseUnits('9007199254.740993')).toBe(9_007_199_254_740_993n)
  })

  it('writes back what it read', () => {
    for (const value of ['12.500000', '0.000001', '0.000000', '9007199254.740993']) {
      expect(formatUnits(parseUnits(value))).toBe(value)
    }
  })
})

describe('the store, in memory', () => {
  const creator = {
    youtubeChannelId: CHANNEL,
    youtubeHandle: '@fireship',
    displayName: 'Fireship',
    avatarUrl: null,
    circleWalletId: 'wallet-1',
    walletAddress: '0xaaaa000000000000000000000000000000000001',
  }

  it('returns the existing creator rather than a second one for the same channel', async () => {
    const store = memoryStore()
    const first = await store.upsertCreator(creator)
    const second = await store.upsertCreator({ ...creator, circleWalletId: 'wallet-2', walletAddress: '0xbbbb' })

    expect(second.id).toBe(first.id)
    expect(second.walletAddress).toBe(first.walletAddress)
  })

  it('refreshes the name and handle that drift, and not the wallet', async () => {
    const store = memoryStore()
    const before = await store.upsertCreator(creator)
    const after = await store.upsertCreator({ ...creator, youtubeHandle: '@fireship2', displayName: 'Fireship Live' })

    expect(after.youtubeHandle).toBe('@fireship2')
    expect(after.displayName).toBe('Fireship Live')
    expect(after.walletAddress).toBe(before.walletAddress)
  })

  it('records a transaction once', async () => {
    const store = memoryStore()
    const { id } = await store.upsertCreator(creator)
    const tip = { creatorId: id, gifterAddress: null, amount: 2_000_000n, txHash: `0x${'ab'.repeat(32)}`, status: 'confirmed' as const }

    const first = await store.recordTip(tip)
    const second = await store.recordTip({ ...tip, amount: 999_000_000n })

    expect(second.id).toBe(first.id)
    expect(await store.unclaimedBalance(id)).toBe(2_000_000n)
  })

  it('counts only confirmed tips towards a balance', async () => {
    // A pending tip is a claim about the chain, not money a creator can take.
    const store = memoryStore()
    const { id } = await store.upsertCreator(creator)

    await store.recordTip({ creatorId: id, gifterAddress: null, amount: 1_000_000n, txHash: `0x${'11'.repeat(32)}`, status: 'confirmed' })
    await store.recordTip({ creatorId: id, gifterAddress: null, amount: 5_000_000n, txHash: `0x${'22'.repeat(32)}`, status: 'pending' })
    await store.recordTip({ creatorId: id, gifterAddress: null, amount: 9_000_000n, txHash: `0x${'33'.repeat(32)}`, status: 'failed' })

    expect(await store.unclaimedBalance(id)).toBe(1_000_000n)
  })
})

describe('asking Circle for an escrow', () => {
  it('asks with the same key for the same channel, so a retry cannot create two', async () => {
    // A timeout on wallet creation is common and a second escrow for one
    // creator would silently split their tips across two addresses.
    expect(idempotencyKeyFor(CHANNEL)).toBe(idempotencyKeyFor(CHANNEL))
    expect(idempotencyKeyFor(CHANNEL)).not.toBe(idempotencyKeyFor('UCaaaaaaaaaaaaaaaaaaaaaa'))
  })

  it('produces the UUID shape Circle requires', () => {
    expect(idempotencyKeyFor(CHANNEL)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('hands back an address-shaped wallet in the stand-in', async () => {
    const wallet = await fakeEscrow().create(CHANNEL)
    expect(wallet.address).toMatch(/^0x[0-9a-f]{40}$/i)
    expect(wallet.walletId).toHaveLength(36)
  })
})

describe('creating the wallet set', () => {
  const config = {
    apiKey: 'TEST_API_KEY:1:2',
    entitySecret: 'ab'.repeat(32),
    walletSetId: 'pending',
    blockchain: 'ARC-TESTNET',
  }

  /** Answers Circle's public-key call, then whatever the test wants. */
  function circleAnswering(second: unknown, ok = true): typeof fetch {
    const { generateKeyPairSync } = require('node:crypto') as typeof import('node:crypto')
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

    let call = 0
    return vi.fn(async () => {
      call += 1
      return call === 1
        ? { ok: true, status: 200, json: async () => ({ data: { publicKey: pem } }) }
        : { ok, status: ok ? 201 : 400, json: async () => second }
    }) as unknown as typeof fetch
  }

  it('returns the ID that goes in CIRCLE_WALLET_SET_ID', async () => {
    const fetchImpl = circleAnswering({ data: { walletSet: { id: 'ws-1', name: 'Tipee creator escrows' } } })
    const set = await createWalletSet(config, 'Tipee creator escrows', fetchImpl)

    expect(set).toEqual({ id: 'ws-1', name: 'Tipee creator escrows' })
  })

  it('encrypts the entity secret rather than sending it', async () => {
    // Circle never stores it, and a secret in a request body is a secret in
    // every log between here and them.
    const fetchImpl = circleAnswering({ data: { walletSet: { id: 'ws-1' } } })
    await createWalletSet(config, 'Tipee', fetchImpl)

    const body = String(vi.mocked(fetchImpl).mock.calls[1]?.[1]?.body)
    expect(body).not.toContain(config.entitySecret)
    expect(JSON.parse(body).entitySecretCiphertext).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(JSON.parse(body).idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('refuses an answer with no wallet set in it', async () => {
    const fetchImpl = circleAnswering({ data: {} })
    await expect(createWalletSet(config, 'Tipee', fetchImpl)).rejects.toThrow('did not return a wallet set')
  })

  it('refuses an entity secret that is not 32 bytes', async () => {
    const short = { ...config, entitySecret: 'abcd' }
    await expect(createWalletSet(short, 'Tipee', circleAnswering({}))).rejects.toThrow('32 bytes of hex')
  })
})

describe('encrypting the entity secret for Circle', () => {
  it('produces something Circle can decrypt back to the exact secret', async () => {
    // The padding and hash are the whole contract. If either is wrong, Circle
    // fails with an error that says nothing about which — so it is checked here
    // by decrypting with the matching private key.
    const { generateKeyPairSync, privateDecrypt, constants } = await import('node:crypto')
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

    const entitySecret = 'a3'.repeat(32)
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { publicKey: pem } }),
    })) as unknown as typeof fetch

    const ciphertext = await entitySecretCiphertext({ apiKey: 'TEST:1:2', entitySecret }, fetchImpl)

    const decrypted = privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(ciphertext, 'base64'),
    )

    expect(decrypted.toString('hex')).toBe(entitySecret)
  })

  it('asks Circle for the key with the API key, and asks every time', async () => {
    // Circle rejects a reused ciphertext, so nothing here may be cached.
    const { generateKeyPairSync } = await import('node:crypto')
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { publicKey: pem } }) })) as unknown as typeof fetch

    const config = { apiKey: 'TEST:1:2', entitySecret: 'b4'.repeat(32) }
    const first = await entitySecretCiphertext(config, fetchImpl)
    const second = await entitySecretCiphertext(config, fetchImpl)

    expect(first).not.toBe(second)
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe('https://api.circle.com/v1/w3s/config/entity/publicKey')
    expect((vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers as Record<string, string>).authorization).toBe(
      'Bearer TEST:1:2',
    )
  })
})
