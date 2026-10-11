import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha512'
import { mnemonicToSeedSync } from '@scure/bip39'
import { Keypair } from '@stellar/stellar-sdk'

/**
 * The Stellar key a seed phrase stands for, per SEP-5: BIP-39 seed, then
 * SLIP-10 ed25519 derivation along `m/44'/148'/0'`.
 *
 * Following SEP-5 rather than inventing a path is what makes the 12 words
 * Tipee shows portable: the same phrase restores the same key in any Stellar
 * wallet that implements it, so a gifter is never locked into this extension.
 *
 * SLIP-10 for ed25519 only defines hardened children, which is why every
 * segment carries the `'`.
 */
export const SEP5_PATH = [44, 148, 0] as const

const HARDENED = 0x8000_0000

export function keypairFromMnemonic(mnemonic: string, account = 0): Keypair {
  const seed = mnemonicToSeedSync(mnemonic.trim())
  let { key, chainCode } = master(seed)
  for (const index of [SEP5_PATH[0], SEP5_PATH[1], account]) {
    ;({ key, chainCode } = child(key, chainCode, index + HARDENED))
  }
  return Keypair.fromRawEd25519Seed(key)
}

function master(seed: Uint8Array): { key: Uint8Array; chainCode: Uint8Array } {
  const out = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed)
  return { key: out.slice(0, 32), chainCode: out.slice(32) }
}

function child(key: Uint8Array, chainCode: Uint8Array, index: number): { key: Uint8Array; chainCode: Uint8Array } {
  const data = new Uint8Array(37)
  data[0] = 0
  data.set(key, 1)
  new DataView(data.buffer).setUint32(33, index >>> 0, false)
  const out = hmac(sha512, chainCode, data)
  return { key: out.slice(0, 32), chainCode: out.slice(32) }
}
