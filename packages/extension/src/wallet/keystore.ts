import { wordlist } from '@scure/bip39/wordlists/english'
import { generateMnemonic, mnemonicToAccount } from 'viem/accounts'

import { decryptSecret, encryptSecret, isEncryptedSecret, KeystoreFormatError } from './crypto'

export interface WalletRecord {
  address: `0x${string}`
  encrypted: string
}

export interface CreatedWallet extends WalletRecord {
  mnemonic: string
}

const STORAGE_KEY = 'tipee.wallet.v1'

export async function hasWallet(): Promise<boolean> {
  const record = await getStoredWallet()
  return record !== null
}

export async function getWalletAddress(): Promise<string | null> {
  const record = await getStoredWallet()
  return record ? record.address : null
}

export async function createWalletRecord(pin: string): Promise<CreatedWallet> {
  if (typeof pin !== 'string' || pin.length < 6) {
    throw new Error('PIN must be at least 6 digits.')
  }

  const mnemonic = generateMnemonic(wordlist)
  const account = mnemonicToAccount(mnemonic)
  const encrypted = await encryptSecret(mnemonic, pin)
  const record: CreatedWallet = {
    mnemonic,
    address: account.address,
    encrypted: JSON.stringify(encrypted),
  }

  await storeWallet({ address: record.address, encrypted: record.encrypted })
  return record
}

export async function unlockWallet(pin: string): Promise<string> {
  const record = await getStoredWallet()
  if (!record) {
    throw new Error('No wallet is set up for this browser.')
  }

  const encrypted = JSON.parse(record.encrypted) as unknown
  if (!isEncryptedSecret(encrypted)) {
    throw new KeystoreFormatError('Stored wallet record is malformed.')
  }

  return decryptSecret(encrypted, pin)
}

async function getStoredWallet(): Promise<WalletRecord | null> {
  const storage = chrome.storage.local
  const result = await storage.get(STORAGE_KEY)
  const wallet = result[STORAGE_KEY]
  if (!wallet || typeof wallet !== 'object') {
    return null
  }

  const maybe = wallet as Partial<WalletRecord>
  if (typeof maybe.address !== 'string' || typeof maybe.encrypted !== 'string') {
    return null
  }

  return {
    address: maybe.address as `0x${string}`,
    encrypted: maybe.encrypted,
  }
}

async function storeWallet(record: WalletRecord): Promise<void> {
  const storage = chrome.storage.local
  await storage.set({ [STORAGE_KEY]: record })
}
