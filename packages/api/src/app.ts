import Fastify, { type FastifyInstance } from 'fastify'
import type { PublicClient } from 'viem'

import {
  MIN_TIP,
  formatUsdc,
  isValidChannelId,
  normalizeHandle,
  parseUsdc,
  type RecordTipRequest,
  type RecordTipResponse,
  type ResolveCreatorResponse,
} from '@tipee/shared'

import { ChainUnavailableError, verifyTransfer } from './chain.ts'
import { EscrowUnavailableError, type EscrowProvider } from './circle.ts'
import type { Store } from './store.ts'
import { ChannelLookupError, ChannelNotFoundError, resolveChannel } from './youtube.ts'

export interface AppDependencies {
  store: Store
  escrow: EscrowProvider
  chain: PublicClient
  /** Injected so channel lookups are testable without reaching YouTube. */
  fetchImpl?: typeof fetch
  logger?: boolean
}

/**
 * The API the extension talks to.
 *
 * Two endpoints carry the whole tip path, and both of them exist because the
 * client cannot be trusted with the answer:
 *
 * - **Resolve** turns a handle into a channel ID *here*, by asking YouTube,
 *   because a handle is re-assignable and a client-supplied channel ID could
 *   point at somebody else's escrow.
 * - **Record** re-reads the transaction from Arc rather than believing the
 *   amount in the request body, because a creator's balance is otherwise
 *   whatever a stranger cared to type.
 */
export function buildApp(deps: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false })

  // The extension calls from `chrome-extension://…`, an opaque origin that
  // cannot be allow-listed by name. Everything here is either public or proven
  // against the chain, and no cookie or credential is involved.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('access-control-allow-origin', '*')
    reply.header('access-control-allow-headers', 'content-type')
    reply.header('access-control-allow-methods', 'GET, POST, OPTIONS')
  })

  app.options('/*', async (_request, reply) => reply.code(204).send())

  app.get('/health', async () => ({ ok: true }))

  /* Creator resolution ---------------------------------------------------- */

  app.get('/api/creators/resolve', async (request, reply) => {
    const raw = (request.query as { handle?: string }).handle ?? ''
    const handle = normalizeHandle(raw)
    if (!handle) {
      return reply.code(400).send(error('invalid_handle', 'Provide a YouTube handle, like @creator.'))
    }

    let channel
    try {
      channel = await resolveChannel(handle, deps.fetchImpl)
    } catch (caught) {
      if (caught instanceof ChannelNotFoundError) {
        return reply.code(404).send(error('channel_not_found', caught.message))
      }
      if (caught instanceof ChannelLookupError) {
        return reply.code(502).send(error('youtube_unavailable', caught.message))
      }
      throw caught
    }

    const existing = await deps.store.creatorByChannelId(channel.channelId)

    let creator = existing
    if (!creator) {
      // First tip anyone has tried to send this channel. The escrow is created
      // now, and if that fails nothing is written — a creator row without a
      // real wallet would collect tips into an address nobody holds.
      let wallet
      try {
        wallet = await deps.escrow.create(channel.channelId)
      } catch (caught) {
        request.log.error({ err: caught }, 'escrow provisioning failed')
        const message =
          caught instanceof EscrowUnavailableError
            ? 'Tipee could not set up a wallet for this creator yet.'
            : 'Tipee could not set up a wallet for this creator yet.'
        return reply.code(503).send(error('escrow_unavailable', message))
      }

      creator = await deps.store.upsertCreator({
        youtubeChannelId: channel.channelId,
        youtubeHandle: channel.handle,
        displayName: channel.displayName,
        avatarUrl: channel.avatarUrl,
        circleWalletId: wallet.walletId,
        walletAddress: wallet.address,
      })
    } else if (
      existing &&
      (existing.youtubeHandle !== channel.handle || existing.displayName !== channel.displayName)
    ) {
      // A rename. The escrow stays where it is: it belongs to the channel ID.
      creator = await deps.store.upsertCreator({
        youtubeChannelId: channel.channelId,
        youtubeHandle: channel.handle,
        displayName: channel.displayName,
        avatarUrl: channel.avatarUrl,
        circleWalletId: existing.circleWalletId,
        walletAddress: existing.walletAddress,
      })
    }

    const balance = await deps.store.unclaimedBalance(creator.id)

    const body: ResolveCreatorResponse = {
      channel_id: creator.youtubeChannelId,
      handle: creator.youtubeHandle,
      display_name: creator.displayName,
      avatar_url: creator.avatarUrl,
      wallet_address: creator.walletAddress,
      is_verified: creator.isVerified,
      unclaimed_balance: formatUsdc(balance),
    }

    return reply.send(body)
  })

  /* Recording a tip ------------------------------------------------------- */

  app.post('/api/tips', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<RecordTipRequest>

    if (!isValidChannelId(body.creator_channel_id)) {
      return reply.code(400).send(error('invalid_channel', 'A YouTube channel ID is required.'))
    }
    if (typeof body.tx_hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(body.tx_hash)) {
      return reply.code(400).send(error('invalid_tx_hash', 'A transaction hash is required.'))
    }

    let claimed: bigint
    try {
      claimed = parseUsdc(String(body.amount ?? ''))
    } catch {
      return reply.code(400).send(error('invalid_amount', 'Amount must be a USDC figure, like 5.00.'))
    }
    if (claimed < MIN_TIP) {
      return reply
        .code(400)
        .send(error('below_minimum', `A tip must be at least ${formatUsdc(MIN_TIP)} USDC.`))
    }

    const creator = await deps.store.creatorByChannelId(body.creator_channel_id)
    if (!creator) {
      return reply.code(404).send(error('unknown_creator', 'That creator has no escrow wallet here.'))
    }

    // Recorded already? Say so and stop. Re-reading the chain would be wasted
    // work, and re-inserting is exactly what must not happen.
    const known = await deps.store.tipByHash(body.tx_hash)
    if (known) return reply.code(200).send(tipResponse(known))

    let transfer
    try {
      transfer = await verifyTransfer(deps.chain, body.tx_hash as `0x${string}`, creator.walletAddress)
    } catch (caught) {
      if (caught instanceof ChainUnavailableError) {
        // Unmined and non-existent look the same from here, so this is a
        // "come back", never a verdict.
        return reply.code(503).send(error('chain_unavailable', caught.message))
      }
      throw caught
    }

    if (!transfer) {
      return reply
        .code(422)
        .send(error('not_a_tip', 'That transaction did not pay this creator any USDC.'))
    }

    // The amount stored is the one the chain reports, not the one claimed. A
    // request understating or overstating it changes nothing.
    const tip = await deps.store.recordTip({
      creatorId: creator.id,
      gifterAddress: transfer.from,
      amount: transfer.amount,
      txHash: body.tx_hash,
      status: 'confirmed',
    })

    return reply.code(201).send(tipResponse(tip))
  })

  return app
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
