import { Address, scValToNative, xdr } from '@stellar/stellar-sdk'
import { describe, expect, it } from 'vitest'

import { USDC_CONTRACT_ID } from '@tipee/shared'

import { isValidDestination, maxSendable, transferCall } from './simulate'

const WALLET = 'CALSZXYNONPSDJD4UCZO5PE2MO66NGUEHP2SR5ZLHVLZEBR2XSGAQWZ2'
const ACCOUNT = 'GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP'

describe('a send, as a call', () => {
  it('is a USDC transfer out of the wallet, in stroops', () => {
    const body = xdr.Operation.fromXDR(transferCall(WALLET, ACCOUNT, 1_000_000n).toXDR('base64'), 'base64')
      .body as unknown as { invokeHostFunctionOp: { hostFunction: { invokeContract: xdr.InvokeContractArgs } } }
    const call = body.invokeHostFunctionOp.hostFunction.invokeContract
    expect(Address.fromScAddress(call.contractAddress).toString()).toBe(USDC_CONTRACT_ID)
    expect(call.functionName.toString()).toBe('transfer')
    expect(call.args.map((arg) => scValToNative(arg as xdr.ScVal) as unknown)).toEqual([WALLET, ACCOUNT, 10_000_000n])
  })
})

describe('where a send may go', () => {
  it('takes accounts and contracts with valid checksums', () => {
    expect(isValidDestination(ACCOUNT)).toBe(true)
    expect(isValidDestination(WALLET)).toBe(true)
  })

  it('refuses typos, secrets and EVM addresses', () => {
    expect(isValidDestination(`${ACCOUNT.slice(0, -1)}Q`)).toBe(false)
    expect(isValidDestination('SBGWSG6BTNCKCOB3DIFBGCVMUPQFYPA2G4O34RMTB343OYPXU5DJDVMN')).toBe(false)
    expect(isValidDestination('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984')).toBe(false)
  })
})

describe('the most that can leave', () => {
  it('is the whole balance, because Tipee pays the fee', () => {
    expect(maxSendable(5_000_000n, 0n)).toBe(5_000_000n)
  })

  it('is never negative', () => {
    expect(maxSendable(0n, 0n)).toBe(0n)
    expect(maxSendable(1n, 5n)).toBe(0n)
  })
})
