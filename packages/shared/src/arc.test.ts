import { describe, expect, it } from 'vitest'

import {
  ARC_MEMO_ABI,
  ARC_MEMO_ADDRESS,
  decodeMemoData,
  encodeMemoData,
  memoIdFromNonce,
  nonceFromMemoId,
} from './arc'
import { MEMO_MAX_BYTES, fitMemo, memoByteLength } from './limits'

const NONCE = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

describe('the Memo contract', () => {
  it('points at the predeployed address', () => {
    expect(ARC_MEMO_ADDRESS).toBe('0x5294E9927c3306DcBaDb03fe70b92e01cCede505')
  })

  it('describes the entry point the docs specify', () => {
    const [entry] = ARC_MEMO_ABI
    expect(entry.name).toBe('memo')
    expect(entry.inputs.map((input) => input.type)).toEqual([
      'address',
      'bytes',
      'bytes32',
      'bytes',
    ])
  })
})

describe('memoId', () => {
  it('packs the tip nonce into the low bytes of a bytes32', () => {
    const id = memoIdFromNonce(NONCE)

    expect(id).toBe('0x000000000000000000000000000000003f2504e04f8911d39a0c0305e82c3301')
    expect(id).toHaveLength(66)
  })

  it('reads back to the nonce, which is the whole point of storing it raw', () => {
    // `memoId` is an indexed event field. Keeping the nonce recoverable lets the
    // backend look a tip up directly instead of hashing candidates to match.
    expect(nonceFromMemoId(memoIdFromNonce(NONCE))).toBe(NONCE)
  })

  it('refuses anything that is not a UUID nonce', () => {
    expect(() => memoIdFromNonce('not-a-uuid')).toThrow(RangeError)
    expect(() => memoIdFromNonce('')).toThrow(RangeError)
  })

  it('returns null for ids it did not write', () => {
    expect(nonceFromMemoId('0x' + 'f'.repeat(64))).toBeNull()
    expect(nonceFromMemoId('0xabc')).toBeNull()
  })
})

describe('memo data', () => {
  it('encodes as UTF-8 hex bytes', () => {
    expect(encodeMemoData('hi')).toBe('0x6869')
    expect(encodeMemoData('')).toBe('0x')
  })

  it('round-trips text that costs more than one byte a character', () => {
    for (const memo of ['thanks for this one', '🎁 謝謝', 'ünïcodé']) {
      expect(decodeMemoData(encodeMemoData(memo))).toBe(memo)
    }
  })

  it('encodes exactly the bytes the budget counted', () => {
    // `MEMO_MAX_BYTES` is a calldata budget, so the two have to agree or the
    // field would accept a memo the transaction cannot carry.
    const memo = fitMemo('🎁'.repeat(50))
    const hex = encodeMemoData(memo).slice(2)

    expect(hex.length / 2).toBe(memoByteLength(memo))
    expect(hex.length / 2).toBeLessThanOrEqual(MEMO_MAX_BYTES)
  })

  it('rejects malformed hex rather than decoding rubbish', () => {
    expect(() => decodeMemoData('0xabc')).toThrow(RangeError)
    expect(() => decodeMemoData('0xzz')).toThrow(RangeError)
  })
})
