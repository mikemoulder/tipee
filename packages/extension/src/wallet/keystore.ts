import { wordlist } from '@scure/bip39/wordlists/english'
import { generateMnemonic, mnemonicToAccount } from 'viem/accounts'

import {
  assertValidPin,
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  KeystoreFormatError,
  PinError,
} from './crypto'

export interface WalletRecord {
  address: `0x${string}`
  encrypted: string
  /** Opt-in during setup (idea.md §3.1.1): erase the wallet after MAX_ATTEMPTS failures. */
  wipeOnMaxAttempts: boolean
}

export interface CreatedWallet extends WalletRecord {
  /**
   * The 12-word phrase, returned exactly once so onboarding can show it. It is
   * never persisted in the clear — only the AES-GCM ciphertext reaches storage.
   */
  mnemonic: string
}

/** Failures allowed at full speed before delays begin. */
export const FREE_ATTEMPTS = 3
/** Failure count at which an opted-in wallet is erased. */
export const MAX_ATTEMPTS = 10
/** Ceiling on the delay, so a locked-out owner is not shut out for hours. */
export const MAX_BACKOFF_MS = 5 * 60 * 1000

const STORAGE_KEY = 'tipee.wallet.v1'
const GUARD_KEY = 'tipee.pinGuard.v1'

/** Guessing throttle. Kept beside the wallet, never sent anywhere. */
export interface PinGuard {
  failedAttempts: number
  /** Epoch ms. `0` means unlocked. */
  lockedUntil: number
}

/** The wallet is throttled after repeated wrong PINs. */
export class WalletLockedError extends Error {
  override readonly name = 'WalletLockedError'
  readonly retryAfterMs: number

  constructor(retryAfterMs: number) {
    super(`Too many incorrect PINs. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`)
    this.retryAfterMs = retryAfterMs
  }
}

/** The wallet erased itself after MAX_ATTEMPTS, as the owner opted into at setup. */
export class WalletWipedError extends Error {
  override readonly name = 'WalletWipedError'

  constructor() {
    super('Too many incorrect PINs. This wallet has been erased — restore it from your seed phrase.')
  }
}

/**
 * Delay owed after `failedAttempts` consecutive failures.
 *
 * The first few are free, because the common case is a genuine typo. Past that
 * the delay doubles, which is what makes online guessing pointless: reaching a
 * fraction of a 6-digit space would take years of wall-clock time. This is the
 * defence the KDF cannot provide — see the threat model in `crypto.ts`.
 */
export function backoffMs(failedAttempts: number): number {
  if (failedAttempts <= FREE_ATTEMPTS) return 0
  const doublings = failedAttempts - FREE_ATTEMPTS - 1
  return Math.min(1000 * 2 ** doublings, MAX_BACKOFF_MS)
}

export async function hasWallet(): Promise<boolean> {
  return (await getStoredWallet()) !== null
}

export async function getWalletAddress(): Promise<string | null> {
  const record = await getStoredWallet()
  return record ? record.address : null
}

export async function readPinGuard(): Promise<PinGuard> {
  const result = await chrome.storage.local.get(GUARD_KEY)
  const guard = result[GUARD_KEY] as Partial<PinGuard> | undefined
  return {
    failedAttempts: typeof guard?.failedAttempts === 'number' ? guard.failedAttempts : 0,
    lockedUntil: typeof guard?.lockedUntil === 'number' ? guard.lockedUntil : 0,
  }
}

export async function createWalletRecord(
  pin: string,
  options: { wipeOnMaxAttempts?: boolean } = {},
): Promise<CreatedWallet> {
  // Delegates to the one validator in crypto.ts. A second inline check here
  // would drift from it — an earlier version accepted non-digits and had no
  // upper bound, so a PIN the keystore allowed could still be refused at the
  // point of encryption.
  assertValidPin(pin)

  const mnemonic = generateMnemonic(wordlist)
  const account = mnemonicToAccount(mnemonic)
  const encrypted = await encryptSecret(mnemonic, pin)
  const record: WalletRecord = {
    address: account.address,
    encrypted: JSON.stringify(encrypted),
    wipeOnMaxAttempts: options.wipeOnMaxAttempts ?? false,
  }

  await storeWallet(record)
  await resetPinGuard()
  return { ...record, mnemonic }
}

/**
 * Decrypts the seed phrase, subject to the guessing throttle.
 *
 * `now` is injectable so the backoff can be tested without sleeping.
 */
export async function unlockWallet(pin: string, now: number = Date.now()): Promise<string> {
  assertValidPin(pin)

  const record = await getStoredWallet()
  if (!record) {
    throw new Error('No wallet is set up for this browser.')
  }

  const guard = await readPinGuard()
  if (guard.lockedUntil > now) {
    throw new WalletLockedError(guard.lockedUntil - now)
  }

  const encrypted = JSON.parse(record.encrypted) as unknown
  if (!isEncryptedSecret(encrypted)) {
    throw new KeystoreFormatError('Stored wallet record is malformed.')
  }

  let mnemonic: string
  try {
    mnemonic = await decryptSecret(encrypted, pin)
  } catch (error) {
    if (error instanceof PinError) {
      await registerFailure(record, guard, now)
    }
    throw error
  }

  await resetPinGuard()
  return mnemonic
}

export async function wipeWallet(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEY, GUARD_KEY])
}

/**
 * Records a wrong PIN and applies the consequence.
 *
 * Throws `WalletWipedError` in place of the original `PinError` when the wallet
 * erases itself, because "wrong PIN" would badly understate what just happened.
 */
async function registerFailure(record: WalletRecord, guard: PinGuard, now: number): Promise<void> {
  const failedAttempts = guard.failedAttempts + 1

  if (failedAttempts >= MAX_ATTEMPTS && record.wipeOnMaxAttempts) {
    await wipeWallet()
    throw new WalletWipedError()
  }

  await chrome.storage.local.set({
    [GUARD_KEY]: { failedAttempts, lockedUntil: now + backoffMs(failedAttempts) },
  })
}

async function resetPinGuard(): Promise<void> {
  await chrome.storage.local.set({ [GUARD_KEY]: { failedAttempts: 0, lockedUntil: 0 } })
}

async function getStoredWallet(): Promise<WalletRecord | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const wallet = result[STORAGE_KEY]
  if (!wallet || typeof wallet !== 'object') return null

  const maybe = wallet as Partial<WalletRecord>
  if (typeof maybe.address !== 'string' || typeof maybe.encrypted !== 'string') return null

  return {
    address: maybe.address as `0x${string}`,
    encrypted: maybe.encrypted,
    wipeOnMaxAttempts: maybe.wipeOnMaxAttempts === true,
  }
}

async function storeWallet(record: WalletRecord): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: record })
}
