import { ESCROW_CONTRACT_ID, STELLAR_EXPLORER, USDC_CONTRACT_ID, explorerTxUrl } from '@tipee/shared'

/** Every external link the site makes, in one place, so none of them can go stale alone. */
export const GITHUB_URL = 'https://github.com/mikemoulder/tipee'
export const RELEASE_URL = `${GITHUB_URL}/releases/latest`
export const RELEASE_ZIP = `${RELEASE_URL}/download/tipee-extension-0.3.0-stellar-testnet.zip`
export const SMART_ACCOUNT_KIT_URL = 'https://github.com/stellar/smart-account-kit'

export const contractUrl = (id: string) => `${STELLAR_EXPLORER}/contract/${id}`
export const ESCROW_URL = contractUrl(ESCROW_CONTRACT_ID)
export const USDC_URL = contractUrl(USDC_CONTRACT_ID)

/** Shortens a 56-char address or 64-char hash to its ends, the way explorers do. */
export function short(value: string, head = 6, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`
}

/**
 * Real testnet transactions, made by the shipped code (README.md lists the same
 * ones). Nothing here is a sample: each opens on stellar.expert.
 */
export const RECEIPTS = [
  {
    what: 'Tip from the extension',
    detail: '1.50 USDC from an OpenZeppelin smart account. The relayer paid the fee',
    hash: 'ced71633597cba185edd52f58fd017331b137c788ea44ed0d02603fcf57fd5a1',
  },
  {
    what: 'Claim by a verified channel',
    detail: '2.00 USDC in escrow, 1.92 to the creator, 0.08 to the treasury, one transaction',
    hash: '6f4d036218e600fdc6cfd14f2e5a766e8ccd1296046ed8e58b3f7ae3c780fa09',
  },
  {
    what: 'First smart-wallet tip',
    detail: '2.00 USDC from a wallet holding no XLM and no trustline',
    hash: '9ee6ea9d868ac14e3ee82562b773a59c16bbc48f0ffeb21b8ad839308d0699f6',
  },
].map((receipt) => ({ ...receipt, url: explorerTxUrl(receipt.hash) }))

export { ESCROW_CONTRACT_ID, USDC_CONTRACT_ID }
