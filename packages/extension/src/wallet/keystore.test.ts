import { StrKey } from '@stellar/stellar-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { walletAddressFor } from '../chain/stellar'
import { InvalidPinError, PinError } from './crypto'
import { keypairFromMnemonic } from './sep5'

// Every wallet operation here runs real PBKDF2 at 600k iterations, which is
// the point — the cost is the security property, so it cannot be mocked away.
// That puts the file around 4s on its own and past the 5s default when it runs
// alongside the rest of the suite, which showed up as intermittent failures
// that passed on a re-run. The budget is raised rather than the work reduced.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import {
  backoffMs,
  createWalletRecord,
  FREE_ATTEMPTS,
  getWalletAddress,
  hasWallet,
  MAX_ATTEMPTS,
  MAX_BACKOFF_MS,
  readPinGuard,
  unlockWallet,
  WalletLockedError,
  WalletWipedError,
} from './keystore'

const GUARD_KEY = 'tipee.pinGuard.v1'
const WALLET_KEY = 'tipee.wallet.v2'
const PIN = '123456'
const WRONG_PIN = '654321'

/** Stands in for chrome.storage.local, including the `remove` the wipe path needs. */
function installStorage(): Record<string, unknown> {
  const store: Record<string, unknown> = {}
  const area = {
    async get(key: string) {
      return { [key]: store[key] ?? null }
    },
    async set(value: Record<string, unknown>) {
      Object.assign(store, value)
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key]
    },
  }
  // Only the three methods the keystore actually calls are implemented. The
  // cast is confined to this one line so production code stays fully typed.
  const fake = { storage: { local: area } } as unknown as typeof chrome
  ;(globalThis as typeof globalThis & { chrome?: unknown }).chrome = fake
  return store
}

let store: Record<string, unknown>

beforeEach(() => {
  store = installStorage()
})

afterEach(() => {
  delete (globalThis as typeof globalThis & { chrome?: unknown }).chrome
})

describe('wallet creation', () => {
  it('creates, persists, and unlocks a wallet with a valid PIN', async () => {
    const wallet = await createWalletRecord(PIN)
    const unlocked = await unlockWallet(PIN)

    // The wallet is a contract whose address follows from the owner key, and
    // the owner key from the phrase: all three agree, offline.
    expect(StrKey.isValidContract(wallet.address)).toBe(true)
    expect(keypairFromMnemonic(wallet.mnemonic).publicKey()).toBe(wallet.owner)
    expect(walletAddressFor(wallet.owner)).toBe(wallet.address)
    expect(unlocked).toBe(wallet.mnemonic)
    expect(unlocked).toMatch(/^[a-z]+(?: [a-z]+){11}$/)
    expect(await hasWallet()).toBe(true)
    expect(await getWalletAddress()).toBe(wallet.address)
  })

  it('never writes the seed phrase in the clear', async () => {
    const wallet = await createWalletRecord(PIN)
    const persisted = store[WALLET_KEY] as Record<string, unknown>

    expect(persisted.mnemonic).toBeUndefined()
    expect(JSON.stringify(persisted)).not.toContain(wallet.mnemonic)
    // Not even a single word of it.
    expect(JSON.stringify(persisted)).not.toContain(wallet.mnemonic.split(' ')[0])
  })

  it('applies the same PIN rules as the crypto layer', async () => {
    // Previously the keystore had its own weaker check, so a PIN it accepted
    // could still be refused one call later.
    await expect(createWalletRecord('12345')).rejects.toBeInstanceOf(InvalidPinError)
    await expect(createWalletRecord('abcdef')).rejects.toBeInstanceOf(InvalidPinError)
    await expect(createWalletRecord('12345a')).rejects.toBeInstanceOf(InvalidPinError)
    await expect(createWalletRecord('1'.repeat(33))).rejects.toBeInstanceOf(InvalidPinError)
  })
})

describe('backoffMs', () => {
  it('lets the first few typos through at full speed', () => {
    for (let attempt = 0; attempt <= FREE_ATTEMPTS; attempt++) {
      expect(backoffMs(attempt)).toBe(0)
    }
  })

  it('doubles from one second once the free attempts are spent', () => {
    expect(backoffMs(4)).toBe(1_000)
    expect(backoffMs(5)).toBe(2_000)
    expect(backoffMs(6)).toBe(4_000)
    expect(backoffMs(7)).toBe(8_000)
  })

  it('caps, so a legitimate owner is not locked out for hours', () => {
    expect(backoffMs(50)).toBe(MAX_BACKOFF_MS)
    expect(backoffMs(1_000)).toBe(MAX_BACKOFF_MS)
  })
})

describe('wrong PIN handling', () => {
  it('rejects a wrong PIN before returning plaintext', async () => {
    await createWalletRecord(PIN)
    await expect(unlockWallet(WRONG_PIN)).rejects.toBeInstanceOf(PinError)
  })

  it('counts failures', async () => {
    await createWalletRecord(PIN)
    await expect(unlockWallet(WRONG_PIN)).rejects.toBeInstanceOf(PinError)

    expect((await readPinGuard()).failedAttempts).toBe(1)
  })

  it('starts delaying once the free attempts are spent', async () => {
    await createWalletRecord(PIN)
    store[GUARD_KEY] = { failedAttempts: FREE_ATTEMPTS, lockedUntil: 0 }

    await expect(unlockWallet(WRONG_PIN, 1_000)).rejects.toBeInstanceOf(PinError)

    const guard = await readPinGuard()
    expect(guard.failedAttempts).toBe(FREE_ATTEMPTS + 1)
    expect(guard.lockedUntil).toBe(1_000 + backoffMs(FREE_ATTEMPTS + 1))
  })

  it('refuses even the correct PIN while the delay is running', async () => {
    await createWalletRecord(PIN)
    store[GUARD_KEY] = { failedAttempts: 5, lockedUntil: 10_000 }

    await expect(unlockWallet(PIN, 9_000)).rejects.toBeInstanceOf(WalletLockedError)
    // ...and says how long is left, so the UI can count down.
    await expect(unlockWallet(PIN, 9_000)).rejects.toMatchObject({ retryAfterMs: 1_000 })
  })

  it('unlocks again once the delay has passed, and clears the record', async () => {
    const wallet = await createWalletRecord(PIN)
    store[GUARD_KEY] = { failedAttempts: 5, lockedUntil: 10_000 }

    expect(await unlockWallet(PIN, 10_001)).toBe(wallet.mnemonic)
    expect(await readPinGuard()).toEqual({ failedAttempts: 0, lockedUntil: 0 })
  })
})

describe('opt-in wipe', () => {
  it('erases the wallet at the limit when the owner opted in', async () => {
    await createWalletRecord(PIN, { wipeOnMaxAttempts: true })
    store[GUARD_KEY] = { failedAttempts: MAX_ATTEMPTS - 1, lockedUntil: 0 }

    await expect(unlockWallet(WRONG_PIN, 1_000)).rejects.toBeInstanceOf(WalletWipedError)
    expect(await hasWallet()).toBe(false)
    expect(store[GUARD_KEY]).toBeUndefined()
  })

  it('keeps the wallet when the owner did not opt in', async () => {
    await createWalletRecord(PIN, { wipeOnMaxAttempts: false })
    store[GUARD_KEY] = { failedAttempts: MAX_ATTEMPTS - 1, lockedUntil: 0 }

    await expect(unlockWallet(WRONG_PIN, 1_000)).rejects.toBeInstanceOf(PinError)
    expect(await hasWallet()).toBe(true)
  })

  it('defaults to not wiping', async () => {
    await createWalletRecord(PIN)
    store[GUARD_KEY] = { failedAttempts: MAX_ATTEMPTS - 1, lockedUntil: 0 }

    await expect(unlockWallet(WRONG_PIN, 1_000)).rejects.toBeInstanceOf(PinError)
    expect(await hasWallet()).toBe(true)
  })
})
