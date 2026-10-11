/**
 * Stellar testnet: the facts every package agrees on.
 *
 * Tipee runs on three contracts and one account (see `contracts/` and the
 * handoff's *Stellar Facts*):
 *
 * - **USDC**, Circle's testnet asset, reached through its Stellar Asset
 *   Contract. A contract address holds it without a trustline or an XLM
 *   reserve, which is the whole reason gifter wallets are contract accounts.
 * - **The escrow**, which holds tips by YouTube channel ID until the creator
 *   claims. One contract for every creator; nobody is provisioned a wallet.
 * - **The wallet**: an OpenZeppelin smart account, deployed once per gifter
 *   from the account code `stellar/smart-account-kit` uploaded to testnet. Its
 *   default context rule holds one signer, `External(Ed25519 verifier, key)`,
 *   where the key is the one the extension derives from the seed phrase and
 *   keeps PIN-encrypted.
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
/**
 * OpenZeppelin smart-account contracts on testnet, as recorded by
 * `stellar/smart-account-kit` in docs/deployments-protocol-27-2026-07-09.md
 * (built from OpenZeppelin/stellar-contracts@1e513890).
 */
export const WALLET_WASM_HASH = '1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a'
export const ED25519_VERIFIER_ID = 'CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4'
export const WEBAUTHN_VERIFIER_ID = 'CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F'
export const SPENDING_LIMIT_POLICY_ID = 'CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQQ63UYFSO7WUU2TIP5G'

/** The account's default context rule, created by its constructor. */
export const DEFAULT_CONTEXT_RULE_ID = 0
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
