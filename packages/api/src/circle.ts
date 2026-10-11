import { createPublicKey, publicEncrypt, randomUUID } from 'node:crypto'
import { constants } from 'node:crypto'

import type { CircleConfig } from './config.ts'

/**
 * Escrow wallets, one per channel, held by Circle until a creator proves the
 * channel is theirs.
 *
 * Behind an interface for one reason that matters: **nothing else may invent an
 * address**. If Circle is not configured, or is down, or answers with something
 * that is not an address, this throws and the tip does not happen. A guessed,
 * cached, or defaulted escrow address is money sent to somebody who is not the
 * creator, and it is unrecoverable.
 */
export interface EscrowProvider {
  /** Creates the wallet that will hold this channel's tips. */
  create(channelId: string): Promise<{ walletId: string; address: string }>
}

export class EscrowUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EscrowUnavailableError'
  }
}

/** Used when Circle is absent, so the failure is a clear 503 rather than a crash. */
export function unconfiguredEscrow(): EscrowProvider {
  return {
    async create() {
      throw new EscrowUnavailableError('Circle is not configured, so no escrow wallet can be created.')
    },
  }
}

const CIRCLE_API = 'https://api.circle.com/v1/w3s'
const TIMEOUT_MS = 15_000

/**
 * Circle's developer-controlled wallets.
 *
 * Two details of their API are load-bearing. The entity secret is never sent
 * as-is: it is encrypted per request with the public key Circle publishes for
 * this entity (RSA-OAEP, SHA-256), and Circle rejects a ciphertext that has
 * been used before, so one is built fresh for every request rather than cached.
 * The entity secret itself must first be registered in Circle's console, which
 * is also the only chance to download the recovery file that can reset it. And `idempotencyKey` is
 * derived from the channel ID, so a retry after a timeout returns the wallet
 * that was already created instead of a second escrow for the same creator.
 */
export function circleEscrow(config: CircleConfig, fetchImpl: typeof fetch = fetch): EscrowProvider {
  return {
    async create(channelId) {
      const ciphertext = await entitySecretCiphertext(config, fetchImpl)

      const response = await request(
        fetchImpl,
        config,
        'POST',
        '/developer/wallets',
        {
          idempotencyKey: idempotencyKeyFor(channelId),
          entitySecretCiphertext: ciphertext,
          walletSetId: config.walletSetId,
          blockchains: [config.blockchain],
          accountType: 'EOA',
          count: 1,
          metadata: [{ name: `tipee:${channelId}`, refId: channelId }],
        },
      )

      const wallet = (response as { data?: { wallets?: Array<{ id?: string; address?: string }> } }).data
        ?.wallets?.[0]

      if (!wallet?.id || !isAddress(wallet.address)) {
        throw new EscrowUnavailableError('Circle did not return a usable escrow wallet.')
      }

      return { walletId: wallet.id, address: wallet.address as string }
    },
  }
}

/**
 * Creates the one wallet set every creator escrow is derived from.
 *
 * Run once, by hand, and its ID goes in `CIRCLE_WALLET_SET_ID`. Deliberately
 * not automatic: a set is an organisational boundary rather than a security
 * one, an account is capped at a thousand of them, and Circle's own guidance is
 * to group wallets into shared sets and tell them apart by `refId` — which is
 * what `create` does with the channel ID. A service that made a set whenever it
 * could not find one would quietly spend that budget.
 */
export async function createWalletSet(
  config: CircleConfig,
  name = 'Tipee creator escrows',
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; name: string }> {
  const response = await request(fetchImpl, config, 'POST', '/developer/walletSets', {
    idempotencyKey: idempotencyKeyFor(`walletSet:${name}`),
    entitySecretCiphertext: await entitySecretCiphertext(config, fetchImpl),
    name,
  })

  const walletSet = (response as { data?: { walletSet?: { id?: string; name?: string } } }).data?.walletSet
  if (!walletSet?.id) throw new EscrowUnavailableError('Circle did not return a wallet set.')

  return { id: walletSet.id, name: walletSet.name ?? name }
}

/**
 * The entity secret, encrypted for Circle.
 *
 * Registration in the console asks for one of these rather than the secret
 * itself, so this is also what `npm run circle:entity-secret` prints. Circle
 * decrypts it with the private half of the key fetched here; the padding and
 * hash below are what makes that succeed, and getting either wrong fails with
 * an error that says nothing about which.
 */
export async function entitySecretCiphertext(
  config: Pick<CircleConfig, 'apiKey' | 'entitySecret'>,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await request(fetchImpl, config, 'GET', '/config/entity/publicKey')
  const publicKey = (response as { data?: { publicKey?: string } }).data?.publicKey
  if (!publicKey) throw new EscrowUnavailableError('Circle did not return its public key.')

  const secret = Buffer.from(config.entitySecret, 'hex')
  if (secret.length !== 32) {
    throw new EscrowUnavailableError('CIRCLE_ENTITY_SECRET must be 32 bytes of hex.')
  }

  const encrypted = publicEncrypt(
    {
      key: createPublicKey(publicKey),
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    secret,
  )

  return encrypted.toString('base64')
}

async function request(
  fetchImpl: typeof fetch,
  config: Pick<CircleConfig, 'apiKey'>,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(`${CIRCLE_API}${path}`, {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    throw new EscrowUnavailableError('Could not reach Circle.')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    // Circle's own message, when it has one, is far more useful than the status
    // — but it is logged rather than returned to a gifter.
    const message = (payload as { message?: string } | null)?.message
    throw new EscrowUnavailableError(`Circle refused the request (${response.status}): ${message ?? 'no detail'}`)
  }

  return payload
}

/**
 * One key per channel, stable across retries.
 *
 * Circle requires a UUID, so the channel ID is folded into a v4-shaped one
 * deterministically: the same channel always produces the same key, which is
 * what makes a retried creation return the original wallet.
 */
export function idempotencyKeyFor(channelId: string): string {
  let hash = 0x811c9dc5
  const digits: string[] = []

  for (let index = 0; index < 32; index += 1) {
    for (const character of `${channelId}#${index}`) {
      hash ^= character.charCodeAt(0)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    digits.push(((hash >>> 24) % 16).toString(16))
  }

  const hex = digits.join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${'89ab'[Number.parseInt(hex[16] as string, 16) % 4]}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

/** Deliberately shape-only: Circle returns lowercase, and this is not a checksum check. */
function isAddress(value: unknown): boolean {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
}

/** A stand-in for tests and local work. Never reachable in a configured deployment. */
export function fakeEscrow(seed = 1): EscrowProvider {
  let next = seed
  return {
    async create(channelId) {
      const suffix = (next++).toString(16).padStart(4, '0')
      const body = Buffer.from(channelId).toString('hex').padEnd(36, '0').slice(0, 36)
      return { walletId: randomUUID(), address: `0x${body}${suffix}` }
    },
  }
}
