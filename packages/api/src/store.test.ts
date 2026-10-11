import { describe, expect, it } from 'vitest'

import { formatUnits, memoryStore, parseUnits } from './store.ts'

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
  }

  it('returns the existing creator rather than a second one for the same channel', async () => {
    const store = memoryStore()
    const first = await store.upsertCreator(creator)
    const second = await store.upsertCreator(creator)
    expect(second.id).toBe(first.id)
  })

  it('refreshes the name and handle that drift', async () => {
    const store = memoryStore()
    await store.upsertCreator(creator)
    const after = await store.upsertCreator({ ...creator, youtubeHandle: '@fireship2', displayName: 'Fireship Live' })
    expect(after.youtubeHandle).toBe('@fireship2')
    expect(after.displayName).toBe('Fireship Live')
  })

  it('records a transaction once, keeping the first amount', async () => {
    const store = memoryStore()
    const { id } = await store.upsertCreator(creator)
    const tip = { creatorId: id, gifterAddress: null, amount: 2_000_000n, txHash: 'ab'.repeat(32), status: 'confirmed' as const }

    const first = await store.recordTip(tip)
    const second = await store.recordTip({ ...tip, amount: 999_000_000n })

    expect(second.id).toBe(first.id)
    expect(second.amount).toBe(2_000_000n)
  })

  it('spends a verification token exactly once', async () => {
    const store = memoryStore()
    const { id } = await store.upsertCreator(creator)
    const token = await store.createVerification(id, 'tipee-0123456789abcdef', new Date(Date.now() + 60_000))

    await store.markVerified(token.id, id)
    expect((await store.verificationByToken(token.token))?.verifiedAt).toBeInstanceOf(Date)
    expect((await store.creatorById(id))?.isVerified).toBe(true)

    expect(await store.useVerification(token.id)).toBe(true)
    expect(await store.useVerification(token.id)).toBe(false)
  })
})
