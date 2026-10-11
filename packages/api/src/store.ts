/**
 * Everything the API keeps, behind one interface.
 *
 * Two implementations sit behind it: Postgres in production, and an in-memory
 * one the tests use. That is not ceremony — it is what lets the route tests
 * assert on behaviour (a second report of the same transaction credits nobody
 * twice) without a database running, while the Postgres implementation carries
 * the same guarantee in SQL, where concurrency actually happens.
 */
export interface CreatorRow {
  id: string
  youtubeChannelId: string
  youtubeHandle: string
  displayName: string
  avatarUrl: string | null
  isVerified: boolean
}

/**
 * A creator needs no wallet of their own: every channel's tips sit in the one
 * escrow contract, keyed by `youtubeChannelId`, until it is claimed.
 */
export interface NewCreator {
  youtubeChannelId: string
  youtubeHandle: string
  displayName: string
  avatarUrl: string | null
}

/** A single-use, time-bound proof that somebody controls a channel. */
export interface VerificationRow {
  id: string
  creatorId: string
  token: string
  expiresAt: Date
  /** Set when the token was found on the channel page. */
  verifiedAt: Date | null
  /** Set when a claim was paid on the strength of it. */
  usedAt: Date | null
}

export interface NewClaim {
  creatorId: string
  gross: bigint
  fee: bigint
  net: bigint
  destination: string
  feeAddress: string
  txHash: string
}

export type TipStatusRow = 'pending' | 'confirmed' | 'failed'

export interface TipRow {
  id: string
  creatorId: string
  gifterId: string | null
  /** Accounting units. A bigint here; `numeric(20,6)` in Postgres. */
  amount: bigint
  txHash: string
  status: TipStatusRow
  createdAt: Date
}

export interface NewTip {
  creatorId: string
  gifterAddress: string | null
  amount: bigint
  txHash: string
  status: TipStatusRow
}

export interface Store {
  creatorByChannelId(channelId: string): Promise<CreatorRow | null>
  /**
   * Inserts, or returns the creator that already exists for this channel.
   *
   * Two viewers can open the composer for an unseen creator at the same moment.
   * Both would find nothing and both would provision an escrow; the channel ID
   * is unique, so the loser of that race gets the winner's row rather than a
   * duplicate creator with a second wallet that some tips would be paid into
   * and never seen again.
   */
  upsertCreator(creator: NewCreator): Promise<CreatorRow>
  tipByHash(txHash: string): Promise<TipRow | null>
  /** Returns the row that already exists when this hash was recorded before. */
  recordTip(tip: NewTip): Promise<TipRow>
  createVerification(creatorId: string, token: string, expiresAt: Date): Promise<VerificationRow>
  verificationByToken(token: string): Promise<VerificationRow | null>
  /** Marks the token as proven on the channel page, and the creator verified. */
  markVerified(verificationId: string, creatorId: string): Promise<void>
  /**
   * Spends the token. Returns false when it was already spent, so two claims
   * racing on one token cannot both be paid.
   */
  useVerification(verificationId: string): Promise<boolean>
  creatorById(creatorId: string): Promise<CreatorRow | null>
  recordClaim(claim: NewClaim): Promise<void>
  close(): Promise<void>
}

/** The in-memory store. Used by tests, and by nothing that keeps money. */
export function memoryStore(): Store {
  const creators = new Map<string, CreatorRow>()
  const tips = new Map<string, TipRow>()
  const verifications = new Map<string, VerificationRow>()
  const claims: NewClaim[] = []
  let sequence = 0
  const nextId = (): string => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`

  return {
    async creatorByChannelId(channelId) {
      return creators.get(channelId) ?? null
    },

    async upsertCreator(creator) {
      const existing = creators.get(creator.youtubeChannelId)
      if (existing) {
        const updated: CreatorRow = {
          ...existing,
          youtubeHandle: creator.youtubeHandle,
          displayName: creator.displayName,
          avatarUrl: creator.avatarUrl ?? existing.avatarUrl,
        }
        creators.set(creator.youtubeChannelId, updated)
        return updated
      }

      const row: CreatorRow = { id: nextId(), isVerified: false, ...creator }
      creators.set(creator.youtubeChannelId, row)
      return row
    },

    async tipByHash(txHash) {
      return tips.get(txHash.toLowerCase()) ?? null
    },

    async recordTip(tip) {
      const key = tip.txHash.toLowerCase()
      const existing = tips.get(key)
      if (existing) return existing

      const row: TipRow = {
        id: nextId(),
        creatorId: tip.creatorId,
        gifterId: tip.gifterAddress ? tip.gifterAddress.toLowerCase() : null,
        amount: tip.amount,
        txHash: key,
        status: tip.status,
        createdAt: new Date(),
      }
      tips.set(key, row)
      return row
    },

    async createVerification(creatorId, token, expiresAt) {
      const row: VerificationRow = { id: nextId(), creatorId, token, expiresAt, verifiedAt: null, usedAt: null }
      verifications.set(token, row)
      return row
    },

    async verificationByToken(token) {
      return verifications.get(token) ?? null
    },

    async markVerified(verificationId, creatorId) {
      for (const row of verifications.values()) {
        if (row.id === verificationId) row.verifiedAt ??= new Date()
      }
      for (const [key, creator] of creators) {
        if (creator.id === creatorId) creators.set(key, { ...creator, isVerified: true })
      }
    },

    async useVerification(verificationId) {
      for (const row of verifications.values()) {
        if (row.id !== verificationId) continue
        if (row.usedAt) return false
        row.usedAt = new Date()
        return true
      }
      return false
    },

    async creatorById(creatorId) {
      for (const creator of creators.values()) if (creator.id === creatorId) return creator
      return null
    },

    async recordClaim(claim) {
      claims.push(claim)
    },

    async close() {},
  }
}

/**
 * `12.500000` becomes `12500000n`. Exact, and never through a float.
 *
 * `pg` hands `numeric` back as a string for precisely this reason, and it would
 * be undone by a single `Number()` on the way past.
 */
export function parseUnits(value: string): bigint {
  const trimmed = value.trim().replace('+', '')
  const negative = trimmed.startsWith('-')
  const [whole = '0', fraction = ''] = trimmed.replace('-', '').split('.')
  const units = BigInt(`${whole}${fraction.padEnd(6, '0').slice(0, 6)}` || '0')
  return negative ? -units : units
}

export function formatUnits(amount: bigint): string {
  const negative = amount < 0n
  const digits = (negative ? -amount : amount).toString().padStart(7, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -6)}.${digits.slice(-6)}`
}
