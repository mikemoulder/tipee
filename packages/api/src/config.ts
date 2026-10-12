/**
 * Configuration, read once and complained about immediately.
 *
 * A backend that starts without its relayer key and only discovers it when the
 * first gifter tries to tip has turned a deployment mistake into somebody's
 * failed tip. Anything missing is either fatal at boot or absent by design and
 * named as such.
 */
import { STELLAR_RPC_URL } from '@tipee/shared'

export interface Config {
  port: number
  /** `127.0.0.1` behind a reverse proxy; `0.0.0.0` (the default) to listen everywhere. */
  host: string
  /** Null runs the in-memory store: fine for a demo, since the chain is the record. */
  databaseUrl: string | null
  rpcUrl: string
  /** Pays every fee, deploys wallets, funds the faucet. Required. */
  relayerSecret: string
  /** The escrow's verifier. Null disables claims, and says so. */
  verifierSecret: string | null
  /** Where the escrow sends its fee; shown on claim receipts. */
  treasuryAddress: string | null
  /** Testnet USDC handed to a new wallet, accounting units as a decimal string. */
  faucetAmount: string
  /** Where creator accounts (passkeys, payout addresses) are kept. */
  accountsFile: string
  /** Site origins whose passkeys this API accepts. Empty turns creator accounts off. */
  siteOrigins: string[]
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port <= 0) throw new ConfigError('PORT must be a positive integer.')

  const relayerSecret = env.RELAYER_SECRET?.trim()
  if (!relayerSecret || !/^S[A-Z2-7]{55}$/.test(relayerSecret)) {
    throw new ConfigError('RELAYER_SECRET is required: the secret key (S…) of the account that pays fees.')
  }

  const verifierSecret = env.VERIFIER_SECRET?.trim() || null
  if (verifierSecret && !/^S[A-Z2-7]{55}$/.test(verifierSecret)) {
    throw new ConfigError('VERIFIER_SECRET must be a Stellar secret key (S…).')
  }

  return {
    port,
    host: env.HOST?.trim() || '0.0.0.0',
    databaseUrl: env.DATABASE_URL?.trim() || null,
    rpcUrl: env.STELLAR_RPC_URL?.trim() || STELLAR_RPC_URL,
    relayerSecret,
    verifierSecret,
    treasuryAddress: env.TREASURY_ADDRESS?.trim() || null,
    faucetAmount: env.FAUCET_AMOUNT?.trim() || '10',
    accountsFile: env.ACCOUNTS_FILE?.trim() || `${env.HOME ?? '.'}/.local/share/tipee/accounts.json`,
    siteOrigins: (env.SITE_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  }
}
