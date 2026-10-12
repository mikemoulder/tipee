import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  SESSION_TTL_MS,
  fileAccounts,
  issueSession,
  memoryAccounts,
  readSession,
  type AccountStore,
  type CreatorAccount,
  type Passkeys,
} from './accounts.ts'
import { buildApp } from './app.ts'
import type { StellarGateway } from './stellar.ts'
import { memoryStore } from './store.ts'

const CHANNEL = 'UCsBjURrPoezykLs9EqgamOA'
const PAYOUT = 'GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP'
const OTHER = 'CALSZXYNONPSDJD4UCZO5PE2MO66NGUEHP2SR5ZLHVLZEBR2XSGAQWZ2'
const SITE = 'https://tipee.example'
const TX = 'cd'.repeat(32)

function account(overrides: Partial<CreatorAccount> = {}): CreatorAccount {
  return {
    channelId: CHANNEL,
    handle: '@fireship',
    displayName: 'Fireship',
    avatarUrl: null,
    payoutAddress: PAYOUT,
    passkeys: [{ id: 'key-1', publicKey: 'pk', counter: 0, createdAt: '2026-10-12T00:00:00.000Z' }],
    payouts: [],
    createdAt: '2026-10-12T00:00:00.000Z',
    ...overrides,
  }
}

describe('sessions', () => {
  const secret = Buffer.alloc(32, 7)
  const now = new Date('2026-10-12T12:00:00Z')

  it('round-trips the channel it was issued for', () => {
    const { token } = issueSession(secret, CHANNEL, now)
    expect(readSession(secret, token, now)).toBe(CHANNEL)
  })

  it('refuses a token naming another channel, or signed with another secret', () => {
    const { token } = issueSession(secret, CHANNEL, now)
    const [, expiry, mac] = token.split('.')
    expect(readSession(secret, `UCBJycsmduvYEL83R_U4JriQ.${expiry}.${mac}`, now)).toBeNull()
    expect(readSession(Buffer.alloc(32, 8), token, now)).toBeNull()
  })

  it('expires', () => {
    const { token } = issueSession(secret, CHANNEL, now)
    expect(readSession(secret, token, new Date(now.getTime() + SESSION_TTL_MS + 1))).toBeNull()
  })
})

describe('the account file', () => {
  it('survives a restart, secret included, and is private to its owner', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'tipee-accounts-')), 'accounts.json')
    const first = fileAccounts(path)
    await first.save(account())

    const second = fileAccounts(path)
    expect(second.secret.equals(first.secret)).toBe(true)
    expect(await second.byPasskeyId('key-1')).toMatchObject({ channelId: CHANNEL, payoutAddress: PAYOUT })
    expect(JSON.parse(readFileSync(path, 'utf8')).accounts).toHaveLength(1)
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })
})

/* The routes, with a stand-in authenticator ----------------------------------- */

function fakePasskeys(overrides: Partial<Passkeys> = {}): Passkeys {
  return {
    registrationOptions: vi.fn(async () => ({ challenge: 'reg-challenge' }) as never),
    verifyRegistration: vi.fn(async () => ({ id: 'key-new', publicKey: 'pk', counter: 0 })),
    authenticationOptions: vi.fn(async () => ({ challenge: 'auth-challenge' }) as never),
    verifyAuthentication: vi.fn(async () => ({ counter: 5 })),
    ...overrides,
  }
}

function fakeStellar(overrides: Partial<StellarGateway> = {}): StellarGateway {
  return {
    escrowBalance: vi.fn(async () => 10_000_000n),
    escrowLifetime: vi.fn(async () => 12_500_000n),
    channelActivity: vi.fn(async () => ({
      events: [
        { kind: 'tip' as const, txHash: TX, at: new Date('2026-10-12T10:00:00Z'), ledger: 9, amount: 5_000_000n, from: OTHER, note: 'thanks' },
      ],
      partial: false,
    })),
    claim: vi.fn(async () => ({ txHash: TX, net: 9_600_000n, fee: 400_000n })),
    verifyTip: vi.fn(async () => null),
    deployWallet: vi.fn(async () => ({ address: OTHER, deployed: true, txHash: TX })),
    usdcBalance: vi.fn(async () => 0n),
    fund: vi.fn(async () => TX),
    relay: vi.fn(async () => TX),
    ...overrides,
  }
}

function fakeYouTube(about = ''): typeof fetch {
  const page = (extra: string) => `<meta itemprop="identifier" content="${CHANNEL}"><meta property="og:title" content="Fireship">${extra}`
  return vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => (String(url).endsWith('/about') ? page(about) : page('')),
  })) as unknown as typeof fetch
}

/** Two apps over one store: the first issues the code, the second sees it on the About page. */
async function verifiedChannel(options: { accounts?: AccountStore; passkeys?: Passkeys; stellar?: StellarGateway } = {}) {
  const store = memoryStore()
  const accounts = options.accounts ?? memoryAccounts()
  const stellar = options.stellar ?? fakeStellar()
  const deps = { store, stellar, accounts: { store: accounts, passkeys: options.passkeys ?? fakePasskeys(), origins: [SITE] } }
  const first = buildApp({ ...deps, fetchImpl: fakeYouTube() })
  const token = (await first.inject({ method: 'POST', url: '/api/creators/verify/init', payload: { handle: '@fireship' } })).json().token as string
  const server = buildApp({ ...deps, fetchImpl: fakeYouTube(`code ${token}`) })
  await server.inject({ method: 'POST', url: '/api/creators/verify/confirm', payload: { token } })
  return { server, token, accounts, stellar }
}

async function register(server: ReturnType<typeof buildApp>, token: string, payout = PAYOUT) {
  const options = await server.inject({ method: 'POST', url: '/api/accounts/register/options', headers: { origin: SITE }, payload: { token } })
  return server.inject({
    method: 'POST',
    url: '/api/accounts/register/verify',
    headers: { origin: SITE },
    payload: { challenge_id: options.json().challenge_id, response: { id: 'key-new' }, payout_address: payout },
  })
}

describe('creator accounts', () => {
  it('only lets the Tipee site register a passkey', async () => {
    const { server, token } = await verifiedChannel()
    const response = await server.inject({
      method: 'POST',
      url: '/api/accounts/register/options',
      headers: { origin: 'https://evil.example' },
      payload: { token },
    })
    expect(response.statusCode).toBe(403)
  })

  it('refuses a code that was never checked against the channel', async () => {
    const store = memoryStore()
    const server = buildApp({ store, stellar: fakeStellar(), fetchImpl: fakeYouTube(), accounts: { store: memoryAccounts(), passkeys: fakePasskeys(), origins: [SITE] } })
    const token = (await server.inject({ method: 'POST', url: '/api/creators/verify/init', payload: { handle: '@fireship' } })).json().token
    const response = await server.inject({ method: 'POST', url: '/api/accounts/register/options', headers: { origin: SITE }, payload: { token } })
    expect(response.statusCode).toBe(403)
    expect(response.json().error).toBe('not_verified')
  })

  it('registers a passkey and payout address, binding the passkey to the site it came from', async () => {
    const passkeys = fakePasskeys()
    const { server, token, accounts } = await verifiedChannel({ passkeys })
    const response = await register(server, token)

    expect(response.statusCode).toBe(201)
    expect(response.json().channel_id).toBe(CHANNEL)
    expect(passkeys.verifyRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ challenge: 'reg-challenge', origin: SITE, rpId: 'tipee.example' }),
    )
    expect(await accounts.byChannelId(CHANNEL)).toMatchObject({ payoutAddress: PAYOUT, passkeys: [{ id: 'key-new' }] })

    const resolved = await server.inject({ method: 'GET', url: '/api/creators/resolve?handle=%40fireship' })
    expect(resolved.json().has_account).toBe(true)
  })

  it('needs a payout address for a new account', async () => {
    const { server, token } = await verifiedChannel()
    const response = await register(server, token, '')
    expect(response.statusCode).toBe(400)
  })

  it('does not accept a challenge twice', async () => {
    const { server, token } = await verifiedChannel()
    const options = await server.inject({ method: 'POST', url: '/api/accounts/register/options', headers: { origin: SITE }, payload: { token } })
    const body = { challenge_id: options.json().challenge_id, response: { id: 'key-new' }, payout_address: PAYOUT }
    await server.inject({ method: 'POST', url: '/api/accounts/register/verify', headers: { origin: SITE }, payload: body })
    const again = await server.inject({ method: 'POST', url: '/api/accounts/register/verify', headers: { origin: SITE }, payload: body })
    expect(again.statusCode).toBe(400)
  })

  it('signs in with the passkey alone and shows the dashboard from chain', async () => {
    const { server, token } = await verifiedChannel()
    await register(server, token)

    const options = await server.inject({ method: 'POST', url: '/api/accounts/signin/options', headers: { origin: SITE } })
    const signin = await server.inject({
      method: 'POST',
      url: '/api/accounts/signin/verify',
      headers: { origin: SITE },
      payload: { challenge_id: options.json().challenge_id, response: { id: 'key-new' } },
    })
    expect(signin.statusCode).toBe(200)

    const me = await server.inject({ method: 'GET', url: '/api/accounts/me', headers: { authorization: `Bearer ${signin.json().session}` } })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({
      payout_address: PAYOUT,
      balance: '10.00',
      lifetime: '12.50',
      claimed: '2.50',
      activity: [{ kind: 'tip', amount: '5.00', note: 'thanks' }],
    })
  })

  it('does not know a passkey it never registered', async () => {
    const { server } = await verifiedChannel()
    const options = await server.inject({ method: 'POST', url: '/api/accounts/signin/options', headers: { origin: SITE } })
    const signin = await server.inject({
      method: 'POST',
      url: '/api/accounts/signin/verify',
      headers: { origin: SITE },
      payload: { challenge_id: options.json().challenge_id, response: { id: 'stranger' } },
    })
    expect(signin.statusCode).toBe(404)
  })

  it('keeps the dashboard and payouts behind a session', async () => {
    const { server } = await verifiedChannel()
    expect((await server.inject({ method: 'GET', url: '/api/accounts/me' })).statusCode).toBe(401)
    expect((await server.inject({ method: 'POST', url: '/api/accounts/me/payout', headers: { authorization: 'Bearer forged.1.x' } })).statusCode).toBe(401)
  })

  it('pays out only to the saved address, without a new code', async () => {
    const { server, token, stellar, accounts } = await verifiedChannel()
    const session = (await register(server, token)).json().session

    const paid = await server.inject({ method: 'POST', url: '/api/accounts/me/payout', headers: { authorization: `Bearer ${session}` } })
    expect(paid.statusCode).toBe(201)
    expect(paid.json()).toMatchObject({ amount_net: '9.60', platform_fee: '0.40', to: PAYOUT })
    expect(stellar.claim).toHaveBeenCalledWith(CHANNEL, PAYOUT)
    expect((await accounts.byChannelId(CHANNEL))?.payouts).toHaveLength(1)
  })

  it('changes the payout address for the signed-in channel', async () => {
    const { server, token, accounts } = await verifiedChannel()
    const session = (await register(server, token)).json().session
    const bad = await server.inject({ method: 'POST', url: '/api/accounts/me/payout-address', headers: { authorization: `Bearer ${session}` }, payload: { address: '0xabc' } })
    expect(bad.statusCode).toBe(400)
    const good = await server.inject({ method: 'POST', url: '/api/accounts/me/payout-address', headers: { authorization: `Bearer ${session}` }, payload: { address: OTHER } })
    expect(good.statusCode).toBe(200)
    expect((await accounts.byChannelId(CHANNEL))?.payoutAddress).toBe(OTHER)
  })

  it('says there is nothing to pay out', async () => {
    const { server, token } = await verifiedChannel({ stellar: fakeStellar({ escrowBalance: vi.fn(async () => 0n) }) })
    const session = (await register(server, token)).json().session
    const paid = await server.inject({ method: 'POST', url: '/api/accounts/me/payout', headers: { authorization: `Bearer ${session}` } })
    expect(paid.statusCode).toBe(409)
  })
})
