import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'

/**
 * Creator accounts: verify a channel once, then sign in with a passkey.
 *
 * A creator proves the channel with the description code (app.ts) exactly
 * once. That proof lets them register a passkey and a payout address; from
 * then on the passkey is the proof, and a payout can only ever go to the
 * address the verified owner chose. Losing the passkey costs nothing: a fresh
 * code adds a new one.
 *
 * Accounts live in their own small JSON file rather than in `Store`, because
 * the server runs without a database and the rest of `Store` is bookkeeping
 * the chain can rebuild. A creator's passkey and payout address cannot be
 * rebuilt, so they have to survive a restart.
 */

export interface StoredPasskey {
  /** base64url credential id, as the browser reports it. */
  id: string
  /** base64url COSE public key. */
  publicKey: string
  counter: number
  transports?: AuthenticatorTransportFuture[]
  createdAt: string
}

export interface Payout {
  txHash: string
  /** Accounting units, decimal strings. */
  gross: string
  net: string
  fee: string
  to: string
  at: string
}

export interface CreatorAccount {
  channelId: string
  handle: string
  displayName: string
  avatarUrl: string | null
  payoutAddress: string
  passkeys: StoredPasskey[]
  payouts: Payout[]
  createdAt: string
}

export interface AccountStore {
  byChannelId(channelId: string): Promise<CreatorAccount | null>
  byPasskeyId(passkeyId: string): Promise<CreatorAccount | null>
  save(account: CreatorAccount): Promise<void>
  /** Signs session tokens. Stable across restarts for the file store. */
  readonly secret: Buffer
}

interface AccountFile {
  secret: string
  accounts: CreatorAccount[]
}

export function memoryAccounts(secret: Buffer = randomBytes(32)): AccountStore {
  const accounts = new Map<string, CreatorAccount>()
  return {
    secret,
    async byChannelId(channelId) {
      return clone(accounts.get(channelId) ?? null)
    },
    async byPasskeyId(passkeyId) {
      for (const account of accounts.values()) {
        if (account.passkeys.some((key) => key.id === passkeyId)) return clone(account)
      }
      return null
    },
    async save(account) {
      accounts.set(account.channelId, clone(account))
    },
  }
}

/**
 * The memory store, written through to `path` on every save. Writes go to a
 * temporary file and are renamed into place, so a crash mid-write leaves the
 * previous file whole.
 */
export function fileAccounts(path: string): AccountStore {
  let file: AccountFile
  if (existsSync(path)) {
    file = JSON.parse(readFileSync(path, 'utf8')) as AccountFile
  } else {
    file = { secret: randomBytes(32).toString('base64'), accounts: [] }
    persist(path, file)
  }

  const memory = memoryAccounts(Buffer.from(file.secret, 'base64'))
  for (const account of file.accounts) void memory.save(account)
  const all = new Map(file.accounts.map((account) => [account.channelId, account]))

  return {
    secret: memory.secret,
    byChannelId: memory.byChannelId,
    byPasskeyId: memory.byPasskeyId,
    async save(account) {
      await memory.save(account)
      all.set(account.channelId, clone(account))
      persist(path, { secret: file.secret, accounts: [...all.values()] })
    },
  }
}

function persist(path: string, file: AccountFile): void {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.tmp`
  writeFileSync(temp, JSON.stringify(file, null, 2), { mode: 0o600 })
  renameSync(temp, path)
}

function clone<T>(value: T): T {
  return value === null ? value : (JSON.parse(JSON.stringify(value)) as T)
}

/* Sessions ------------------------------------------------------------------ */

/** How long a sign-in lasts. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A session is `channelId.expiry.mac`, HMAC-SHA256 under the store's secret.
 * Stateless, so a restart keeps everyone signed in, and nothing about it is
 * secret except that only this server can mint one.
 */
export function issueSession(secret: Buffer, channelId: string, now: Date): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  const body = `${channelId}.${expiresAt.getTime()}`
  return { token: `${body}.${mac(secret, body)}`, expiresAt }
}

/** The channel a session belongs to, or null when it is forged or expired. */
export function readSession(secret: Buffer, token: string, now: Date): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [channelId, expiry, given] = parts as [string, string, string]
  const expected = mac(secret, `${channelId}.${expiry}`)
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (!/^\d+$/.test(expiry) || Number(expiry) <= now.getTime()) return null
  return channelId
}

function mac(secret: Buffer, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

/* Passkeys ------------------------------------------------------------------ */

/**
 * The WebAuthn ceremony, behind an interface so the routes can be tested
 * without an authenticator. The real one is SimpleWebAuthn.
 */
export interface Passkeys {
  registrationOptions(input: {
    rpId: string
    userId: string
    userName: string
    userDisplayName: string
    exclude: StoredPasskey[]
  }): Promise<PublicKeyCredentialCreationOptionsJSON>
  verifyRegistration(input: {
    response: RegistrationResponseJSON
    challenge: string
    origin: string
    rpId: string
  }): Promise<Omit<StoredPasskey, 'createdAt'> | null>
  authenticationOptions(input: { rpId: string }): Promise<PublicKeyCredentialRequestOptionsJSON>
  verifyAuthentication(input: {
    response: AuthenticationResponseJSON
    challenge: string
    origin: string
    rpId: string
    passkey: StoredPasskey
  }): Promise<{ counter: number } | null>
}

export const simpleWebAuthn: Passkeys = {
  async registrationOptions({ rpId, userId, userName, userDisplayName, exclude }) {
    return generateRegistrationOptions({
      rpName: 'Tipee',
      rpID: rpId,
      userID: new TextEncoder().encode(userId),
      userName,
      userDisplayName,
      attestationType: 'none',
      excludeCredentials: exclude.map((key) => ({ id: key.id, ...(key.transports ? { transports: key.transports } : {}) })),
      // Discoverable, so signing in needs no handle: the passkey says who it is.
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    })
  },

  async verifyRegistration({ response, challenge, origin, rpId }) {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: false,
    }).catch(() => null)
    if (!result?.verified || !result.registrationInfo) return null
    const { credential } = result.registrationInfo
    return {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      ...(credential.transports ? { transports: credential.transports } : {}),
    }
  },

  async authenticationOptions({ rpId }) {
    return generateAuthenticationOptions({ rpID: rpId, userVerification: 'preferred' })
  },

  async verifyAuthentication({ response, challenge, origin, rpId, passkey }) {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: false,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
        counter: passkey.counter,
        ...(passkey.transports ? { transports: passkey.transports } : {}),
      },
    }).catch(() => null)
    if (!result?.verified) return null
    return { counter: result.authenticationInfo.newCounter }
  },
}
