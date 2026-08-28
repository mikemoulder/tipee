/**
 * The platform fee.
 *
 * Tipee takes nothing on a tip and 4% when a creator withdraws (idea.md §9).
 * The split has one property that must hold for every possible input:
 *
 *     fee + net === gross
 *
 * Compute the fee by flooring, then derive the net by *subtraction* rather
 * than by a second multiplication. Two independent roundings would leave the
 * odd unit unaccounted for — a single unit of USDC is worth nothing, but a
 * withdrawal whose parts do not sum to its whole is a reconciliation bug that
 * surfaces much later and much more expensively.
 *
 * Flooring the fee means any remainder favours the creator, which is the right
 * direction for a rounding error to point.
 */

import { formatUsdc } from './usdc'

/** 4%, in basis points. */
export const PLATFORM_FEE_BPS = 400n

export const BPS_DENOMINATOR = 10_000n

export interface WithdrawalSplit {
  /** Total withdrawn, in accounting units. */
  gross: bigint
  /** Platform fee to the treasury. */
  fee: bigint
  /** Paid to the creator's own wallet. Always `gross - fee`. */
  net: bigint
}

/**
 * Splits a withdrawal into the creator's share and the platform fee.
 *
 * @throws {RangeError} on a negative gross — a negative withdrawal is never a
 * rounding artifact, it is a caller bug, and silently clamping it would hide
 * the real problem.
 */
export function splitWithdrawal(gross: bigint): WithdrawalSplit {
  if (gross < 0n) {
    throw new RangeError(`Gross withdrawal cannot be negative (got ${gross}).`)
  }

  const fee = (gross * PLATFORM_FEE_BPS) / BPS_DENOMINATOR
  const net = gross - fee

  return { gross, fee, net }
}

/** The same split as display strings, for receipts and API responses. */
export function formatWithdrawalSplit(gross: bigint): {
  amount_gross: string
  platform_fee: string
  amount_net: string
} {
  const split = splitWithdrawal(gross)
  return {
    amount_gross: formatUsdc(split.gross),
    platform_fee: formatUsdc(split.fee),
    amount_net: formatUsdc(split.net),
  }
}
