import { encodeFunctionData } from 'viem'

import {
  ARC_MEMO_ABI,
  ARC_MEMO_ADDRESS,
  MEMO_MAX_BYTES,
  encodeMemoData,
  memoByteLength,
  memoIdFromNonce,
} from '@tipee/shared'

import { ERC20_ABI, USDC_ADDRESS } from './arc'

export interface TipCallInput {
  /** Escrow wallet the tip is paid into. */
  recipient: `0x${string}`
  /** Tip amount in accounting units (6 decimals). */
  amount: bigint
  /** Empty string when the gifter left no note. */
  memo: string
  /** The tip's nonce, which doubles as the memo's lookup id. */
  nonce: string
}

/** A transaction request, ready to estimate against or to sign. */
export interface TipCall {
  to: `0x${string}`
  data: `0x${string}`
}

/**
 * Builds the one transaction that moves the tip and publishes its note.
 *
 * Without a memo this is a plain USDC transfer. With one, the same transfer is
 * wrapped in Arc's `Memo` contract: the wrapper forwards the inner call through
 * the `CallFrom` precompile, so the USDC `Transfer` still reads as coming from
 * the gifter rather than from the wrapper, and emits the note as an indexed
 * event beside it. One transaction either way — a transfer plus a separate
 * write could half-succeed and leave a note for a tip that never landed.
 *
 * Callers must trim the memo to the budget first (`fitMemo`). An over-budget
 * memo throws rather than being silently truncated here: what a gifter typed
 * and what gets published permanently must not quietly differ.
 */
export function buildTipCall({ recipient, amount, memo, nonce }: TipCallInput): TipCall {
  if (amount <= 0n) {
    throw new RangeError('A tip must be a positive amount.')
  }
  if (memoByteLength(memo) > MEMO_MAX_BYTES) {
    throw new RangeError(`A memo may not exceed ${MEMO_MAX_BYTES} bytes.`)
  }

  const transfer = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [recipient, amount],
  })

  if (memo === '') {
    return { to: USDC_ADDRESS, data: transfer }
  }

  return {
    to: ARC_MEMO_ADDRESS as `0x${string}`,
    data: encodeFunctionData({
      abi: ARC_MEMO_ABI,
      functionName: 'memo',
      args: [
        USDC_ADDRESS,
        transfer,
        memoIdFromNonce(nonce) as `0x${string}`,
        encodeMemoData(memo) as `0x${string}`,
      ],
    }),
  }
}
