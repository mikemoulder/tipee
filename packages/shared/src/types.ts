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
 * point a tip at someone else's balance in the escrow.
 */
export interface ResolveCreatorResponse {
  channel_id: string
  handle: string
  display_name: string
  avatar_url: string | null
  /**
   * The escrow contract tips are paid into, keyed by `channel_id`. The same
   * contract for every creator; the extension refuses any other.
   */
  escrow_contract: string
  is_verified: boolean
  /** Decimal string, accounting units. Read from the escrow contract. */
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
  channel_id: string
}

/**
 * `POST /api/creators/claim`
 *
 * Pays a verified channel's whole escrow balance to any Stellar address. The
 * escrow contract takes the fee; the API only authorises the claim with the
 * verifier key, once the token proves ownership.
 */
export interface ClaimRequest {
  token: string
  destination_address: string
}

export interface ClaimResponse {
  tx_hash: string
  amount_gross: string
  platform_fee: string
  amount_net: string
}

/**
 * `POST /api/wallets`
 *
 * Deploys the gifter's wallet contract, owned by `owner`, if it is not already
 * there. The address is deterministic (deployer + `sha256(owner)`), so the
 * extension computes it offline and checks the answer rather than trusting it.
 */
export interface CreateWalletRequest {
  /** The ed25519 owner key as a `G…` StrKey. Public, never the seed. */
  owner: string
}

export interface CreateWalletResponse {
  wallet_address: string
  /** False when the wallet already existed. */
  deployed: boolean
  tx_hash: string | null
}

/** `POST /api/faucet`: testnet USDC for a new wallet, once. */
export interface FaucetRequest {
  wallet_address: string
}

export interface FaucetResponse {
  /** Decimal string, accounting units. */
  amount: string
  tx_hash: string
}

/**
 * `POST /api/relay`
 *
 * A Soroban invocation the gifter's wallet has already authorised. The relayer
 * becomes the transaction source and pays the fee; it cannot change what was
 * signed, because the signature covers the invocation tree. It refuses anything
 * that is not a tip, a USDC transfer out of a Tipee wallet, or a wallet's own
 * session change.
 */
export interface RelayRequest {
  /** `xdr.HostFunction`, base64. */
  func: string
  /** Signed `xdr.SorobanAuthorizationEntry` values, base64. */
  auth: string[]
}

export interface RelayResponse {
  tx_hash: string
}

export interface ApiError {
  error: string
  message: string
}

/** What the composer needs before it can validate a tip against real funds. */
export interface ComposerContext {
  /** The gifter's wallet, or null when none is set up yet. */
  walletAddress: string | null
  /** Spendable USDC, accounting units. Null when it could not be read. */
  balance: string | null
  /**
   * What the gifter pays in fees, accounting units. Always `0.00` on Stellar,
   * because the relayer pays; kept as a field so the composer's validation
   * did not have to learn a second shape.
   */
  gasCost: string | null
  /** The escrow contract the tip would be paid into. */
  recipient: string | null
  /** Why the above is incomplete. Terse, safe to show as-is. */
  problem: string | null
  /**
   * Whether signing still needs a PIN.
   *
   * False when the wallet is already open for this browsing session. The
   * composer asks for one only when it would actually be checked — a PIN box
   * that accepts anything teaches people the box means nothing.
   */
  needsPin: boolean
}

/** The end of a tip. A failure never leaves a hash behind. */
export type SendTipOutcome =
  | { ok: true; txHash: string }
  | { ok: false; message: string }

/** Messages between the content script, the service worker, and the composer. */
export type ExtensionMessage =
  | { type: 'OPEN_COMPOSER'; creator: ScrapedCreator; screenX: number; screenY: number }
  /**
   * Asks the worker what this tip would actually cost, and whether it would go
   * through: the worker simulates the real `escrow.tip` call.
   */
  | { type: 'GET_COMPOSER_CONTEXT'; nonce: string; amount: string; memo: string }
  | { type: 'GET_WALLET_STATE' }
  /**
   * Optional note, empty string when absent.
   *
   * It reaches the chain as the `note` of the escrow's `tip` event, in the same
   * call that moves the USDC. So it is *public and permanent*: readable by
   * anyone, editable by no one — hence the cap in `MEMO_MAX_BYTES`, which the
   * escrow contract enforces too.
   */
  | { type: 'SEND_TIP'; nonce: string; amount: string; pin: string; memo: string }
