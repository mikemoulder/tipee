import { Pool } from 'pg'

import { parseUsdc } from '@tipee/shared'

import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { migrate } from './db/migrate.ts'
import { stellarGateway } from './stellar.ts'
import { memoryStore } from './store.ts'
import { postgresStore } from './store.pg.ts'

/**
 * Boot: migrate, wire, listen.
 *
 * Migrations run on start because a schema that lags the code is the failure
 * this API would notice last and explain worst. Without a database it runs on
 * the in-memory store and says so: the chain is the record of every tip and
 * every balance, so what is lost on a restart is bookkeeping, not money.
 */
async function main(): Promise<void> {
  const config = loadConfig()

  let store = memoryStore()
  if (config.databaseUrl) {
    const pool = new Pool({ connectionString: config.databaseUrl })
    await migrate(pool)
    await pool.end()
    store = postgresStore(config.databaseUrl)
  }

  const app = buildApp({
    store,
    stellar: stellarGateway({
      rpcUrl: config.rpcUrl,
      relayerSecret: config.relayerSecret,
      verifierSecret: config.verifierSecret,
    }),
    faucetAmount: parseUsdc(config.faucetAmount),
    treasuryAddress: config.treasuryAddress,
    logger: true,
  })

  if (!config.databaseUrl) app.log.warn('DATABASE_URL is not set — using the in-memory store.')
  if (!config.verifierSecret) app.log.warn('VERIFIER_SECRET is not set — creator claims will be refused.')

  await app.listen({ port: config.port, host: config.host })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
