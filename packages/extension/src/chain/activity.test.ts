import { Address, nativeToScVal, type rpc } from '@stellar/stellar-sdk'
import { describe, expect, it } from 'vitest'

import { ESCROW_CONTRACT_ID } from '@tipee/shared'

import { toMovement } from './activity'

const ME = 'CALSZXYNONPSDJD4UCZO5PE2MO66NGUEHP2SR5ZLHVLZEBR2XSGAQWZ2'
const THEM = 'GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP'
const ASSET = 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'

/** A SAC `transfer` event as the RPC returns it: `[transfer, from, to, asset]`. */
function transferEvent(from: string, to: string, value: unknown): rpc.Api.EventResponse {
  return {
    id: '1',
    type: 'contract',
    ledger: 5_144_000,
    ledgerClosedAt: '2026-10-11T20:00:00Z',
    txHash: 'ab'.repeat(32),
    topic: [
      nativeToScVal('transfer', { type: 'symbol' }),
      Address.fromString(from).toScVal(),
      Address.fromString(to).toScVal(),
      nativeToScVal(ASSET, { type: 'string' }),
    ],
    value:
      typeof value === 'bigint'
        ? nativeToScVal(value, { type: 'i128' })
        : nativeToScVal(value, { type: { amount: ['symbol', 'i128'], to_muxed_id: ['symbol', 'u64'] } }),
  } as unknown as rpc.Api.EventResponse
}

describe('a USDC transfer event, as a row', () => {
  it('reads an incoming transfer in accounting units', () => {
    expect(toMovement(transferEvent(THEM, ME, 100_000_000n), ME)).toEqual({
      txHash: 'ab'.repeat(32),
      counterparty: THEM,
      amount: 10_000_000n,
      outgoing: false,
      blockNumber: 5_144_000n,
      at: new Date('2026-10-11T20:00:00Z'),
    })
  })

  it('reads a tip as an outgoing transfer into the escrow', () => {
    const movement = toMovement(transferEvent(ME, ESCROW_CONTRACT_ID, 25_000_000n), ME)
    expect(movement).toMatchObject({ outgoing: true, counterparty: ESCROW_CONTRACT_ID, amount: 2_500_000n })
  })

  it('reads the amount out of a muxed transfer’s map', () => {
    const movement = toMovement(transferEvent(THEM, ME, { amount: 50_000_000n, to_muxed_id: 7n }), ME)
    expect(movement?.amount).toBe(5_000_000n)
  })

  it('ignores a transfer that is not this wallet’s', () => {
    expect(toMovement(transferEvent(THEM, ESCROW_CONTRACT_ID, 1n), ME)).toBeNull()
  })
})
