/**
 * USDC amounts.
 *
 * One rule, applied everywhere: money is a `bigint` in minor units, never a
 * `number`. Floating point cannot represent 0.1 exactly, so any float in an
 * accounting path eventually produces a balance that is off by dust — and dust
 * in a fee split means the books do not close.
 *
 * "Accounting units" throughout this codebase means USDC minor units at 6
 * decimal places: 1 USDC = 1_000_000n. That matches Circle's API, the
 * `decimal(20, 6)` columns in Postgres, and the decimal strings we put on the
 * wire.
 *
 * On-chain units may differ — if Arc's native token uses 18 decimals, the
 * chain layer scales with `scaleUnits` at the boundary. Accounting stays at 6
 * regardless, so the chain's quirks never leak into the fee math.
 */

export const USDC_DECIMALS = 6

/** 1 USDC in accounting units. */
export const ONE_USDC = 1_000_000n

/**
 * Rejects anything that is not a plain non-negative decimal:
 * exponent notation, thousands separators, signs, `Infinity`, `NaN`, spaces.
 * Accepts `"5"`, `"5."`, `".5"`, `"0.500000"`, `"00.5"`.
 */
const DECIMAL_RE = /^(\d*)(?:\.(\d*))?$/

export class UsdcParseError extends Error {
  constructor(
    public readonly input: string,
    message: string,
  ) {
    super(message)
    this.name = 'UsdcParseError'
  }
}

/**
 * Parses a decimal string into accounting units.
 *
 * @throws {UsdcParseError} on any malformed input, including more than 6
 * decimal places — silently truncating a 7th place would lose a user's money
 * without telling them.
 */
export function parseUsdc(input: string): bigint {
  if (typeof input !== 'string') {
    throw new UsdcParseError(String(input), 'Amount must be a string.')
  }

  const trimmed = input.trim()
  if (trimmed === '') {
    throw new UsdcParseError(input, 'Amount is empty.')
  }

  const match = DECIMAL_RE.exec(trimmed)
  if (!match) {
    throw new UsdcParseError(input, `"${trimmed}" is not a plain decimal number.`)
  }

  const whole = match[1] ?? ''
  const frac = match[2] ?? ''

  // "." alone matches the regex but carries no digits.
  if (whole === '' && frac === '') {
    throw new UsdcParseError(input, `"${trimmed}" contains no digits.`)
  }

  if (frac.length > USDC_DECIMALS) {
    throw new UsdcParseError(
      input,
      `USDC supports at most ${USDC_DECIMALS} decimal places; "${trimmed}" has ${frac.length}.`,
    )
  }

  const paddedFrac = frac.padEnd(USDC_DECIMALS, '0')
  return BigInt(`${whole === '' ? '0' : whole}${paddedFrac}`)
}

/** Non-throwing `parseUsdc`, for validating live input as the user types. */
export function tryParseUsdc(input: string): bigint | null {
  try {
    return parseUsdc(input)
  } catch {
    return null
  }
}

export interface FormatUsdcOptions {
  /**
   * Minimum decimal places to show. Defaults to 2, so ordinary amounts read
   * as money ("5.00") rather than as integers ("5").
   */
  minDecimals?: number
}

/**
 * Renders accounting units as a decimal string.
 *
 * Trailing zeros beyond `minDecimals` are trimmed, so full precision survives
 * when it matters (`1.234567`) without padding every amount to six places.
 */
export function formatUsdc(amount: bigint, options: FormatUsdcOptions = {}): string {
  const minDecimals = options.minDecimals ?? 2

  if (minDecimals < 0 || minDecimals > USDC_DECIMALS) {
    throw new RangeError(`minDecimals must be between 0 and ${USDC_DECIMALS}.`)
  }

  const negative = amount < 0n
  const abs = negative ? -amount : amount

  const whole = abs / ONE_USDC
  const fracDigits = (abs % ONE_USDC).toString().padStart(USDC_DECIMALS, '0')

  // Trim trailing zeros, but never below the requested minimum.
  let end = fracDigits.length
  while (end > minDecimals && fracDigits[end - 1] === '0') end--
  const frac = fracDigits.slice(0, end)

  const sign = negative ? '-' : ''
  return frac === '' ? `${sign}${whole}` : `${sign}${whole}.${frac}`
}

/**
 * Converts between decimal precisions — the accounting/on-chain boundary.
 *
 * Scaling *down* (more decimals to fewer) truncates toward zero, which can
 * silently drop value. Callers that must not lose anything should compare the
 * round trip; the chain layer only ever scales up, so it is safe there.
 */
export function scaleUnits(amount: bigint, fromDecimals: number, toDecimals: number): bigint {
  if (!Number.isInteger(fromDecimals) || !Number.isInteger(toDecimals)) {
    throw new RangeError('Decimals must be integers.')
  }
  if (fromDecimals < 0 || toDecimals < 0) {
    throw new RangeError('Decimals must be non-negative.')
  }

  if (fromDecimals === toDecimals) return amount

  if (toDecimals > fromDecimals) {
    return amount * 10n ** BigInt(toDecimals - fromDecimals)
  }
  return amount / 10n ** BigInt(fromDecimals - toDecimals)
}
