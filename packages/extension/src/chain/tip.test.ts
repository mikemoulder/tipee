import { Address, scValToNative, xdr } from '@stellar/stellar-sdk'
import { describe, expect, it } from 'vitest'

import { ESCROW_CONTRACT_ID, MEMO_MAX_BYTES, ONE_USDC } from '@tipee/shared'

import { buildTipCall } from './tip'

const WALLET = 'CALSZXYNONPSDJD4UCZO5PE2MO66NGUEHP2SR5ZLHVLZEBR2XSGAQWZ2'
const CHANNEL = 'UC_x5XG1OV2P6uZZ5FSM9Ttw'

function decode(op: xdr.Operation) {
  const body = xdr.Operation.fromXDR(op.toXDR('base64'), 'base64').body as unknown as {
    invokeHostFunctionOp: { hostFunction: { invokeContract: xdr.InvokeContractArgs } }
  }
  const call = body.invokeHostFunctionOp.hostFunction.invokeContract
  return {
    contract: Address.fromScAddress(call.contractAddress).toString(),
    fn: call.functionName.toString(),
    args: call.args.map((arg) => scValToNative(arg as xdr.ScVal) as unknown),
  }
}

describe('a tip, as a call', () => {
  it('calls tip on the escrow this build ships with', () => {
    const call = decode(buildTipCall({ wallet: WALLET, channelId: CHANNEL, amount: 2n * ONE_USDC, memo: 'gm' }))
    expect(call.contract).toBe(ESCROW_CONTRACT_ID)
    expect(call.fn).toBe('tip')
  })

  it('passes the wallet, the channel, the amount in stroops, and the note', () => {
    const call = decode(buildTipCall({ wallet: WALLET, channelId: CHANNEL, amount: 2_500_000n, memo: 'great video' }))
    // 2.50 USDC is 2_500_000 accounting units and 25_000_000 stroops.
    expect(call.args).toEqual([WALLET, CHANNEL, 25_000_000n, 'great video'])
  })

  it('carries an empty note as an empty string', () => {
    const call = decode(buildTipCall({ wallet: WALLET, channelId: CHANNEL, amount: ONE_USDC, memo: '' }))
    expect(call.args[3]).toBe('')
  })

  it('refuses a zero or negative tip', () => {
    expect(() => buildTipCall({ wallet: WALLET, channelId: CHANNEL, amount: 0n, memo: '' })).toThrow(RangeError)
    expect(() => buildTipCall({ wallet: WALLET, channelId: CHANNEL, amount: -1n, memo: '' })).toThrow(RangeError)
  })

  it('refuses a handle where a channel ID belongs', () => {
    expect(() => buildTipCall({ wallet: WALLET, channelId: '@fireship', amount: ONE_USDC, memo: '' })).toThrow(
      RangeError,
    )
  })

  it('refuses a memo over the byte budget rather than trimming it silently', () => {
    const memo = '🎉'.repeat(MEMO_MAX_BYTES / 4 + 1)
    expect(() => buildTipCall({ wallet: WALLET, channelId: CHANNEL, amount: ONE_USDC, memo })).toThrow(RangeError)
  })
})
