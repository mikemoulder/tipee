/**
 * Configuration, read once and complained about immediately.
 *
 * A backend that starts without its Circle credentials and only discovers it
 * when the first creator needs an escrow wallet has turned a deployment mistake
 * into somebody's failed tip. Anything missing is either fatal at boot or
 * absent by design and named as such.
 */
export interface CircleConfig {
  apiKey: string
  entitySecret: string
  walletSetId: string
  /** Circle's code for Arc's testnet. Arc has no mainnet at Circle yet. */
  blockchain: string
}

export interface Config {
  port: number
  databaseUrl: string
  /** Null when Circle is not configured — escrow provisioning then fails closed. */
  circle: CircleConfig | null
  treasuryAddress: string | null
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new ConfigError('DATABASE_URL is required.')

  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port <= 0) throw new ConfigError('PORT must be a positive integer.')

  const apiKey = env.CIRCLE_API_KEY?.trim()
  const entitySecret = env.CIRCLE_ENTITY_SECRET?.trim()
  const walletSetId = env.CIRCLE_WALLET_SET_ID?.trim()

  // All three or none. Two out of three is a deployment half-done, and it would
  // fail at the worst moment rather than at boot.
  const someCircle = Boolean(apiKey || entitySecret || walletSetId)
  const allCircle = Boolean(apiKey && entitySecret && walletSetId)
  if (someCircle && !allCircle) {
    throw new ConfigError(
      'Circle needs CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET and CIRCLE_WALLET_SET_ID together.',
    )
  }

  return {
    port,
    databaseUrl,
    circle: allCircle
      ? {
          apiKey: apiKey as string,
          entitySecret: entitySecret as string,
          walletSetId: walletSetId as string,
          blockchain: env.CIRCLE_BLOCKCHAIN?.trim() || 'ARC-TESTNET',
        }
      : null,
    treasuryAddress: env.TREASURY_ADDRESS?.trim() || null,
  }
}
