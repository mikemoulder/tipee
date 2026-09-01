// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'

import { WalletLockedError, WalletWipedError } from '../wallet/keystore'

let shorten: (address: string) => string
let unlockMessage: (error: unknown) => string

beforeAll(async () => {
  // The module boots on import and reads storage; without this it throws before
  // a single export is reachable.
  Object.assign(globalThis, {
    chrome: { storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } } },
  })
  document.body.innerHTML = '<main id="app"></main>'
  const popup = await import('./main')
  shorten = popup.shorten
  unlockMessage = popup.unlockMessage
})

describe('shortened addresses', () => {
  it('keeps both ends, which is what makes one recognisable', () => {
    expect(shorten('0x742d35cc6634c0532925a3b844bc454e4438f44e')).toBe('0x742d…f44e')
  })

  it('leaves anything already short alone', () => {
    expect(shorten('0xabc')).toBe('0xabc')
  })
})

describe('unlock failures', () => {
  it('says how long a locked wallet has to wait', () => {
    expect(unlockMessage(new WalletLockedError(4_200))).toBe('Too many attempts. Try again in 5s.')
  })

  it('says plainly when the wallet is gone', () => {
    expect(unlockMessage(new WalletWipedError())).toBe(
      'Too many wrong PINs — this wallet has been erased.',
    )
  })

  it('gives nothing away about the PIN for anything else', () => {
    // Never echo length, digits, or how close a guess was.
    for (const error of [new Error('boom'), 'nonsense', null]) {
      expect(unlockMessage(error)).toBe('That PIN is not correct.')
    }
  })
})
