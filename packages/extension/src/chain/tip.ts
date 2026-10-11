import { Address, Contract, nativeToScVal, type xdr } from '@stellar/stellar-sdk'

import { ESCROW_CONTRACT_ID, MEMO_MAX_BYTES, isValidChannelId, memoByteLength, toStroops } from '@tipee/shared'

export interface TipCallInput {
  /** The gifter's wallet contract (`C…`), which the tip comes out of. */
  wallet: string
  /** The creator's channel ID: the key the escrow holds the tip under. */
  channelId: string
  /** Tip amount in accounting units (6 decimals). */
  amount: bigint
  /** Empty string when the gifter left no note. */
  memo: string
}

/**
 * Builds the one call that moves the tip and publishes its note.
 *
 * `escrow.tip(wallet, channel, amount, note)` pulls the USDC out of the wallet
 * into the escrow and emits the note in the same event, so a note can never
 * outlive a transfer that failed. The destination is the escrow contract the
 * extension ships with, never one an API answered with: a tip cannot be
 * redirected by anything outside this file.
 *
 * Callers must trim the memo to the budget first (`fitMemo`). An over-budget
 * memo throws rather than being silently truncated here: what a gifter typed
 * and what gets published permanently must not quietly differ.
 */
export function buildTipCall({ wallet, channelId, amount, memo }: TipCallInput): xdr.Operation {
  if (amount <= 0n) {
    throw new RangeError('A tip must be a positive amount.')
  }
  if (!isValidChannelId(channelId)) {
    throw new RangeError('A tip needs the creator’s channel ID.')
  }
  if (memoByteLength(memo) > MEMO_MAX_BYTES) {
    throw new RangeError(`A memo may not exceed ${MEMO_MAX_BYTES} bytes.`)
  }

  return new Contract(ESCROW_CONTRACT_ID).call(
    'tip',
    Address.fromString(wallet).toScVal(),
    nativeToScVal(channelId, { type: 'string' }),
    nativeToScVal(toStroops(amount), { type: 'i128' }),
    nativeToScVal(memo, { type: 'string' }),
  )
}
