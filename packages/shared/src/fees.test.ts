import { describe, expect, it } from 'vitest'

import { BPS_DENOMINATOR, PLATFORM_FEE_BPS, formatWithdrawalSplit, splitWithdrawal } from './fees'
import { ONE_USDC, formatUsdc, parseUsdc } from './usdc'

describe('splitWithdrawal', () => {
  it('takes 4%', () => {
    expect(PLATFORM_FEE_BPS).toBe(400n)
    expect(BPS_DENOMINATOR).toBe(10_000n)

    const { fee, net } = splitWithdrawal(100n * ONE_USDC)
    expect(formatUsdc(fee)).toBe('4.00')
    expect(formatUsdc(net)).toBe('96.00')
  })

  it('matches the worked examples in idea.md', () => {
    // §4.2: $127.00 gross → $5.08 fee → $121.92 net
    expect(formatWithdrawalSplit(parseUsdc('127.00'))).toEqual({
      amount_gross: '127.00',
      platform_fee: '5.08',
      amount_net: '121.92',
    })

    // §9: $500.00 gross → $20.00 fee → $480.00 net
    expect(formatWithdrawalSplit(parseUsdc('500.00'))).toEqual({
      amount_gross: '500.00',
      platform_fee: '20.00',
      amount_net: '480.00',
    })
  })

  describe('the invariant: fee + net === gross', () => {
    // Every case below is a gross amount whose 4% is not a whole number of
    // minor units. If the net were computed by a second multiplication rather
    // than by subtraction, the odd unit would vanish and the books would not
    // close.
    const awkward: bigint[] = [
      0n,
      1n,
      2n,
      3n,
      7n,
      13n,
      24n, // 4% = 0.96 units → floors to 0
      25n, // 4% = exactly 1 unit
      26n,
      99n,
      101n,
      499_999n, // one unit below the minimum tip
      500_000n,
      999_999n,
      1_000_001n,
      7_777_777n,
      123_456_789n,
      ONE_USDC * 1_000_000n,
      10n ** 18n,
      2n ** 63n - 1n,
    ]

    it.each(awkward)('holds for %s', (gross) => {
      const split = splitWithdrawal(gross)
      expect(split.fee + split.net).toBe(gross)
    })

    it('holds across a dense sweep', () => {
      for (let gross = 0n; gross <= 5_000n; gross++) {
        const split = splitWithdrawal(gross)
        expect(split.fee + split.net).toBe(gross)
      }
    })
  })

  it('floors the fee, so any remainder favours the creator', () => {
    // 4% of 24 units is 0.96 — the platform gets nothing rather than rounding up.
    expect(splitWithdrawal(24n)).toEqual({ gross: 24n, fee: 0n, net: 24n })

    // 4% of 49 units is 1.96 — floors to 1, creator keeps 48.
    expect(splitWithdrawal(49n)).toEqual({ gross: 49n, fee: 1n, net: 48n })
  })

  it('never lets the fee exceed the gross', () => {
    for (const gross of [0n, 1n, 5n, 25n, ONE_USDC, 10n ** 20n]) {
      const split = splitWithdrawal(gross)
      expect(split.fee).toBeLessThanOrEqual(gross)
      expect(split.net).toBeGreaterThanOrEqual(0n)
    }
  })

  it('handles a zero withdrawal without producing dust', () => {
    expect(splitWithdrawal(0n)).toEqual({ gross: 0n, fee: 0n, net: 0n })
  })

  it('rejects a negative gross rather than clamping it', () => {
    expect(() => splitWithdrawal(-1n)).toThrow(RangeError)
    expect(() => splitWithdrawal(-ONE_USDC)).toThrow(/cannot be negative/)
  })
})
