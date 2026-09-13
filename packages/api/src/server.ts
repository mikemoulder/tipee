import { Pool } from 'pg'

import { buildApp } from './app.ts'
import { arcClient } from './chain.ts'
import { circleEscrow, unconfiguredEscrow } from './circle.ts'
import { loadConfig } from './config.ts'
import { migrate } from './db/migrate.ts'
import { postgresStore } from './store.pg.ts'

/**
 * Boot: migrate, wire, listen.
 *
 * Migrations run on start because a schema that lags the code is the failure
 * this API would notice last and explain worst. Without Circle it still starts
 * — resolution then answers 503 with a reason, which is a great deal easier to
 * diagnose than a process that refuses to boot on a laptop with no credentials.
 */
async function main(): Promise<void> {
  const config = loadConfig()

  const pool = new Pool({ connectionString: config.databaseUrl })
  await migrate(pool)
  await pool.end()

  const app = buildApp({
    store: postgresStore(config.databaseUrl),
    escrow: config.circle ? circleEscrow(config.circle) : unconfiguredEscrow(),
    chain: arcClient(),
    logger: true,
  })

  if (!config.circle) {
    app.log.warn('Circle is not configured — creator resolution will answer 503 until it is.')
  }

  await app.listen({ port: config.port, host: '0.0.0.0' })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
