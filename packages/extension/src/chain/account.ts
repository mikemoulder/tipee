import { Address, Keypair, hash, xdr } from '@stellar/stellar-sdk'

import { DEFAULT_CONTEXT_RULE_ID, ED25519_VERIFIER_ID } from '@tipee/shared'

/**
 * Signing for an OpenZeppelin smart account (the account contract that
 * `stellar/smart-account-kit` deploys), with an Ed25519 key as its signer.
 *
 * The account's `__check_auth` takes an `AuthPayload`:
 *
 *   AuthPayload { context_rule_ids: Vec<u32>, signers: Map<Signer, Bytes> }
 *
 * - `context_rule_ids` names, for each call the auth entry authorises, which of
 *   the account's context rules approves it. Tipee's wallets have one rule, the
 *   default (0) the constructor creates, so every call gets 0. A tip authorises
 *   two calls — `escrow.tip` and the USDC transfer inside it — so it carries
 *   `[0, 0]`; the contract rejects a length that does not match.
 * - The key's signature is over the **auth digest**, which binds the rule ids
 *   so they cannot be swapped after signing:
 *
 *     auth_digest = sha256(signature_payload ‖ xdr(scvVec(context_rule_ids)))
 *
 * `signature_payload` is the Protocol 27 address-bound payload the SDK's
 * `authorizeEntry` computes; this module only turns it into an `AuthPayload`.
 * The formula matches smart-account-kit's `computeEntryAuthDigest`.
 */

/** `Signer::External(ed25519_verifier, key)`, as the account contract encodes it. */
export function ed25519Signer(publicKey: Uint8Array): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('External'),
    Address.fromString(ED25519_VERIFIER_ID).toScVal(),
    xdr.ScVal.scvBytes(publicKey),
  ])
}

/** How many calls an auth entry authorises: its root and every nested call. */
export function countInvocations(invocation: xdr.SorobanAuthorizedInvocation): number {
  const node = invocation as unknown as { subInvocations: xdr.SorobanAuthorizedInvocation[] }
  return 1 + node.subInvocations.reduce((total, sub) => total + countInvocations(sub), 0)
}

export function authDigest(signaturePayload: Uint8Array, contextRuleIds: number[]): Uint8Array {
  const ids = xdr.ScVal.scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id))).toXDR()
  const joined = new Uint8Array(signaturePayload.length + ids.length)
  joined.set(signaturePayload, 0)
  joined.set(ids, signaturePayload.length)
  return hash(joined)
}

/** The `AuthPayload` carrying one Ed25519 signature. Map keys in symbol order, as the host requires. */
export function authPayload(owner: Keypair, contextRuleIds: number[], signature: Uint8Array): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('context_rule_ids'),
      val: xdr.ScVal.scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id))),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('signers'),
      val: xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: ed25519Signer(owner.rawPublicKey()), val: xdr.ScVal.scvBytes(signature) }),
      ]),
    }),
  ])
}

/**
 * A signing callback for `authorizeEntry`: given the entry's signature
 * payload, returns the account's `AuthPayload`, every call approved by `ruleId`.
 */
export function accountSigner(owner: Keypair, entry: xdr.SorobanAuthorizationEntry, ruleId = DEFAULT_CONTEXT_RULE_ID) {
  const ids = Array<number>(countInvocations(entry.rootInvocation)).fill(ruleId)
  return async (_preimage: unknown, payload: Uint8Array) => ({
    signatureScVal: authPayload(owner, ids, owner.sign(authDigest(payload, ids))),
  })
}
