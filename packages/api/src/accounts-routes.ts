import { randomBytes } from 'node:crypto'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'

import { formatUsdc, isStellarAddress } from '@tipee/shared'

import { issueSession, readSession, type AccountStore, type CreatorAccount, type Passkeys } from './accounts.ts'
import { ChainUnavailableError, type StellarGateway } from './stellar.ts'
import type { Store, VerificationRow } from './store.ts'

/**
 * Creator accounts over HTTP (accounts.ts says why they exist).
 *
 *   POST /api/accounts/register/options   a verified code → passkey options
 *   POST /api/accounts/register/verify    the new passkey + payout address → session
 *   POST /api/accounts/signin/options     → passkey options, no handle needed
 *   POST /api/accounts/signin/verify      the passkey's answer → session
 *   GET  /api/accounts/me                 the dashboard, read from chain
 *   POST /api/accounts/me/payout          everything waiting → the saved address
 *   POST /api/accounts/me/payout-address  change where payouts go
 *
 * Sessions travel as `Authorization: Bearer …`, never a cookie: the site and
 * the API are on different domains, and a header needs no cross-site cookie.
 * Passkeys are bound to the site's own domain, so the browser's Origin must be
 * one the server is configured to trust.
 */
export interface AccountRouteDeps {
  accounts: AccountStore
  passkeys: Passkeys
  /** Site origins allowed to hold passkeys, e.g. https://tipee.vercel.app. */
  origins: string[]
  store: Store
  stellar: StellarGateway
  now: () => Date
  /** app.ts's check that a description code is real and unexpired. */
  liveVerification: (token: string, reply: FastifyReply) => Promise<VerificationRow | null>
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000

interface PendingChallenge {
  kind: 'register' | 'signin'
  challenge: string
  origin: string
  rpId: string
  expiresAt: number
  verificationId?: string
  creatorId?: string
}

export function registerAccountRoutes(app: FastifyInstance, deps: AccountRouteDeps): void {
  const pending = new Map<string, PendingChallenge>()

  function remember(challenge: Omit<PendingChallenge, 'expiresAt'>): string {
    const now = deps.now().getTime()
    for (const [id, entry] of pending) if (entry.expiresAt <= now) pending.delete(id)
    const id = randomBytes(16).toString('hex')
    pending.set(id, { ...challenge, expiresAt: now + CHALLENGE_TTL_MS })
    return id
  }

  /** Takes a challenge once; a second use of the same id finds nothing. */
  function take(id: unknown, kind: PendingChallenge['kind']): PendingChallenge | null {
    if (typeof id !== 'string') return null
    const entry = pending.get(id)
    pending.delete(id)
    if (!entry || entry.kind !== kind || entry.expiresAt <= deps.now().getTime()) return null
    return entry
  }

  /** The site the request came from, when it is one passkeys may belong to. */
  async function siteOf(request: FastifyRequest, reply: FastifyReply): Promise<{ origin: string; rpId: string } | null> {
    const origin = request.headers.origin
    if (!origin || !deps.origins.includes(origin)) {
      await reply.code(403).send(error('origin_not_allowed', 'Passkeys only work from the Tipee website.'))
      return null
    }
    return { origin, rpId: new URL(origin).hostname }
  }

  async function signedIn(request: FastifyRequest, reply: FastifyReply): Promise<CreatorAccount | null> {
    const header = request.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const channelId = token ? readSession(deps.accounts.secret, token, deps.now()) : null
    const account = channelId ? await deps.accounts.byChannelId(channelId) : null
    if (!account) {
      await reply.code(401).send(error('signed_out', 'Sign in with your passkey to see this.'))
      return null
    }
    return account
  }

  function session(account: CreatorAccount) {
    const issued = issueSession(deps.accounts.secret, account.channelId, deps.now())
    return { session: issued.token, expires_at: issued.expiresAt.toISOString(), channel_id: account.channelId }
  }

  /* Registering a passkey ----------------------------------------------------- */

  app.post('/api/accounts/register/options', async (request, reply) => {
    const site = await siteOf(request, reply)
    if (!site) return reply
    const verification = await deps.liveVerification(((request.body ?? {}) as { token?: string }).token ?? '', reply)
    if (!verification) return reply
    if (!verification.verifiedAt) {
      return reply.code(403).send(error('not_verified', 'Check the channel first, so Tipee knows it is yours.'))
    }
    const creator = await deps.store.creatorById(verification.creatorId)
    if (!creator) return reply.code(404).send(error('unknown_creator', 'That channel is not known here.'))

    const existing = await deps.accounts.byChannelId(creator.youtubeChannelId)
    const options = await deps.passkeys.registrationOptions({
      rpId: site.rpId,
      userId: creator.youtubeChannelId,
      userName: creator.youtubeHandle,
      userDisplayName: creator.displayName,
      exclude: existing?.passkeys ?? [],
    })
    const challengeId = remember({
      kind: 'register',
      challenge: options.challenge,
      ...site,
      verificationId: verification.id,
      creatorId: creator.id,
    })
    return reply.send({ challenge_id: challengeId, options, has_account: Boolean(existing) })
  })

  app.post('/api/accounts/register/verify', async (request, reply) => {
    const body = (request.body ?? {}) as { challenge_id?: string; response?: RegistrationResponseJSON; payout_address?: string }
    const entry = take(body.challenge_id, 'register')
    if (!entry || !body.response) {
      return reply.code(400).send(error('challenge_expired', 'That passkey request expired. Try again.'))
    }
    const creator = entry.creatorId ? await deps.store.creatorById(entry.creatorId) : null
    if (!creator) return reply.code(404).send(error('unknown_creator', 'That channel is not known here.'))

    const existing = await deps.accounts.byChannelId(creator.youtubeChannelId)
    const payout = body.payout_address?.trim()
    if (payout !== undefined && payout !== '' && !isStellarAddress(payout)) {
      return reply.code(400).send(error('invalid_destination', 'Enter a Stellar address (G… or C…) to be paid at.'))
    }
    if (!existing && !payout) {
      return reply.code(400).send(error('invalid_destination', 'Choose where your tips should be paid.'))
    }

    const passkey = await deps.passkeys.verifyRegistration({
      response: body.response,
      challenge: entry.challenge,
      origin: entry.origin,
      rpId: entry.rpId,
    })
    if (!passkey) return reply.code(400).send(error('passkey_rejected', 'That passkey could not be verified. Try again.'))

    const account: CreatorAccount = existing ?? {
      channelId: creator.youtubeChannelId,
      handle: creator.youtubeHandle,
      displayName: creator.displayName,
      avatarUrl: creator.avatarUrl,
      payoutAddress: payout as string,
      passkeys: [],
      payouts: [],
      createdAt: deps.now().toISOString(),
    }
    if (payout) account.payoutAddress = payout
    account.handle = creator.youtubeHandle
    account.displayName = creator.displayName
    account.avatarUrl = creator.avatarUrl
    account.passkeys.push({ ...passkey, createdAt: deps.now().toISOString() })
    await deps.accounts.save(account)
    return reply.code(201).send(session(account))
  })

  /* Signing in ---------------------------------------------------------------- */

  app.post('/api/accounts/signin/options', async (request, reply) => {
    const site = await siteOf(request, reply)
    if (!site) return reply
    const options = await deps.passkeys.authenticationOptions({ rpId: site.rpId })
    return reply.send({ challenge_id: remember({ kind: 'signin', challenge: options.challenge, ...site }), options })
  })

  app.post('/api/accounts/signin/verify', async (request, reply) => {
    const body = (request.body ?? {}) as { challenge_id?: string; response?: AuthenticationResponseJSON }
    const entry = take(body.challenge_id, 'signin')
    if (!entry || !body.response) {
      return reply.code(400).send(error('challenge_expired', 'That sign-in request expired. Try again.'))
    }
    const account = await deps.accounts.byPasskeyId(body.response.id)
    const passkey = account?.passkeys.find((key) => key.id === body.response?.id)
    if (!account || !passkey) {
      return reply.code(404).send(error('unknown_passkey', 'That passkey is not linked to a channel. Verify your channel to add it.'))
    }
    const verified = await deps.passkeys.verifyAuthentication({
      response: body.response,
      challenge: entry.challenge,
      origin: entry.origin,
      rpId: entry.rpId,
      passkey,
    })
    if (!verified) return reply.code(401).send(error('passkey_rejected', 'That passkey could not be verified. Try again.'))

    passkey.counter = verified.counter
    await deps.accounts.save(account)
    return reply.send(session(account))
  })

  /* The dashboard ------------------------------------------------------------- */

  app.get('/api/accounts/me', async (request, reply) => {
    const account = await signedIn(request, reply)
    if (!account) return reply

    let balance: bigint
    let lifetime: bigint
    try {
      ;[balance, lifetime] = await Promise.all([
        deps.stellar.escrowBalance(account.channelId),
        deps.stellar.escrowLifetime(account.channelId),
      ])
    } catch {
      return reply.code(503).send(error('chain_unavailable', 'Stellar did not answer. Try again in a moment.'))
    }

    // Activity is a nice-to-have: without it the totals still stand.
    let activity: Awaited<ReturnType<StellarGateway['channelActivity']>> | null = null
    try {
      activity = await deps.stellar.channelActivity(account.channelId)
    } catch (caught) {
      if (!(caught instanceof ChainUnavailableError)) request.log.warn({ err: caught }, 'channel activity failed')
    }

    return reply.send({
      channel: {
        channel_id: account.channelId,
        handle: account.handle,
        display_name: account.displayName,
        avatar_url: account.avatarUrl,
      },
      payout_address: account.payoutAddress,
      balance: formatUsdc(balance),
      lifetime: formatUsdc(lifetime),
      // Everything that has left escrow, fee included, is lifetime minus what is still there.
      claimed: formatUsdc(lifetime - balance),
      passkeys: account.passkeys.length,
      activity_unavailable: activity === null,
      activity_partial: activity?.partial ?? false,
      activity: (activity?.events ?? []).slice(0, 40).map((event) =>
        event.kind === 'tip'
          ? { kind: 'tip', tx_hash: event.txHash, at: event.at?.toISOString() ?? null, amount: formatUsdc(event.amount), note: event.note, from: event.from }
          : { kind: 'claim', tx_hash: event.txHash, at: event.at?.toISOString() ?? null, net: formatUsdc(event.net), fee: formatUsdc(event.fee), to: event.to },
      ),
    })
  })

  app.post('/api/accounts/me/payout', async (request, reply) => {
    const account = await signedIn(request, reply)
    if (!account) return reply

    let gross: bigint
    try {
      gross = await deps.stellar.escrowBalance(account.channelId)
    } catch {
      return reply.code(503).send(error('chain_unavailable', 'Stellar did not answer. Try again in a moment.'))
    }
    if (gross <= 0n) return reply.code(409).send(error('nothing_to_claim', 'There is nothing waiting right now.'))

    let paid: { txHash: string; net: bigint; fee: bigint }
    try {
      paid = await deps.stellar.claim(account.channelId, account.payoutAddress)
    } catch (caught) {
      request.log.warn({ err: caught }, 'payout failed')
      return reply.code(502).send(error('payout_failed', 'The payout did not go through. Nothing was taken; try again.'))
    }

    account.payouts.unshift({
      txHash: paid.txHash,
      gross: formatUsdc(paid.net + paid.fee),
      net: formatUsdc(paid.net),
      fee: formatUsdc(paid.fee),
      to: account.payoutAddress,
      at: deps.now().toISOString(),
    })
    await deps.accounts.save(account)
    return reply.code(201).send({
      tx_hash: paid.txHash,
      amount_gross: formatUsdc(paid.net + paid.fee),
      platform_fee: formatUsdc(paid.fee),
      amount_net: formatUsdc(paid.net),
      to: account.payoutAddress,
    })
  })

  app.post('/api/accounts/me/payout-address', async (request, reply) => {
    const account = await signedIn(request, reply)
    if (!account) return reply
    const address = (((request.body ?? {}) as { address?: string }).address ?? '').trim()
    if (!isStellarAddress(address)) {
      return reply.code(400).send(error('invalid_destination', 'Enter a Stellar address (G… or C…) to be paid at.'))
    }
    account.payoutAddress = address
    await deps.accounts.save(account)
    return reply.send({ payout_address: address })
  })
}

function error(code: string, message: string): { error: string; message: string } {
  return { error: code, message }
}
