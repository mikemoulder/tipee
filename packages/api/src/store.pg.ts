import { Pool } from 'pg'

import { formatUnits, parseUnits, type CreatorRow, type Store, type TipRow, type VerificationRow } from './store.ts'

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
      // a creator renames a channel. The escrow balance never moves: it is
      // keyed by the channel ID on chain.
      const { rows } = await pool.query(
        `INSERT INTO creators (youtube_channel_id, youtube_handle, display_name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (youtube_channel_id) DO UPDATE
           SET youtube_handle = EXCLUDED.youtube_handle,
               display_name   = EXCLUDED.display_name,
               avatar_url     = COALESCE(EXCLUDED.avatar_url, creators.avatar_url)
         RETURNING id, youtube_channel_id, youtube_handle, display_name, avatar_url, is_verified`,
        [creator.youtubeChannelId, creator.youtubeHandle, creator.displayName, creator.avatarUrl],
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

    async createVerification(creatorId, token, expiresAt) {
      const { rows } = await pool.query(
        `INSERT INTO verifications (creator_id, token, method, expires_at)
         VALUES ($1, $2, 'description', $3)
         RETURNING ${VERIFICATION_COLUMNS}`,
        [creatorId, token, expiresAt],
      )
      return toVerification(rows[0] as Record<string, unknown>)
    },

    async verificationByToken(token) {
      const { rows } = await pool.query(`SELECT ${VERIFICATION_COLUMNS} FROM verifications WHERE token = $1`, [token])
      const row = rows[0]
      return row ? toVerification(row) : null
    },

    async markVerified(verificationId, creatorId) {
      await pool.query(`UPDATE verifications SET verified_at = COALESCE(verified_at, now()) WHERE id = $1`, [
        verificationId,
      ])
      await pool.query(`UPDATE creators SET is_verified = true, verified_at = COALESCE(verified_at, now()) WHERE id = $1`, [
        creatorId,
      ])
    },

    async useVerification(verificationId) {
      // The `used_at IS NULL` guard is the single-use rule, decided by the
      // database: of two racing claims, exactly one updates a row.
      const { rowCount } = await pool.query(
        `UPDATE verifications SET used_at = now() WHERE id = $1 AND used_at IS NULL`,
        [verificationId],
      )
      return rowCount === 1
    },

    async creatorById(creatorId) {
      const { rows } = await pool.query(`${CREATOR_SELECT} WHERE id = $1`, [creatorId])
      const row = rows[0]
      return row ? toCreator(row) : null
    },

    async recordClaim(claim) {
      await pool.query(
        `INSERT INTO withdrawals
           (creator_id, amount_gross, platform_fee, amount_net, destination_address, platform_fee_address, tx_hash, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')`,
        [
          claim.creatorId,
          formatUnits(claim.gross),
          formatUnits(claim.fee),
          formatUnits(claim.net),
          claim.destination,
          claim.feeAddress,
          claim.txHash,
        ],
      )
    },

    async close() {
      await pool.end()
    },
  }
}

const CREATOR_SELECT = `
  SELECT id, youtube_channel_id, youtube_handle, display_name, avatar_url, is_verified
    FROM creators`

const VERIFICATION_COLUMNS = 'id, creator_id, token, expires_at, verified_at, used_at'

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
    isVerified: row.is_verified === true,
  }
}

function toVerification(row: Record<string, unknown>): VerificationRow {
  const date = (value: unknown): Date | null =>
    value == null ? null : value instanceof Date ? value : new Date(String(value))
  return {
    id: String(row.id),
    creatorId: String(row.creator_id),
    token: String(row.token),
    expiresAt: date(row.expires_at) as Date,
    verifiedAt: date(row.verified_at),
    usedAt: date(row.used_at),
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
