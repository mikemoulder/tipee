import { describe, expect, it } from 'vitest'

import { keypairFromMnemonic } from './sep5'

/**
 * Test vector from SEP-5 itself (stellar-protocol/ecosystem/sep-0005.md, "Test 1").
 * Matching it is what proves a phrase from Tipee restores in other wallets.
 */
describe('SEP-5 derivation', () => {
  it('matches SEP-5 test 1 (12 words)', () => {
    const phrase = 'illness spike retreat truth genius clock brain pass fit cave bargain toe'
    expect(keypairFromMnemonic(phrase, 0).publicKey()).toBe('GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6')
    expect(keypairFromMnemonic(phrase, 0).secret()).toBe('SBGWSG6BTNCKCOB3DIFBGCVMUPQFYPA2G4O34RMTB343OYPXU5DJDVMN')
    expect(keypairFromMnemonic(phrase, 1).publicKey()).toBe('GBAW5XGWORWVFE2XTJYDTLDHXTY2Q2MO73HYCGB3XMFMQ562Q2W2GJQX')
  })
})
