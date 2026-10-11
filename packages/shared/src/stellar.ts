/**
 * Stellar testnet: the facts every package agrees on.
 *
 * Tipee runs on three contracts and one account (see `contracts/` and the
 * handoff's *Stellar Facts*):
 *
 * - **USDC**, Circle's testnet asset, reached through its Stellar Asset
 *   Contract. A contract address holds it without a trustline or an XLM
 *   reserve, which is the whole reason gifter wallets are contracts.
 * - **The escrow**, which holds tips by YouTube channel ID until the creator
 *   claims. One contract for every creator; nobody is provisioned a wallet.
 * - **The wallet code**, deployed once per gifter. Its owner is the ed25519 key
 *   the extension derives from the seed phrase and keeps PIN-encrypted.
 * - **The relayer**, a plain account that submits every transaction and pays
 *   every fee, and deploys each gifter's wallet. Gifters never hold XLM.
 *
 * No runtime dependencies, like the rest of this package: anything that needs
 * the Stellar SDK lives in the extension or the API.
 */

import { USDC_DECIMALS, scaleUnits } from './usdc.ts'

export const STELLAR_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015'
export const STELLAR_RPC_URL = 'https://soroban-testnet.stellar.org'
export const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet'

export const USDC_ASSET_CODE = 'USDC'
export const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
export const USDC_CONTRACT_ID = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'

export const ESCROW_CONTRACT_ID = 'CB7OEDRTDDPLG37HWY76OQQYOO56P3R3CAAWX5IUSJXIAC3IDZ7OKGUV'
export const WALLET_WASM_HASH = '611b9ad888839007cdc9726151475bf79f6a7e4e780fad739c87dd6fce1ce9a2'
export const RELAYER_ADDRESS = 'GCBOETCF6JUQIVT46TOINOEESGRK536Q3DNS57BNNKDQJ24A4RAEA27L'

/**
 * USDC on Stellar has 7 decimal places. Accounting everywhere else in Tipee
 * stays at 6 (`USDC_DECIMALS`), so the fee math, the database columns and the
 * wire format did not move when the chain did. The chain layer converts at the
 * boundary and nowhere else.
 */
export const STELLAR_USDC_DECIMALS = 7

/**
 * Accounting units → stroops. Exact: going up a decimal place never loses
 * anything, which is why amounts that are *sent* are always converted this way.
 */
export function toStroops(amount: bigint): bigint {
  return scaleUnits(amount, USDC_DECIMALS, STELLAR_USDC_DECIMALS)
}

/**
 * Stroops → accounting units, truncated. Only for *display and validation of
 * balances*: a wallet holding 1.2345678 USDC can spend 1.234567 of it, and the
 * stray 0.0000008 stays behind rather than being rounded into existence.
 */
export function fromStroops(amount: bigint): bigint {
  return scaleUnits(amount, STELLAR_USDC_DECIMALS, USDC_DECIMALS)
}

/** StrKey shape: a version letter and 55 base32 characters. */
const STRKEY_RE = /^[A-Z2-7]{56}$/

/**
 * A Stellar account (`G…`) or contract (`C…`) address, by shape.
 *
 * Shape only: the checksum is checked where the SDK is available
 * (`StrKey.isValid…`), because this package carries no dependencies. Shape is
 * enough to refuse an Arc `0x…` address or a typo'd paste before it reaches the
 * code that does the full check.
 */
export function isStellarAddress(value: unknown): value is string {
  return typeof value === 'string' && STRKEY_RE.test(value) && (value[0] === 'G' || value[0] === 'C')
}

export function isContractAddress(value: unknown): value is string {
  return isStellarAddress(value) && value[0] === 'C'
}

export function explorerTxUrl(hash: string): string {
  return `${STELLAR_EXPLORER}/tx/${hash}`
}

export function explorerAccountUrl(address: string): string {
  return `${STELLAR_EXPLORER}/${address.startsWith('C') ? 'contract' : 'account'}/${address}`
}
