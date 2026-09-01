import { ARC_MEMO_ABI, ARC_MEMO_ADDRESS, MEMO_MAX_BYTES, decodeMemoData, memoIdFromNonce } from '@tipee/shared'
import { decodeFunctionData } from 'viem'
import { describe, expect, it } from 'vitest'

import { ERC20_ABI, USDC_ADDRESS } from './arc'
import { buildTipCall } from './tip'

const RECIPIENT = '0x1111111111111111111111111111111111111111' as const
const NONCE = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const ONE = 1_000_000n

function readTransfer(data: `0x${string}`): { to: string; amount: bigint } {
  const { functionName, args } = decodeFunctionData({ abi: ERC20_ABI, data })
  if (functionName !== 'transfer') throw new Error(`expected transfer, got ${functionName}`)
  return { to: args[0] as string, amount: args[1] as bigint }
}

describe('a tip with no note', () => {
  it('is a plain USDC transfer', () => {
    const call = buildTipCall({ recipient: RECIPIENT, amount: ONE, memo: '', nonce: NONCE })

    // No memo means no reason to pay the wrapper's gas.
    expect(call.to).toBe(USDC_ADDRESS)
    expect(readTransfer(call.data)).toEqual({ to: RECIPIENT, amount: ONE })
  })
})

describe('a tip carrying a note', () => {
  const call = buildTipCall({
    recipient: RECIPIENT,
    amount: 5n * ONE,
    memo: 'thank you',
    nonce: NONCE,
  })

  it('goes through the Memo contract', () => {
    expect(call.to).toBe(ARC_MEMO_ADDRESS)
  })

  it('still transfers to the creator, not to the wrapper', () => {
    // The precompile keeps the gifter as msg.sender for the inner call; the
    // inner call itself still has to name the creator as recipient.
    const { args } = decodeFunctionData({ abi: ARC_MEMO_ABI, data: call.data })
    const [target, inner] = args as [string, `0x${string}`, string, string]

    expect(target).toBe(USDC_ADDRESS)
    expect(readTransfer(inner)).toEqual({ to: RECIPIENT, amount: 5n * ONE })
  })

  it('carries the note and an id that maps back to the tip', () => {
    const { args } = decodeFunctionData({ abi: ARC_MEMO_ABI, data: call.data })
    const [, , memoId, memoData] = args as [string, string, string, `0x${string}`]

    expect(memoId).toBe(memoIdFromNonce(NONCE))
    expect(decodeMemoData(memoData)).toBe('thank you')
  })

  it('survives a note that costs more than one byte a character', () => {
    const memo = '🎁 謝謝 — thank you'
    const wrapped = buildTipCall({ recipient: RECIPIENT, amount: ONE, memo, nonce: NONCE })
    const { args } = decodeFunctionData({ abi: ARC_MEMO_ABI, data: wrapped.data })

    expect(decodeMemoData(args[3] as string)).toBe(memo)
  })
})

describe('refusals', () => {
  it('will not build a tip for nothing', () => {
    expect(() => buildTipCall({ recipient: RECIPIENT, amount: 0n, memo: '', nonce: NONCE })).toThrow(
      RangeError,
    )
    expect(() => buildTipCall({ recipient: RECIPIENT, amount: -1n, memo: '', nonce: NONCE })).toThrow(
      RangeError,
    )
  })

  it('will not quietly shorten an over-budget note', () => {
    // What was typed and what gets published permanently must not differ; the
    // caller trims with `fitMemo` where the gifter can still see the result.
    expect(() =>
      buildTipCall({
        recipient: RECIPIENT,
        amount: ONE,
        memo: 'a'.repeat(MEMO_MAX_BYTES + 1),
        nonce: NONCE,
      }),
    ).toThrow(RangeError)
  })
})
