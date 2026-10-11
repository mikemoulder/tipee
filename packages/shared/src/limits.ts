/**
 * Tip limits and validation.
 *
 * The same rules run in two places — the composer (before signing) and the
 * backend (before recording) — so they live here once. If they were duplicated,
 * the two copies would drift and the extension would happily sign transactions
 * the API then rejects.
 *
 * ## A note on units
 *
 * `validateTip` is deliberately unit-agnostic: every amount passed to it must
 * be in the *same* unit, and the caller decides which.
 *
 * Callers that need a gas estimate should validate in **chain units**, because
 * converting the other way loses precision in the dangerous direction. Scaling
 * the minimum *up* from 6 decimals is exact; scaling a gas estimate *down*
 * truncates it, which would understate the cost and let a doomed transaction
 * through. Use `minTipInUnits(decimals)` to lift the minimum into chain units.
 */

import { ONE_USDC, USDC_DECIMALS, scaleUnits } from './usdc.ts'

/** 0.50 USDC, in accounting units (idea.md §9). */
export const MIN_TIP = ONE_USDC / 2n

/** Quick-pick amounts offered in the composer, in accounting units. */
export const TIP_PRESETS: readonly bigint[] = [
  1n * ONE_USDC,
  5n * ONE_USDC,
  10n * ONE_USDC,
  25n * ONE_USDC,
]

/**
 * The minimum tip expressed at a different decimal precision — for validating
 * against on-chain balances when the native token is not 6 decimals.
 */
export function minTipInUnits(decimals: number): bigint {
  return scaleUnits(MIN_TIP, USDC_DECIMALS, decimals)
}

export type TipRejectionReason =
  | 'invalid_amount'
  | 'below_minimum'
  | 'insufficient_balance'
  | 'insufficient_for_gas'

export type TipValidation =
  | { ok: true; amount: bigint }
  | {
      ok: false
      reason: TipRejectionReason
      /** Terse, safe to show as-is. Contains no amounts, so it needs no unit context. */
      message: string
      /** How much more the wallet would need, in the caller's unit. `0n` when not applicable. */
      shortfall: bigint
    }

export interface TipValidationInput {
  /** The tip itself. */
  amount: bigint
  /** Spendable wallet balance. */
  balance: bigint
  /**
   * Estimated network fee. On Arc this is denominated in USDC like the tip
   * itself, which is exactly why it must be subtracted rather than ignored.
   */
  gasCost: bigint
  /** Minimum acceptable tip, in the same unit as the values above. */
  minimum: bigint
}

/**
 * Validates a tip against the wallet's ability to actually send it.
 *
 * The case worth naming: on Arc, gas is paid in USDC, so a wallet holding
 * exactly the tip amount cannot send that tip — the fee has nowhere to come
 * from. Checking `amount <= balance` alone passes that transaction straight
 * through to an on-chain revert, which costs the user gas and tells them
 * nothing useful.
 */
export function validateTip(input: TipValidationInput): TipValidation {
  const { amount, balance, gasCost, minimum } = input

  if (balance < 0n || gasCost < 0n || minimum < 0n) {
    throw new RangeError('Balance, gas cost, and minimum must all be non-negative.')
  }

  if (amount <= 0n) {
    return {
      ok: false,
      reason: 'invalid_amount',
      message: 'Enter an amount to tip.',
      shortfall: 0n,
    }
  }

  if (amount < minimum) {
    return {
      ok: false,
      reason: 'below_minimum',
      message: 'That is below the minimum tip.',
      shortfall: minimum - amount,
    }
  }

  if (amount > balance) {
    return {
      ok: false,
      reason: 'insufficient_balance',
      message: 'That is more than your balance.',
      shortfall: amount - balance,
    }
  }

  const total = amount + gasCost
  if (total > balance) {
    return {
      ok: false,
      reason: 'insufficient_for_gas',
      message: 'Not enough left to cover the network fee.',
      shortfall: total - balance,
    }
  }

  return { ok: true, amount }
}

/**
 * The largest tip this balance can actually send, after reserving gas.
 *
 * A "Max" button must use this rather than the raw balance. Filling in the full
 * balance guarantees a revert, since the fee would have to come out of the same
 * funds. Returns `0n` when the remainder would fall below `minimum`, so the UI
 * can disable Max outright instead of offering an amount that fails validation.
 */
export function maxTippable(balance: bigint, gasCost: bigint, minimum: bigint): bigint {
  if (balance < 0n || gasCost < 0n || minimum < 0n) {
    throw new RangeError('Balance, gas cost, and minimum must all be non-negative.')
  }

  const spendable = balance - gasCost
  if (spendable < minimum) return 0n
  return spendable
}

/**
 * How much memo a tip may carry, in bytes.
 *
 * Bytes, not characters. A memo rides along in transaction calldata, where the
 * unit of cost — and of any downstream length check — is the byte: an emoji is
 * four of them and a CJK character three. Counting characters would let a
 * "120-character" memo weigh 480 bytes and blow whatever budget the caller set.
 */
export const MEMO_MAX_BYTES = 120

/** What `memo` will actually weigh once encoded. */
export function memoByteLength(memo: string): number {
  return new TextEncoder().encode(memo).length
}

/**
 * Trims `memo` down to the byte budget without splitting a character.
 *
 * Slicing the encoded bytes directly would cut a multi-byte character in half
 * and leave a replacement glyph on the end. Iterating the string instead walks
 * whole code points, so what comes back is always valid text. A ZWJ sequence
 * can still lose a trailing joiner and render as its parts — valid, just not
 * the emoji that was typed, which is the acceptable end of this trade.
 */
export function fitMemo(memo: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(memo).length <= MEMO_MAX_BYTES) return memo

  let used = 0
  let fitted = ''
  for (const character of memo) {
    const size = encoder.encode(character).length
    if (used + size > MEMO_MAX_BYTES) break
    used += size
    fitted += character
  }
  return fitted
}
