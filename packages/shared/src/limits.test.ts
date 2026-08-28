import { describe, expect, it } from 'vitest'

import {
  MIN_TIP,
  TIP_PRESETS,
  maxTippable,
  minTipInUnits,
  validateTip,
} from './limits'
import { ONE_USDC } from './usdc'

/** Standard 6-decimal case: minimum is 0.50 USDC. */
const min = MIN_TIP

describe('MIN_TIP', () => {
  it('is 0.50 USDC', () => {
    expect(MIN_TIP).toBe(500_000n)
  })
})

describe('TIP_PRESETS', () => {
  it('offers $1 / $5 / $10 / $25', () => {
    expect(TIP_PRESETS).toEqual([1_000_000n, 5_000_000n, 10_000_000n, 25_000_000n])
  })

  it('every preset clears the minimum', () => {
    for (const preset of TIP_PRESETS) {
      expect(preset).toBeGreaterThanOrEqual(MIN_TIP)
    }
  })
})

describe('minTipInUnits', () => {
  it('lifts the minimum into 18-decimal chain units exactly', () => {
    expect(minTipInUnits(6)).toBe(500_000n)
    expect(minTipInUnits(18)).toBe(5n * 10n ** 17n)
  })
})

describe('validateTip', () => {
  it('accepts a tip the wallet can actually afford', () => {
    const result = validateTip({
      amount: 5n * ONE_USDC,
      balance: 45n * ONE_USDC,
      gasCost: 10_000n,
      minimum: min,
    })
    expect(result).toEqual({ ok: true, amount: 5n * ONE_USDC })
  })

  it('accepts exactly the minimum', () => {
    const result = validateTip({
      amount: min,
      balance: 10n * ONE_USDC,
      gasCost: 10_000n,
      minimum: min,
    })
    expect(result.ok).toBe(true)
  })

  it('rejects one unit below the minimum', () => {
    const result = validateTip({
      amount: min - 1n,
      balance: 10n * ONE_USDC,
      gasCost: 0n,
      minimum: min,
    })
    expect(result).toMatchObject({ ok: false, reason: 'below_minimum', shortfall: 1n })
  })

  it.each([0n, -1n, -ONE_USDC])('rejects a non-positive amount (%s)', (amount) => {
    const result = validateTip({ amount, balance: 10n * ONE_USDC, gasCost: 0n, minimum: min })
    expect(result).toMatchObject({ ok: false, reason: 'invalid_amount' })
  })

  it('rejects more than the balance, and reports the shortfall', () => {
    const result = validateTip({
      amount: 50n * ONE_USDC,
      balance: 45n * ONE_USDC,
      gasCost: 0n,
      minimum: min,
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'insufficient_balance',
      shortfall: 5n * ONE_USDC,
    })
  })

  describe('gas headroom', () => {
    // On Arc, gas is paid in USDC — the same asset as the tip. A wallet holding
    // exactly the tip amount therefore cannot send it: the fee has nowhere to
    // come from. Checking `amount <= balance` alone passes this straight
    // through to an on-chain revert, burning the user's gas for nothing.

    it('rejects a tip equal to the entire balance', () => {
      const balance = 5n * ONE_USDC
      const result = validateTip({ amount: balance, balance, gasCost: 10_000n, minimum: min })
      expect(result).toMatchObject({
        ok: false,
        reason: 'insufficient_for_gas',
        shortfall: 10_000n,
      })
    })

    it('rejects when the tip leaves one unit too little for gas', () => {
      const result = validateTip({
        amount: 4_990_001n,
        balance: 5_000_000n,
        gasCost: 10_000n,
        minimum: min,
      })
      expect(result).toMatchObject({ ok: false, reason: 'insufficient_for_gas', shortfall: 1n })
    })

    it('accepts when the tip plus gas is exactly the balance', () => {
      const result = validateTip({
        amount: 4_990_000n,
        balance: 5_000_000n,
        gasCost: 10_000n,
        minimum: min,
      })
      expect(result).toEqual({ ok: true, amount: 4_990_000n })
    })

    it('allows the whole balance when gas is free', () => {
      const balance = 5n * ONE_USDC
      const result = validateTip({ amount: balance, balance, gasCost: 0n, minimum: min })
      expect(result.ok).toBe(true)
    })
  })

  it('reports the balance shortfall before the gas shortfall', () => {
    // An amount over balance is the more useful message; naming gas would be
    // misleading when the tip alone does not fit.
    const result = validateTip({
      amount: 100n * ONE_USDC,
      balance: 5n * ONE_USDC,
      gasCost: 10_000n,
      minimum: min,
    })
    expect(result).toMatchObject({ reason: 'insufficient_balance' })
  })

  it('carries a message safe to display without unit context', () => {
    const result = validateTip({ amount: 1n, balance: 0n, gasCost: 0n, minimum: min })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBeTruthy()
      expect(result.message).not.toMatch(/\d/)
    }
  })

  it('validates correctly in 18-decimal chain units too', () => {
    const chainMin = minTipInUnits(18)
    const oneChainUsdc = 10n ** 18n

    expect(
      validateTip({
        amount: oneChainUsdc,
        balance: 2n * oneChainUsdc,
        gasCost: 10n ** 14n,
        minimum: chainMin,
      }).ok,
    ).toBe(true)

    expect(
      validateTip({
        amount: oneChainUsdc,
        balance: oneChainUsdc,
        gasCost: 10n ** 14n,
        minimum: chainMin,
      }),
    ).toMatchObject({ reason: 'insufficient_for_gas' })
  })

  it('rejects negative inputs as caller bugs', () => {
    expect(() => validateTip({ amount: 1n, balance: -1n, gasCost: 0n, minimum: min })).toThrow(
      RangeError,
    )
    expect(() => validateTip({ amount: 1n, balance: 1n, gasCost: -1n, minimum: min })).toThrow(
      RangeError,
    )
    expect(() => validateTip({ amount: 1n, balance: 1n, gasCost: 0n, minimum: -1n })).toThrow(
      RangeError,
    )
  })
})

describe('maxTippable', () => {
  it('reserves gas rather than offering the whole balance', () => {
    expect(maxTippable(5n * ONE_USDC, 10_000n, min)).toBe(4_990_000n)
  })

  it('produces an amount that passes validation', () => {
    const balance = 5n * ONE_USDC
    const gasCost = 12_345n
    const amount = maxTippable(balance, gasCost, min)
    expect(validateTip({ amount, balance, gasCost, minimum: min }).ok).toBe(true)
  })

  it('returns 0 when the remainder would fall below the minimum', () => {
    // The UI disables Max instead of pre-filling an amount that cannot be sent.
    expect(maxTippable(400_000n, 10_000n, min)).toBe(0n)
    expect(maxTippable(505_000n, 10_000n, min)).toBe(0n)
  })

  it('returns 0 for an empty wallet', () => {
    expect(maxTippable(0n, 10_000n, min)).toBe(0n)
  })

  it('returns 0 when gas alone exceeds the balance', () => {
    expect(maxTippable(5_000n, 10_000n, min)).toBe(0n)
  })

  it('returns exactly the minimum at the boundary', () => {
    expect(maxTippable(min + 10_000n, 10_000n, min)).toBe(min)
  })

  it('rejects negative inputs', () => {
    expect(() => maxTippable(-1n, 0n, min)).toThrow(RangeError)
    expect(() => maxTippable(1n, -1n, min)).toThrow(RangeError)
  })
})
