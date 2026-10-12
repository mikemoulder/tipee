import type { AccountStore, Passkeys } from './accounts.ts'
import { registerAccountRoutes } from './accounts-routes.ts'
import { randomBytes } from 'node:crypto'

import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'

import {
  ESCROW_CONTRACT_ID,
  MIN_TIP,
  formatUsdc,
  isContractAddress,
  isStellarAddress,
  isValidChannelId,
  normalizeHandle,
  parseUsdc,
  splitWithdrawal,
  type ClaimRequest,
  type ClaimResponse,
  type CreateWalletRequest,
  type CreateWalletResponse,
  type FaucetRequest,
  type FaucetResponse,
  type RecordTipRequest,
  type RecordTipResponse,
  type RelayRequest,
  type RelayResponse,
  type ResolveCreatorResponse,
  type VerifyConfirmResponse,
  type VerifyInitResponse,
} from '@tipee/shared'

import {
  ChainUnavailableError,
  RelayRefusedError,
  TransactionFailedError,
  type StellarGateway,
} from './stellar.ts'
import type { CreatorRow, Store } from './store.ts'
import {
  ChannelLookupError,
  ChannelNotFoundError,
  channelPageContains,
  resolveChannel,
  type ResolvedChannel,
} from './youtube.ts'

export interface AppDependencies {
  store: Store
  stellar: StellarGateway
  /** Injected so channel lookups are testable without reaching YouTube. */
  fetchImpl?: typeof fetch
  /** Testnet USDC a new wallet receives, accounting units. */
  faucetAmount?: bigint
  treasuryAddress?: string | null
  /** Injected so token expiry is testable without waiting. */
  now?: (() => Date) | undefined
  logger?: boolean
  /** Creator accounts (passkeys, saved payout address). Off when absent. */
  accounts?: { store: AccountStore; passkeys: Passkeys; origins: string[] } | undefined
}

/** How long a verification token stays good, from issue to claim. */
export const VERIFICATION_TTL_MS = 60 * 60 * 1000

/** A wallet holding at least this much gets no more from the faucet. */
const FAUCET_CEILING = 1_000_000n

/**
 * The API the extension and the claim page talk to.
 *
 * It holds the only two keys in Tipee, and every route exists either because
 * the client cannot be trusted with an answer, or because a key is needed:
 *
 * - **Resolve** turns a handle into a channel ID *here*, by asking YouTube,
 *   because a handle is re-assignable and a client-supplied channel ID could
 *   point a tip at somebody else's balance.
 * - **Record** re-reads the transaction from Stellar rather than believing the
 *   body, so nothing a stranger types becomes a creator's balance.
 * - **Wallets, faucet, relay** are the relayer at work: it deploys gifter
 *   wallets, hands out testnet USDC, and submits (and pays for) what a wallet
 *   has signed. It never signs anything on a gifter's behalf.
 * - **Verify, claim** prove channel ownership with a token in the channel's
 *   description, then have the verifier key release the escrow balance.
 */
export function buildApp(deps: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false })
  const now = deps.now ?? (() => new Date())
  const faucetAmount = deps.faucetAmount ?? 10_000_000n

  // The extension calls from `chrome-extension://…`, an opaque origin that
  // cannot be allow-listed by name. Nothing here uses a cookie or credential.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('access-control-allow-origin', '*')
    reply.header('access-control-allow-headers', 'content-type, authorization')
    reply.header('access-control-allow-methods', 'GET, POST, OPTIONS')
  })

  app.options('/*', async (_request, reply) => reply.code(204).send())

  app.get('/health', async () => ({ ok: true, escrow: ESCROW_CONTRACT_ID }))

  /** Resolves a handle against YouTube, answering the error itself when it cannot. */
  async function channelFor(rawHandle: string, reply: FastifyReply): Promise<ResolvedChannel | null> {
    const handle = normalizeHandle(rawHandle)
    if (!handle) {
      await reply.code(400).send(error('invalid_handle', 'Provide a YouTube handle, like @creator.'))
      return null
    }
    try {
      return await resolveChannel(handle, deps.fetchImpl)
    } catch (caught) {
      if (caught instanceof ChannelNotFoundError) {
        await reply.code(404).send(error('channel_not_found', caught.message))
        return null
      }
      if (caught instanceof ChannelLookupError) {
        await reply.code(502).send(error('youtube_unavailable', caught.message))
        return null
      }
      throw caught
    }
  }

  async function upsert(channel: ResolvedChannel): Promise<CreatorRow> {
    return deps.store.upsertCreator({
      youtubeChannelId: channel.channelId,
      youtubeHandle: channel.handle,
      displayName: channel.displayName,
      avatarUrl: channel.avatarUrl,
    })
  }

  /* Creator resolution ---------------------------------------------------- */

  app.get('/api/creators/resolve', async (request, reply) => {
    const channel = await channelFor((request.query as { handle?: string }).handle ?? '', reply)
    if (!channel) return reply

    const creator = await upsert(channel)

    // The balance is the escrow's, read from chain. A chain that will not
    // answer must not block a tip, so it reads as unknown-zero, not an error.
    let balance = 0n
    try {
      balance = await deps.stellar.escrowBalance(creator.youtubeChannelId)
    } catch (caught) {
      request.log.warn({ err: caught }, 'escrow balance unavailable')
    }

    const body: ResolveCreatorResponse = {
      channel_id: creator.youtubeChannelId,
      handle: creator.youtubeHandle,
      display_name: creator.displayName,
      avatar_url: creator.avatarUrl,
      escrow_contract: ESCROW_CONTRACT_ID,
      is_verified: creator.isVerified,
      unclaimed_balance: formatUsdc(balance),
      has_account: deps.accounts ? Boolean(await deps.accounts.store.byChannelId(creator.youtubeChannelId)) : false,
    }
    return reply.send(body)
  })

  /* Recording a tip ------------------------------------------------------- */

  app.post('/api/tips', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<RecordTipRequest>

    if (!isValidChannelId(body.creator_channel_id)) {
      return reply.code(400).send(error('invalid_channel', 'A YouTube channel ID is required.'))
    }
    if (typeof body.tx_hash !== 'string' || !/^[0-9a-f]{64}$/.test(body.tx_hash)) {
      return reply.code(400).send(error('invalid_tx_hash', 'A Stellar transaction hash is required.'))
    }

    let claimed: bigint
    try {
      claimed = parseUsdc(String(body.amount ?? ''))
    } catch {
      return reply.code(400).send(error('invalid_amount', 'Amount must be a USDC figure, like 5.00.'))
    }
    if (claimed < MIN_TIP) {
      return reply.code(400).send(error('below_minimum', `A tip must be at least ${formatUsdc(MIN_TIP)} USDC.`))
    }

    const creator = await deps.store.creatorByChannelId(body.creator_channel_id)
    if (!creator) {
      return reply.code(404).send(error('unknown_creator', 'That creator is not known here yet.'))
    }

    // Recorded already? Say so and stop: re-inserting is exactly what must not happen.
    const known = await deps.store.tipByHash(body.tx_hash)
    if (known) return reply.code(200).send(tipResponse(known))

    let tip
    try {
      tip = await deps.stellar.verifyTip(body.tx_hash)
    } catch (caught) {
      if (caught instanceof ChainUnavailableError) {
        // Not yet visible and never happened look the same from here, so this
        // is a "come back", never a verdict.
        return reply.code(503).send(error('chain_unavailable', caught.message))
      }
      throw caught
    }

    if (!tip || tip.channelId !== creator.youtubeChannelId) {
      return reply.code(422).send(error('not_a_tip', 'That transaction did not tip this creator.'))
    }

    // The amount and sender stored are the chain's, not the body's.
    const row = await deps.store.recordTip({
      creatorId: creator.id,
      gifterAddress: tip.from,
      amount: tip.amount,
      txHash: body.tx_hash,
      status: 'confirmed',
    })
    return reply.code(201).send(tipResponse(row))
  })

  /* Gifter wallets -------------------------------------------------------- */

  app.post('/api/wallets', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<CreateWalletRequest>
    if (typeof body.owner !== 'string' || !isStellarAddress(body.owner) || !body.owner.startsWith('G')) {
      return reply.code(400).send(error('invalid_owner', 'Send the wallet owner’s public key (G…).'))
    }
    try {
      const wallet = await deps.stellar.deployWallet(body.owner)
      const response: CreateWalletResponse = {
        wallet_address: wallet.address,
        deployed: wallet.deployed,
        tx_hash: wallet.txHash,
      }
      return reply.code(wallet.deployed ? 201 : 200).send(response)
    } catch (caught) {
      return chainFailure(reply, caught)
    }
  })

  app.post('/api/faucet', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<FaucetRequest>
    if (!isContractAddress(body.wallet_address)) {
      return reply.code(400).send(error('invalid_wallet', 'Send a Tipee wallet address (C…).'))
    }
    try {
      // Stateless rate limit: a wallet that already holds a dollar gets nothing.
      const balance = await deps.stellar.usdcBalance(body.wallet_address)
      if (balance >= FAUCET_CEILING) {
        return reply.code(409).send(error('already_funded', 'This wallet already has test USDC.'))
      }
      const txHash = await deps.stellar.fund(body.wallet_address, faucetAmount)
      const response: FaucetResponse = { amount: formatUsdc(faucetAmount), tx_hash: txHash }
      return reply.code(201).send(response)
    } catch (caught) {
      return chainFailure(reply, caught)
    }
  })

  app.post('/api/relay', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<RelayRequest>
    if (typeof body.func !== 'string' || !Array.isArray(body.auth) || !body.auth.every((a: unknown) => typeof a === "string")) {
      return reply.code(400).send(error('invalid_relay', 'Send a host function and its signed auth entries.'))
    }
    try {
      const response: RelayResponse = { tx_hash: await deps.stellar.relay(body.func, body.auth) }
      return reply.code(201).send(response)
    } catch (caught) {
      return chainFailure(reply, caught)
    }
  })

  /* Creator verification and claims -------------------------------------- */

  app.post('/api/creators/verify/init', async (request, reply) => {
    const raw = ((request.body ?? {}) as { handle?: string }).handle ?? ''
    const channel = await channelFor(raw, reply)
    if (!channel) return reply

    const creator = await upsert(channel)
    const token = `tipee-${randomBytes(8).toString('hex')}`
    await deps.store.createVerification(creator.id, token, new Date(now().getTime() + VERIFICATION_TTL_MS))

    const response: VerifyInitResponse & { channel_id: string; display_name: string } = {
      token,
      expires_in: '1 hour',
      instruction: `Add ${token} anywhere in the description of ${creator.youtubeHandle}, save, then check. You can remove it once you have claimed.`,
      channel_id: creator.youtubeChannelId,
      display_name: creator.displayName,
    }
    return reply.code(201).send(response)
  })

  app.post('/api/creators/verify/confirm', async (request, reply) => {
    const token = ((request.body ?? {}) as { token?: string }).token ?? ''
    const verification = await liveVerification(token, reply)
    if (!verification) return reply

    const creator = await deps.store.creatorById(verification.creatorId)
    if (!creator) return reply.code(404).send(error('unknown_creator', 'That channel is not known here.'))

    if (!verification.verifiedAt) {
      let found: boolean
      try {
        found = await channelPageContains(creator.youtubeChannelId, token, deps.fetchImpl)
      } catch {
        return reply.code(502).send(error('youtube_unavailable', 'Could not reach YouTube to check. Try again.'))
      }
      if (!found) {
        return reply
          .code(409)
          .send(error('token_not_found', 'The token is not on the channel page yet. YouTube can take a minute to update.'))
      }
      await deps.store.markVerified(verification.id, creator.id)
    }

    const response: VerifyConfirmResponse & { unclaimed_balance: string } = {
      verified: true,
      channel_id: creator.youtubeChannelId,
      unclaimed_balance: formatUsdc(await deps.stellar.escrowBalance(creator.youtubeChannelId).catch(() => 0n)),
    }
    return reply.send(response)
  })

  app.post('/api/creators/claim', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<ClaimRequest>
    const verification = await liveVerification(body.token ?? '', reply)
    if (!verification) return reply
    if (!verification.verifiedAt) {
      return reply.code(403).send(error('not_verified', 'Check the channel first, so Tipee knows it is yours.'))
    }
    if (!isStellarAddress(body.destination_address)) {
      return reply.code(400).send(error('invalid_destination', 'Send a Stellar address (G… or C…) to pay into.'))
    }

    const creator = await deps.store.creatorById(verification.creatorId)
    if (!creator) return reply.code(404).send(error('unknown_creator', 'That channel is not known here.'))

    let gross: bigint
    try {
      gross = await deps.stellar.escrowBalance(creator.youtubeChannelId)
    } catch (caught) {
      return chainFailure(reply, caught)
    }
    if (gross <= 0n) {
      return reply.code(409).send(error('nothing_to_claim', 'There is nothing waiting for this channel.'))
    }

    if (!(await deps.store.useVerification(verification.id))) {
      return reply.code(409).send(error('token_used', 'That token has already been used for a claim.'))
    }

    let paid
    try {
      paid = await deps.stellar.claim(creator.youtubeChannelId, body.destination_address)
    } catch (caught) {
      return chainFailure(reply, caught)
    }

    await deps.store.recordClaim({
      creatorId: creator.id,
      gross: paid.net + paid.fee,
      fee: paid.fee,
      net: paid.net,
      destination: body.destination_address,
      feeAddress: deps.treasuryAddress ?? '',
      txHash: paid.txHash,
    })

    const split = splitWithdrawal(paid.net + paid.fee)
    const response: ClaimResponse = {
      tx_hash: paid.txHash,
      amount_gross: formatUsdc(split.gross),
      platform_fee: formatUsdc(paid.fee),
      amount_net: formatUsdc(paid.net),
    }
    return reply.code(201).send(response)
  })

  if (deps.accounts) {
    registerAccountRoutes(app, {
      accounts: deps.accounts.store,
      passkeys: deps.accounts.passkeys,
      origins: deps.accounts.origins,
      store: deps.store,
      stellar: deps.stellar,
      now,
      liveVerification,
    })
  }

  async function liveVerification(token: string, reply: FastifyReply) {
    if (!/^tipee-[0-9a-f]{16}$/.test(token)) {
      await reply.code(400).send(error('invalid_token', 'That is not a Tipee verification token.'))
      return null
    }
    const verification = await deps.store.verificationByToken(token)
    if (!verification || verification.expiresAt.getTime() <= now().getTime()) {
      await reply.code(410).send(error('token_expired', 'That token has expired. Start again for a fresh one.'))
      return null
    }
    return verification
  }

  return app
}

function chainFailure(reply: FastifyReply, caught: unknown) {
  if (caught instanceof RelayRefusedError) return reply.code(400).send(error('relay_refused', caught.message))
  if (caught instanceof TransactionFailedError) return reply.code(422).send(error('transaction_failed', caught.message))
  if (caught instanceof ChainUnavailableError) return reply.code(503).send(error('chain_unavailable', caught.message))
  throw caught
}

function tipResponse(tip: { id: string; status: string; amount: bigint; txHash: string }): RecordTipResponse {
  return {
    tip_id: tip.id,
    status: tip.status as RecordTipResponse['status'],
    amount: formatUsdc(tip.amount),
    tx_hash: tip.txHash,
  }
}

function error(code: string, message: string): { error: string; message: string } {
  return { error: code, message }
}
