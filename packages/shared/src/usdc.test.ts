import { describe, expect, it } from 'vitest'

import {
  ONE_USDC,
  USDC_DECIMALS,
  UsdcParseError,
  formatUsdc,
  parseUsdc,
  scaleUnits,
  tryParseUsdc,
} from './usdc.ts'

describe('parseUsdc', () => {
  it('parses ordinary amounts', () => {
    expect(parseUsdc('0')).toBe(0n)
    expect(parseUsdc('1')).toBe(1_000_000n)
    expect(parseUsdc('5.00')).toBe(5_000_000n)
    expect(parseUsdc('0.5')).toBe(500_000n)
    expect(parseUsdc('0.50')).toBe(500_000n)
    expect(parseUsdc('127.00')).toBe(127_000_000n)
  })

  it('parses full six-decimal precision', () => {
    expect(parseUsdc('0.000001')).toBe(1n)
    expect(parseUsdc('1.234567')).toBe(1_234_567n)
  })

  it('accepts loose but unambiguous forms', () => {
    expect(parseUsdc('.5')).toBe(500_000n)
    expect(parseUsdc('5.')).toBe(5_000_000n)
    expect(parseUsdc('007')).toBe(7_000_000n)
    expect(parseUsdc('  2.50  ')).toBe(2_500_000n)
  })

  it('handles amounts far beyond Number.MAX_SAFE_INTEGER', () => {
    // 10 billion USDC is 10^16 minor units — still exact as a bigint, and the
    // reason none of this code path uses `number`.
    expect(parseUsdc('10000000000')).toBe(10_000_000_000n * ONE_USDC)
    expect(parseUsdc('9007199254740993.000001')).toBe(9_007_199_254_740_993_000_001n)
  })

  it('rejects more precision than USDC has, rather than truncating', () => {
    // Silently dropping the 7th place would lose the user's money without
    // telling them.
    expect(() => parseUsdc('0.0000001')).toThrow(UsdcParseError)
    expect(() => parseUsdc('1.1234567')).toThrow(/at most 6 decimal places/)
  })

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['.', 'no digits'],
    ['abc', 'not a number'],
    ['-1', 'negative'],
    ['-0.5', 'negative fraction'],
    ['+1', 'explicit sign'],
    ['1e6', 'exponent notation'],
    ['1E6', 'uppercase exponent'],
    ['1,000', 'thousands separator'],
    ['1 000', 'internal space'],
    ['Infinity', 'infinity'],
    ['NaN', 'NaN'],
    ['0x10', 'hex'],
    ['1.2.3', 'two decimal points'],
    ['1..2', 'doubled decimal point'],
  ])('rejects %j (%s)', (input) => {
    expect(() => parseUsdc(input)).toThrow(UsdcParseError)
  })

  it('rejects non-strings', () => {
    expect(() => parseUsdc(5 as unknown as string)).toThrow(UsdcParseError)
    expect(() => parseUsdc(null as unknown as string)).toThrow(UsdcParseError)
    expect(() => parseUsdc(undefined as unknown as string)).toThrow(UsdcParseError)
  })

  it('reports the offending input on the error', () => {
    try {
      parseUsdc('1e6')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(UsdcParseError)
      expect((err as UsdcParseError).input).toBe('1e6')
    }
  })
})

describe('tryParseUsdc', () => {
  it('returns null instead of throwing, for live input validation', () => {
    expect(tryParseUsdc('5.00')).toBe(5_000_000n)
    expect(tryParseUsdc('5.')).toBe(5_000_000n)
    expect(tryParseUsdc('nope')).toBeNull()
    expect(tryParseUsdc('')).toBeNull()
    expect(tryParseUsdc('-1')).toBeNull()
  })
})

describe('formatUsdc', () => {
  it('shows two decimals by default, so amounts read as money', () => {
    expect(formatUsdc(0n)).toBe('0.00')
    expect(formatUsdc(5_000_000n)).toBe('5.00')
    expect(formatUsdc(500_000n)).toBe('0.50')
    expect(formatUsdc(127_000_000n)).toBe('127.00')
    expect(formatUsdc(5_080_000n)).toBe('5.08')
  })

  it('keeps precision beyond two places when it exists', () => {
    expect(formatUsdc(1_234_567n)).toBe('1.234567')
    expect(formatUsdc(1n)).toBe('0.000001')
    expect(formatUsdc(1_005_000n)).toBe('1.005')
  })

  it('honours minDecimals', () => {
    expect(formatUsdc(5_000_000n, { minDecimals: 0 })).toBe('5')
    expect(formatUsdc(5_000_000n, { minDecimals: 6 })).toBe('5.000000')
    expect(formatUsdc(500_000n, { minDecimals: 0 })).toBe('0.5')
  })

  it('rejects an out-of-range minDecimals', () => {
    expect(() => formatUsdc(1n, { minDecimals: -1 })).toThrow(RangeError)
    expect(() => formatUsdc(1n, { minDecimals: 7 })).toThrow(RangeError)
  })

  it('formats negatives, for balance deltas', () => {
    expect(formatUsdc(-5_000_000n)).toBe('-5.00')
    expect(formatUsdc(-1n)).toBe('-0.000001')
  })

  it('round-trips with parseUsdc', () => {
    const amounts = [0n, 1n, 500_000n, ONE_USDC, 127_000_000n, 1_234_567n, 10n ** 18n]
    for (const amount of amounts) {
      expect(parseUsdc(formatUsdc(amount, { minDecimals: 6 }))).toBe(amount)
    }
  })
})

describe('scaleUnits', () => {
  it('is a no-op at equal precision', () => {
    expect(scaleUnits(5_000_000n, 6, 6)).toBe(5_000_000n)
  })

  it('scales 6-decimal accounting units up to an 18-decimal chain', () => {
    // The case that matters if Arc's native token turns out to use 18 decimals:
    // 1 USDC of accounting becomes 10^18 on-chain units.
    expect(scaleUnits(ONE_USDC, 6, 18)).toBe(10n ** 18n)
    expect(scaleUnits(500_000n, 6, 18)).toBe(5n * 10n ** 17n)
  })

  it('scales back down exactly when nothing was lost', () => {
    expect(scaleUnits(10n ** 18n, 18, 6)).toBe(ONE_USDC)
  })

  it('truncates toward zero when scaling down loses precision', () => {
    // Documented, deliberate, and the reason gas estimates are never scaled
    // down before validation — truncating a fee understates it.

    // Just under one accounting unit: rounds away to nothing.
    expect(scaleUnits(999_999_999_999n, 18, 6)).toBe(0n)
    // Just under two: keeps the whole unit, drops the remainder.
    expect(scaleUnits(1_999_999_999_999n, 18, 6)).toBe(1n)
    expect(scaleUnits(10n ** 18n + 999n, 18, 6)).toBe(ONE_USDC)
  })

  it('rejects invalid precisions', () => {
    expect(() => scaleUnits(1n, -1, 6)).toThrow(RangeError)
    expect(() => scaleUnits(1n, 6, -1)).toThrow(RangeError)
    expect(() => scaleUnits(1n, 1.5, 6)).toThrow(RangeError)
  })
})

describe('constants', () => {
  it('pins USDC precision', () => {
    expect(USDC_DECIMALS).toBe(6)
    expect(ONE_USDC).toBe(1_000_000n)
  })
})
