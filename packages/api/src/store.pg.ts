import { Pool } from 'pg'

import { formatUnits, parseUnits, type CreatorRow, type Store, type TipRow } from './store.ts'

/**
 * Postgres. The uniqueness guarantees live in the schema, not in a read
 * followed by a write — two requests racing for the same creator or reporting
 * the same transaction both go through `ON CONFLICT`, which is decided by the
 * database rather than by whichever request checked first.
 */
export function postgresStore(databaseUrl: string): Store {
  const pool = new Pool({ connectionString: databaseUrl })

  return {
    async creatorByChannelId(channelId) {
      const { rows } = await pool.query(`${CREATOR_SELECT} WHERE youtube_channel_id = $1`, [channelId])
      const row = rows[0]
      return row ? toCreator(row) : null
    },

    async upsertCreator(creator) {
      // `DO UPDATE` rather than `DO NOTHING`, so a row always comes back — and
      // it refreshes the handle and name, which are the fields that drift when
      // a creator renames a channel. The escrow wallet never moves.
      const { rows } = await pool.query(
        `INSERT INTO creators
           (youtube_channel_id, youtube_handle, display_name, avatar_url, circle_wallet_id, wallet_address)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (youtube_channel_id) DO UPDATE
           SET youtube_handle = EXCLUDED.youtube_handle,
               display_name   = EXCLUDED.display_name,
               avatar_url     = COALESCE(EXCLUDED.avatar_url, creators.avatar_url)
         RETURNING id, youtube_channel_id, youtube_handle, display_name, avatar_url,
                   circle_wallet_id, wallet_address, is_verified`,
        [
          creator.youtubeChannelId,
          creator.youtubeHandle,
          creator.displayName,
          creator.avatarUrl,
          creator.circleWalletId,
          creator.walletAddress,
        ],
      )

      return toCreator(rows[0] as Record<string, unknown>)
    },

    async tipByHash(txHash) {
      const { rows } = await pool.query(`${TIP_SELECT} WHERE tx_hash = $1`, [txHash.toLowerCase()])
      const row = rows[0]
      return row ? toTip(row) : null
    },

    async recordTip(tip) {
      const gifterId = tip.gifterAddress ? await gifterFor(pool, tip.gifterAddress) : null

      // This conflict clause is the idempotency. A retried report of the same
      // transaction returns the row that already exists instead of crediting a
      // creator twice for one payment.
      const { rows } = await pool.query(
        `INSERT INTO tips (creator_id, gifter_id, amount, tx_hash, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tx_hash) DO UPDATE SET tx_hash = EXCLUDED.tx_hash
         RETURNING id, creator_id, gifter_id, amount, tx_hash, status, created_at`,
        [tip.creatorId, gifterId, formatUnits(tip.amount), tip.txHash.toLowerCase(), tip.status],
      )

      return toTip(rows[0] as Record<string, unknown>)
    },

    async unclaimedBalance(creatorId) {
      const { rows } = await pool.query<{ balance: string }>(
        `SELECT COALESCE((SELECT SUM(amount) FROM tips
                           WHERE creator_id = $1 AND status = 'confirmed'), 0)
              - COALESCE((SELECT SUM(amount_gross) FROM withdrawals
                           WHERE creator_id = $1 AND status <> 'failed'), 0)
                AS balance`,
        [creatorId],
      )

      const balance = parseUnits(rows[0]?.balance ?? '0')
      return balance > 0n ? balance : 0n
    },

    async close() {
      await pool.end()
    },
  }
}

const CREATOR_SELECT = `
  SELECT id, youtube_channel_id, youtube_handle, display_name, avatar_url,
         circle_wallet_id, wallet_address, is_verified
    FROM creators`

const TIP_SELECT = `
  SELECT id, creator_id, gifter_id, amount, tx_hash, status, created_at
    FROM tips`

async function gifterFor(pool: Pool, address: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO gifters (wallet_address) VALUES ($1)
     ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
     RETURNING id`,
    [address.toLowerCase()],
  )
  return String(rows[0]?.id)
}

function toCreator(row: Record<string, unknown>): CreatorRow {
  return {
    id: String(row.id),
    youtubeChannelId: String(row.youtube_channel_id),
    youtubeHandle: String(row.youtube_handle),
    displayName: String(row.display_name),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    circleWalletId: String(row.circle_wallet_id),
    walletAddress: String(row.wallet_address),
    isVerified: row.is_verified === true,
  }
}

function toTip(row: Record<string, unknown>): TipRow {
  return {
    id: String(row.id),
    creatorId: String(row.creator_id),
    gifterId: row.gifter_id == null ? null : String(row.gifter_id),
    amount: parseUnits(String(row.amount)),
    txHash: String(row.tx_hash),
    status: String(row.status) as TipRow['status'],
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  }
}
