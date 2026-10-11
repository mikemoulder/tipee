import { describe, expect, it } from 'vitest'

import {
  ESCROW_CONTRACT_ID,
  RELAYER_ADDRESS,
  USDC_CONTRACT_ID,
  explorerAccountUrl,
  explorerTxUrl,
  fromStroops,
  isContractAddress,
  isStellarAddress,
  toStroops,
} from './stellar.ts'
import { ONE_USDC } from './usdc.ts'

describe('stroop conversion', () => {
  it('scales accounting units up by one decimal place, exactly', () => {
    expect(toStroops(ONE_USDC)).toBe(10_000_000n)
    expect(toStroops(1n)).toBe(10n)
  })

  it('truncates the seventh decimal when reading a balance', () => {
    expect(fromStroops(12_345_678n)).toBe(1_234_567n)
    expect(fromStroops(9n)).toBe(0n)
  })

  it('round-trips anything that started in accounting units', () => {
    for (const amount of [0n, 1n, 500_000n, 123_456_789n]) {
      expect(fromStroops(toStroops(amount))).toBe(amount)
    }
  })
})

describe('addresses', () => {
  it('accepts the deployed accounts and contracts', () => {
    expect(isStellarAddress(RELAYER_ADDRESS)).toBe(true)
    expect(isContractAddress(ESCROW_CONTRACT_ID)).toBe(true)
    expect(isContractAddress(USDC_CONTRACT_ID)).toBe(true)
    expect(isContractAddress(RELAYER_ADDRESS)).toBe(false)
  })

  it('refuses Arc addresses, short strings and lowercase', () => {
    expect(isStellarAddress('0x3600000000000000000000000000000000000000')).toBe(false)
    expect(isStellarAddress(RELAYER_ADDRESS.slice(1))).toBe(false)
    expect(isStellarAddress(RELAYER_ADDRESS.toLowerCase())).toBe(false)
    expect(isStellarAddress(`S${RELAYER_ADDRESS.slice(1)}`)).toBe(false)
    expect(isStellarAddress(42)).toBe(false)
  })

  it('links accounts and contracts to the right explorer pages', () => {
    expect(explorerAccountUrl(RELAYER_ADDRESS)).toContain('/account/G')
    expect(explorerAccountUrl(ESCROW_CONTRACT_ID)).toContain('/contract/C')
    expect(explorerTxUrl('ab')).toBe('https://stellar.expert/explorer/testnet/tx/ab')
  })
})
