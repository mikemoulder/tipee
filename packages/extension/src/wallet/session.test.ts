import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  IDLE_TIMEOUT_MS,
  isUnlocked,
  lock,
  sessionMnemonic,
  setUnlockPolicy,
  unlock,
  unlockPolicy,
} from './session'

const PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

vi.mock('./keystore', () => ({
  unlockWallet: vi.fn(async (pin: string) => {
    if (pin !== '123456') throw new Error('wrong pin')
    return PHRASE
  }),
}))

/** `local` survives a browser restart; `session` does not. Both in memory here. */
function fakeChrome(): { local: Record<string, unknown>; session: Record<string, unknown> } {
  const local: Record<string, unknown> = {}
  const session: Record<string, unknown> = {}
  const area = (store: Record<string, unknown>) => ({
    get: async (keys: string | string[]) => {
      const wanted = Array.isArray(keys) ? keys : [keys]
      return Object.fromEntries(wanted.map((key) => [key, store[key]]))
    },
    set: async (values: Record<string, unknown>) => void Object.assign(store, values),
    remove: async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key]
    },
  })

  vi.stubGlobal('chrome', { storage: { local: area(local), session: area(session) } })
  return { local, session }
}

beforeEach(() => vi.unstubAllGlobals())

describe('staying unlocked', () => {
  it('keeps the wallet open once the PIN has been accepted', async () => {
    fakeChrome()
    await unlock('123456')

    expect(await sessionMnemonic()).toBe(PHRASE)
    expect(await isUnlocked()).toBe(true)
  })

  it('starts locked, because nothing is in session storage yet', async () => {
    // Session storage is memory-backed and dies with the browser, which is what
    // makes "locked on browser open" true without any timer of our own.
    fakeChrome()
    expect(await isUnlocked()).toBe(false)
  })

  it('never keeps the seed where a restart could find it', async () => {
    const store = fakeChrome()
    await unlock('123456')

    expect(JSON.stringify(store.local)).not.toContain('sausage')
    expect(JSON.stringify(store.session)).toContain('sausage')
  })

  it('still refuses a wrong PIN', async () => {
    fakeChrome()
    await expect(unlock('000000')).rejects.toThrow()
    expect(await isUnlocked()).toBe(false)
  })

  it('forgets on demand', async () => {
    fakeChrome()
    await unlock('123456')
    await lock()

    expect(await sessionMnemonic()).toBeNull()
  })
})

describe('the unlock rule', () => {
  it('keeps the wallet open until the browser closes, by default', async () => {
    fakeChrome()
    expect(await unlockPolicy()).toBe('session')
  })

  it('asks every time when the owner says so, and locks the moment they say it', async () => {
    fakeChrome()
    await unlock('123456')
    await setUnlockPolicy('always')

    expect(await sessionMnemonic()).toBeNull()

    // And a later unlock does not reopen the session either.
    await unlock('123456')
    expect(await sessionMnemonic()).toBeNull()
  })

  it('expires a timed session once the wallet has sat unused', async () => {
    fakeChrome()
    await setUnlockPolicy('timeout')
    await unlock('123456')

    const start = Date.now()
    expect(await sessionMnemonic(start + IDLE_TIMEOUT_MS - 1_000)).toBe(PHRASE)
    expect(await sessionMnemonic(start + IDLE_TIMEOUT_MS * 3)).toBeNull()
  })

  it('measures idleness from the last use, not from the unlock', async () => {
    // Otherwise a long session of sending locks itself mid-flow.
    fakeChrome()
    await setUnlockPolicy('timeout')
    await unlock('123456')

    const start = Date.now()
    const nearly = start + IDLE_TIMEOUT_MS - 1_000
    expect(await sessionMnemonic(nearly)).toBe(PHRASE)
    expect(await sessionMnemonic(nearly + IDLE_TIMEOUT_MS - 1_000)).toBe(PHRASE)
  })

  it('falls back to asking for the PIN when session storage is unavailable', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        session: {
          get: async () => {
            throw new Error('no session storage')
          },
          set: async () => {
            throw new Error('no session storage')
          },
          remove: async () => {},
        },
      },
    })

    await expect(unlock('123456')).resolves.toBe(PHRASE)
    expect(await sessionMnemonic()).toBeNull()
  })
})
