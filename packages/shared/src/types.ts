/**
 * Contracts shared between the extension, the backend, and the claim site.
 *
 * Amounts cross the wire as decimal strings, never as JSON numbers. `5.10` is
 * not exactly representable as an IEEE-754 double, and `JSON.parse` would
 * quietly round a large amount — so every monetary field here is a string,
 * parsed with `parseUsdc` on arrival.
 *
 * Field names use snake_case to match idea.md §8.
 */

/** What the content script can read from the YouTube DOM. */
export interface ScrapedCreator {
  /** Normalised `@handle`. The only identity the extension is trusted for. */
  handle: string
  displayName: string
  avatarUrl: string | null
  /** Video the tip was initiated from, for attribution and button de-duplication. */
  videoId: string
}

/**
 * `GET /api/creators/resolve?handle=@x`
 *
 * The backend — not the extension — establishes `channel_id`, by fetching the
 * channel page server-side. A client-supplied channel ID could be forged to
 * point a tip at someone else's escrow wallet.
 */
export interface ResolveCreatorResponse {
  channel_id: string
  handle: string
  display_name: string
  avatar_url: string | null
  /** Escrow address that receives tips for this channel. */
  wallet_address: string
  is_verified: boolean
  /** Decimal string, accounting units. */
  unclaimed_balance: string
}

/**
 * `POST /api/tips`
 *
 * Every field is treated as a claim to be checked, not as fact. The backend
 * re-reads the transaction from chain and records what actually happened —
 * otherwise anyone could inflate a creator's balance with a fabricated body.
 */
export interface RecordTipRequest {
  gifter_address: string
  creator_channel_id: string
  /** Decimal string, accounting units. */
  amount: string
  tx_hash: string
}

export interface RecordTipResponse {
  tip_id: string
  status: TipStatus
  /** The amount as verified on-chain, which may differ from what was claimed. */
  amount: string
  tx_hash: string
}

export type TipStatus = 'pending' | 'confirmed' | 'failed'

export type VerificationMethod = 'about_link' | 'description'

export type WithdrawalStatus = 'pending' | 'completed' | 'failed'

/** `POST /api/creators/verify/init` */
export interface VerifyInitRequest {
  youtube_url: string
}

export interface VerifyInitResponse {
  token: string
  expires_in: string
  instruction: string
}

/** `POST /api/creators/verify/confirm` */
export interface VerifyConfirmRequest {
  token: string
}

export interface VerifyConfirmResponse {
  verified: boolean
  wallet_address: string
}

/** `POST /api/creators/withdraw` */
export interface WithdrawRequest {
  destination_address: string
  /** Decimal string, accounting units. */
  amount: string
}

export interface WithdrawResponse {
  withdrawal_id: string
  amount_gross: string
  platform_fee: string
  amount_net: string
  status: WithdrawalStatus
}

export interface ApiError {
  error: string
  message: string
}

/** Messages between the content script, the service worker, and the composer. */
export type ExtensionMessage =
  | { type: 'OPEN_COMPOSER'; creator: ScrapedCreator; screenX: number; screenY: number }
  | { type: 'GET_COMPOSER_CONTEXT'; nonce: string }
  | { type: 'GET_WALLET_STATE' }
  | { type: 'SEND_TIP'; nonce: string; amount: string; pin: string }
