import { createWalletSet } from '../circle.ts'
import { loadConfig } from '../config.ts'

/**
 * One-time setup: creates the wallet set every creator escrow derives from and
 * prints the ID to put in `CIRCLE_WALLET_SET_ID`.
 *
 * `CIRCLE_WALLET_SET_ID` is not read here, so this can run before it exists.
 */
const config = loadConfig({ ...process.env, CIRCLE_WALLET_SET_ID: process.env.CIRCLE_WALLET_SET_ID ?? 'pending' })

if (!config.circle) {
  console.error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required. Register the entity secret in Circle console first.')
  process.exit(1)
}

const walletSet = await createWalletSet(config.circle, process.argv[2] ?? 'Tipee creator escrows')

console.info(`Created wallet set "${walletSet.name}".`)
console.info(`CIRCLE_WALLET_SET_ID=${walletSet.id}`)
