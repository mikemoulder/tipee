// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JOURNAL_LIMIT, recordTip, tipLabels, tipRecords, type TipRecord } from './journal'

const ESCROW = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' as const

function tip(overrides: Partial<TipRecord> = {}): TipRecord {
  return {
    txHash: `0x${'ab'.repeat(32)}`,
    handle: '@creator',
    displayName: 'A Creator',
    recipient: ESCROW,
    amount: '2500000',
    at: 1_756_900_000_000,
    ...overrides,
  }
}

function fakeStorage(): Record<string, unknown> {
  const store: Record<string, unknown> = {}
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (values: Record<string, unknown>) => Object.assign(store, values),
      },
    },
  })
  return store
}

beforeEach(() => vi.unstubAllGlobals())

describe('the tip journal', () => {
  it('remembers who a transaction paid', async () => {
    fakeStorage()
    await recordTip(tip())

    const labels = await tipLabels()
    expect(labels.byHash.get(`0x${'ab'.repeat(32)}`)?.handle).toBe('@creator')
    expect(labels.byRecipient.get(ESCROW.toLowerCase())?.displayName).toBe('A Creator')
  })

  it('keeps the newest note for a transaction that is recorded twice', async () => {
    fakeStorage()
    await recordTip(tip({ handle: '@first' }))
    await recordTip(tip({ handle: '@second' }))

    const records = await tipRecords()
    expect(records).toHaveLength(1)
    expect(records[0]?.handle).toBe('@second')
  })

  it('keeps the newest note for an escrow paid more than once', async () => {
    fakeStorage()
    await recordTip(tip({ txHash: `0x${'11'.repeat(32)}`, handle: '@older' }))
    await recordTip(tip({ txHash: `0x${'22'.repeat(32)}`, handle: '@newer' }))

    expect((await tipLabels()).byRecipient.get(ESCROW.toLowerCase())?.handle).toBe('@newer')
  })

  it('stops growing, so a heavy tipper cannot fill storage', async () => {
    fakeStorage()
    for (let index = 0; index < JOURNAL_LIMIT + 5; index += 1) {
      await recordTip(tip({ txHash: `0x${index.toString(16).padStart(64, '0')}` }))
    }

    expect(await tipRecords()).toHaveLength(JOURNAL_LIMIT)
  })

  it('ignores anything in storage that is not a note', async () => {
    // Extension storage is writable by anything sharing this origin.
    const store = fakeStorage()
    store['tipee.tips.v1'] = [tip(), { handle: '@nope' }, null, 'garbage']

    expect(await tipRecords()).toHaveLength(1)
  })

  it('never fails a tip that has already been sent', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async () => {
            throw new Error('storage gone')
          },
          set: async () => {
            throw new Error('storage gone')
          },
        },
      },
    })

    await expect(recordTip(tip())).resolves.toBeUndefined()
    await expect(tipRecords()).resolves.toEqual([])
  })
})
