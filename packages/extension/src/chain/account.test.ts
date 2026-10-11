import { Keypair, StrKey, scValToNative, xdr } from '@stellar/stellar-sdk'
import { describe, expect, it } from 'vitest'

import { ED25519_VERIFIER_ID } from '@tipee/shared'

import { authDigest, authPayload, countInvocations, ed25519Signer } from './account'

const owner = Keypair.fromSecret('SBGWSG6BTNCKCOB3DIFBGCVMUPQFYPA2G4O34RMTB343OYPXU5DJDVMN')

function invocation(children: xdr.SorobanAuthorizedInvocation[] = []): xdr.SorobanAuthorizedInvocation {
  return { subInvocations: children } as unknown as xdr.SorobanAuthorizedInvocation
}

describe('signing for an OpenZeppelin smart account', () => {
  it('encodes the signer as External(verifier, key)', () => {
    const [tag, verifier, key] = scValToNative(ed25519Signer(owner.rawPublicKey())) as [string, string, Uint8Array]
    expect(tag).toBe('External')
    expect(verifier).toBe(ED25519_VERIFIER_ID)
    expect(StrKey.encodeEd25519PublicKey(Buffer.from(key))).toBe(owner.publicKey())
  })

  it('counts one context per authorised call: a tip is the tip and its transfer', () => {
    expect(countInvocations(invocation())).toBe(1)
    expect(countInvocations(invocation([invocation()]))).toBe(2)
    expect(countInvocations(invocation([invocation([invocation()]), invocation()]))).toBe(4)
  })

  it('binds the rule ids into the digest, so they cannot be changed after signing', () => {
    const payload = new Uint8Array(32).fill(7)
    expect(Buffer.from(authDigest(payload, [0, 0]))).not.toEqual(Buffer.from(authDigest(payload, [0, 1])))
    expect(Buffer.from(authDigest(payload, [0]))).not.toEqual(Buffer.from(authDigest(payload, [0, 0])))
  })

  it('carries a signature the owner key verifies over the digest', () => {
    const digest = authDigest(new Uint8Array(32).fill(1), [0, 0])
    const signature = owner.sign(digest)
    const decoded = scValToNative(authPayload(owner, [0, 0], signature)) as {
      context_rule_ids: number[]
      signers: Record<string, Uint8Array>
    }
    expect(decoded.context_rule_ids).toEqual([0, 0])
    expect(owner.verify(Buffer.from(digest), Buffer.from(signature))).toBe(true)
  })

  it('writes the payload keys in the order the host requires', () => {
    const map = authPayload(owner, [0], owner.sign(new Uint8Array(32))) as unknown as { map: Array<{ key: xdr.ScVal }> }
    const keys = (map.map ?? []).map((entry) => scValToNative(entry.key))
    expect(keys).toEqual(['context_rule_ids', 'signers'])
  })
})
