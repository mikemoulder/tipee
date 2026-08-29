import { afterEach, describe, expect, it } from 'vitest'

import { PinError } from './crypto'
import { createWalletRecord, hasWallet, unlockWallet } from './keystore'

function stubStorage(): { get: (key: string) => Promise<Record<string, unknown>>; set: (value: Record<string, unknown>) => Promise<void> } {
  const store: Record<string, unknown> = {}
  return {
    async get(key: string) {
      return { [key]: store[key] ?? null }
    },
    async set(value: Record<string, unknown>) {
      Object.assign(store, value)
    },
  }
}

describe('wallet keystore', () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome
  })

  it('creates, persists, and unlocks a wallet with a valid PIN', async () => {
    const storage = stubStorage() as any
    ;(globalThis as any).chrome = {
      storage: { local: storage },
    }

    const wallet = await createWalletRecord('123456')
    const unlocked = await unlockWallet('123456')
    const stored = await (globalThis as any).chrome.storage.local.get('tipee.wallet.v1')

    expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(unlocked.split(' ').length).toBe(12)
    expect(unlocked).toMatch(/^[a-z]+(?: [a-z]+){11}$/)
    expect(await hasWallet()).toBe(true)
    expect(stored['tipee.wallet.v1']).toMatchObject({ address: wallet.address })
    expect(stored['tipee.wallet.v1'].mnemonic).toBeUndefined()
  })

  it('rejects a wrong PIN before returning plaintext', async () => {
    const storage = stubStorage() as any
    ;(globalThis as any).chrome = {
      storage: { local: storage },
    }

    await createWalletRecord('123456')
    await expect(unlockWallet('654321')).rejects.toBeInstanceOf(PinError)
  })
})
