/**
 * Arc's transaction memo.
 *
 * Arc has no memo field on the transaction itself. Instead a predeployed `Memo`
 * contract wraps the call you actually want to make: you hand it a target, the
 * calldata for that target, an id, and the memo bytes, and it forwards the
 * inner call through Arc's `CallFrom` precompile before emitting the memo as an
 * event. So a tip is one transaction that both moves the USDC and publishes the
 * note, rather than a transfer plus a second write.
 *
 * The precompile is what makes this usable for a payment: it preserves the
 * original wallet as `msg.sender` for the inner call, so the USDC `Transfer`
 * still reads as coming from the gifter and not from the `Memo` contract. A
 * memo that reattributed every tip to a shared wrapper address would be worse
 * than no memo at all.
 *
 * ## The constraint that matters for Tipee
 *
 * `Memo.memo(...)` must be called **directly by an EOA**. Anything routed
 * through a contract — ERC-4337 smart accounts, Circle modular wallets, Safe
 * and other multisigs — reverts, because the precompile refuses to let a
 * contract claim to be someone else. Tipee's gifter wallet is a plain
 * `mnemonicToAccount` EOA, so it qualifies; moving the gifter side to a smart
 * account later would silently take memos with it.
 *
 * ## Failure and cost
 *
 * If the inner call reverts the whole transaction reverts, with the child's
 * return data wrapped in `MemoFailed(bytes)` — so a failed transfer cannot
 * leave a memo behind claiming it happened. And since gas on Arc is USDC, the
 * wrapper's extra gas comes out of the same balance as the tip: the headroom
 * check in `validateTip` has to be made against the memo path's estimate, not
 * a bare transfer's.
 *
 * Source: https://docs.arc.io — "Transaction memos".
 */

/** The predeployed `Memo` contract. Same address on every Arc network. */
export const ARC_MEMO_ADDRESS = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505'

/**
 * The contract's single entry point.
 *
 * `target` is the contract to call — for a tip, the USDC ERC-20 — and `data` is
 * the calldata to forward to it. `memoId` is ours to define; `memoData` is the
 * memo itself.
 */
export const ARC_MEMO_ABI = [
  {
    type: 'function',
    name: 'memo',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'data', type: 'bytes' },
      { name: 'memoId', type: 'bytes32' },
      { name: 'memoData', type: 'bytes' },
    ],
    outputs: [],
  },
] as const

const UUID_HEX = /^[0-9a-f]{32}$/

/**
 * Turns a tip's nonce into the `memoId` the contract indexes on.
 *
 * A hash would do for uniqueness, but `memoId` is an indexed event field and
 * the whole point of it is reconciliation: storing the nonce itself, padded
 * into the 32 bytes, means the backend can look a tip up by the id it already
 * generated instead of hashing every candidate to find a match. A UUID is 16
 * bytes, so it fits with room to spare.
 */
export function memoIdFromNonce(nonce: string): string {
  const hex = nonce.replace(/-/g, '').toLowerCase()
  if (!UUID_HEX.test(hex)) {
    throw new RangeError('A memo id must come from a UUID nonce.')
  }
  return `0x${hex.padStart(64, '0')}`
}

/** Reads a `memoId` back to the nonce it was built from. */
export function nonceFromMemoId(memoId: string): string | null {
  const hex = memoId.replace(/^0x/i, '').toLowerCase()
  if (hex.length !== 64 || !/^[0-9a-f]{64}$/.test(hex)) return null

  const padding = hex.slice(0, 32)
  const body = hex.slice(32)
  if (padding !== '0'.repeat(32) || !UUID_HEX.test(body)) return null

  return [
    body.slice(0, 8),
    body.slice(8, 12),
    body.slice(12, 16),
    body.slice(16, 20),
    body.slice(20),
  ].join('-')
}

/**
 * Encodes memo text as the `bytes` the contract takes.
 *
 * UTF-8, which is why the budget in `MEMO_MAX_BYTES` is counted in bytes: this
 * is the value that ends up in calldata and in the event, and it is what the
 * gifter pays gas on.
 */
export function encodeMemoData(memo: string): string {
  const bytes = new TextEncoder().encode(memo)
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return `0x${hex}`
}

/** Reads memo bytes back to text — the indexer's side of `encodeMemoData`. */
export function decodeMemoData(memoData: string): string {
  const hex = memoData.replace(/^0x/i, '')
  if (hex.length % 2 !== 0 || (hex.length > 0 && !/^[0-9a-fA-F]+$/.test(hex))) {
    throw new RangeError('Memo data must be an even-length hex string.')
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return new TextDecoder().decode(bytes)
}
