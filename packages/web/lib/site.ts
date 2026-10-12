import { explorerTxUrl } from '@tipee/shared'

/** Every external link the site makes, in one place, so none of them can go stale alone. */
export const GITHUB_URL = 'https://github.com/mikemoulder/tipee'
export const RELEASE_URL = `${GITHUB_URL}/releases/latest`
/** Must match the asset name on the GitHub release (packages/extension/public/manifest.json version). */
export const EXTENSION_VERSION = '0.3.1'
export const RELEASE_ZIP = `${RELEASE_URL}/download/tipee-extension-${EXTENSION_VERSION}-stellar-testnet.zip`

/**
 * Real testnet transactions, made by the shipped code (README.md lists the same
 * ones). Nothing here is a sample: each opens on stellar.expert.
 */
export const RECEIPTS = [
  {
    what: 'Tip from the extension',
    detail: '1.50 USDC from a Tipee wallet, fee paid by Tipee',
    hash: 'ced71633597cba185edd52f58fd017331b137c788ea44ed0d02603fcf57fd5a1',
  },
  {
    what: 'Claim by a verified channel',
    detail: '2.00 USDC waiting, 1.92 to the creator, 0.08 to Tipee',
    hash: '6f4d036218e600fdc6cfd14f2e5a766e8ccd1296046ed8e58b3f7ae3c780fa09',
  },
].map((receipt) => ({ ...receipt, url: explorerTxUrl(receipt.hash) }))
