import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Pool } from 'pg'

/**
 * Migrations, applied in filename order and recorded as they go.
 *
 * Small enough to own outright: a dependency here would buy a CLI, a config
 * file, and a second opinion about what a migration is, in exchange for
 * something that fits on one screen.
 *
 * Each file runs inside a transaction, so a migration that fails half way
 * leaves the schema exactly as it was rather than in a state no file describes.
 */
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

export async function migrate(pool: Pool, log: (message: string) => void = console.info): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort()
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations')
  const applied = new Set(rows.map((row) => row.name))

  const ran: string[] = []
  for (const file of files) {
    if (applied.has(file)) continue

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      log(`applied ${file}`)
      ran.push(file)
    } catch (error) {
      await client.query('ROLLBACK')
      throw new Error(`migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      client.release()
    }
  }

  return ran
}
