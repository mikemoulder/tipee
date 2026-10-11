// Spike: can an OpenZeppelin smart account (the contracts deployed by
// stellar/smart-account-kit), owned by an Ed25519 key, tip through the Tipee
// escrow, with only its auth entry signed and the relayer paying the fee?
//
//   RELAYER_SECRET=$(stellar keys show tipee-relayer) node scripts/spike-oz-account.mjs

import {
  Address, BASE_FEE, Contract, Keypair, Networks, Operation, TransactionBuilder,
  authorizeEntry, hash, nativeToScVal, rpc, scValToNative, xdr,
} from '@stellar/stellar-sdk'

const RPC = 'https://soroban-testnet.stellar.org'
const PASSPHRASE = Networks.TESTNET
const ESCROW = 'CB7OEDRTDDPLG37HWY76OQQYOO56P3R3CAAWX5IUSJXIAC3IDZ7OKGUV'
const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'
// From stellar/smart-account-kit docs/deployments-protocol-27-2026-07-09.md (testnet).
const OZ_ACCOUNT_WASM = '1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a'
const OZ_ED25519_VERIFIER = 'CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4'
const CHANNEL = 'UC_x5XG1OV2P6uZZ5FSM9Ttw'

const server = new rpc.Server(RPC)
const relayer = Keypair.fromSecret(process.env.RELAYER_SECRET)
const owner = Keypair.random()
const t0 = Date.now()
const lap = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${m}`)

async function submit(op) {
  const source = await server.getAccount(relayer.publicKey())
  let tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).addOperation(op).setTimeout(60).build()
  tx = await server.prepareTransaction(tx)
  tx.sign(relayer)
  const sent = await server.sendTransaction(tx)
  if (sent.status === 'ERROR') throw new Error(`send failed: ${JSON.stringify(sent.errorResult)}`)
  const done = await server.pollTransaction(sent.hash, { attempts: 40 })
  if (done.status !== 'SUCCESS') throw new Error(`tx ${sent.hash} ${done.status}`)
  return { hash: sent.hash, result: done.returnValue }
}

/** Signer::External(verifier, key) as the contract's enum encodes it. */
const ed25519Signer = (publicKey) =>
  xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('External'),
    Address.fromString(OZ_ED25519_VERIFIER).toScVal(),
    xdr.ScVal.scvBytes(publicKey),
  ])

// 1. Deploy an OZ account whose default context rule has our Ed25519 key.
const deployed = await submit(Operation.createCustomContract({
  address: Address.fromString(relayer.publicKey()),
  wasmHash: Buffer.from(OZ_ACCOUNT_WASM, 'hex'),
  salt: hash(owner.rawPublicKey()),
  constructorArgs: [xdr.ScVal.scvVec([ed25519Signer(owner.rawPublicKey())]), xdr.ScVal.scvMap([])],
}))
const wallet = Address.fromScVal(deployed.result).toString()
lap(`OZ account ${wallet}  (${deployed.hash})`)

// 2. Fund it. A contract account needs no trustline.
await submit(new Contract(USDC).call('transfer', Address.fromString(relayer.publicKey()).toScVal(),
  Address.fromString(wallet).toScVal(), nativeToScVal(5_0000000n, { type: 'i128' })))
lap('funded 5 USDC')

// 3. Tip, signing the OZ AuthPayload.
const tipOp = new Contract(ESCROW).call('tip', Address.fromString(wallet).toScVal(),
  nativeToScVal(CHANNEL, { type: 'string' }), nativeToScVal(1_2500000n, { type: 'i128' }),
  nativeToScVal('spike: OpenZeppelin smart account', { type: 'string' }))
const draft = new TransactionBuilder(await server.getAccount(relayer.publicKey()), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
  .addOperation(tipOp).setTimeout(60).build()
const sim = await server.simulateTransaction(draft)
if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error)

const countInvocations = (inv) => 1 + inv.subInvocations.reduce((n, sub) => n + countInvocations(sub), 0)
const { sequence } = await server.getLatestLedger()

const signed = await Promise.all(sim.result.auth.map((entry) => {
  // One context rule id per authorised call in this entry's tree. Rule 0 is
  // the default rule the constructor created.
  const ids = Array(countInvocations(entry.rootInvocation)).fill(0)
  return authorizeEntry(entry, async (_preimage, payload) => {
    const idsXdr = xdr.ScVal.scvVec(ids.map((id) => xdr.ScVal.scvU32(id))).toXDR()
    const digest = hash(Buffer.concat([Buffer.from(payload), Buffer.from(idsXdr)]))
    const signature = owner.sign(digest)
    return {
      signatureScVal: xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('context_rule_ids'), val: xdr.ScVal.scvVec(ids.map((id) => xdr.ScVal.scvU32(id))) }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('signers'),
          val: xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: ed25519Signer(owner.rawPublicKey()), val: xdr.ScVal.scvBytes(signature) })]),
        }),
      ]),
    }
  }, sequence + 60, PASSPHRASE)
}))
console.log('  contexts per entry:', sim.result.auth.map((e) => countInvocations(e.rootInvocation)), 'credential:', sim.result.auth.map((e) => e.credentials.type))

const tipped = await submit(Operation.invokeHostFunction({ func: draft.operations[0].func, auth: signed }))
lap(`tipped 1.25 USDC from the OZ account  (${tipped.hash})`)

const bal = await server.simulateTransaction(new TransactionBuilder(await server.getAccount(relayer.publicKey()), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
  .addOperation(new Contract(USDC).call('balance', Address.fromString(wallet).toScVal())).setTimeout(30).build())
console.log('wallet USDC now:', scValToNative(bal.result.retval).toString())
console.log(`https://stellar.expert/explorer/testnet/tx/${tipped.hash}`)
