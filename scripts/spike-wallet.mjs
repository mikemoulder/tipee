// Spike: can a Tipee smart wallet tip through the escrow with the owner key
// signing only its auth entry, while the relayer submits and pays the fee?
//
//   RELAYER_SECRET=$(stellar keys show tipee-relayer) node scripts/spike-wallet.mjs

import {
  Address, Asset, BASE_FEE, Contract, Keypair, Networks, Operation, StrKey,
  TransactionBuilder, authorizeEntry, hash, nativeToScVal, rpc, scValToNative, xdr,
} from '@stellar/stellar-sdk'
import { randomBytes } from 'node:crypto'

const RPC = 'https://soroban-testnet.stellar.org'
const PASSPHRASE = Networks.TESTNET
const ESCROW = 'CB7OEDRTDDPLG37HWY76OQQYOO56P3R3CAAWX5IUSJXIAC3IDZ7OKGUV'
const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'
const WALLET_WASM = '611b9ad888839007cdc9726151475bf79f6a7e4e780fad739c87dd6fce1ce9a2'
const CHANNEL = 'UC_x5XG1OV2P6uZZ5FSM9Ttw'

const server = new rpc.Server(RPC)
const relayer = Keypair.fromSecret(process.env.RELAYER_SECRET)
const owner = Keypair.random()

async function submit(op, { sign = [] } = {}) {
  const source = await server.getAccount(relayer.publicKey())
  let tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(op).setTimeout(60).build()
  tx = await server.prepareTransaction(tx)
  tx.sign(relayer, ...sign)
  const sent = await server.sendTransaction(tx)
  if (sent.status === 'ERROR') throw new Error(`send failed: ${JSON.stringify(sent.errorResult)}`)
  const done = await server.pollTransaction(sent.hash, { attempts: 30 })
  if (done.status !== 'SUCCESS') throw new Error(`tx ${sent.hash} ${done.status}`)
  return { hash: sent.hash, result: done.returnValue }
}

const t0 = Date.now()
const lap = (label) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${label}`)

// 1. Deploy a wallet for `owner`. The salt is the owner's key, so one owner
//    always maps to one wallet address.
const salt = hash(owner.rawPublicKey())
const deployed = await submit(Operation.createCustomContract({
  address: Address.fromString(relayer.publicKey()),
  wasmHash: Buffer.from(WALLET_WASM, 'hex'),
  salt,
  constructorArgs: [nativeToScVal(owner.rawPublicKey(), { type: 'bytes' })],
}))
const wallet = Address.fromScVal(deployed.result).toString()
lap(`wallet ${wallet}  (deploy ${deployed.hash})`)

// 2. Faucet: 5 USDC from the relayer to the wallet. No trustline needed.
const usdc = new Contract(USDC)
const funded = await submit(usdc.call('transfer',
  Address.fromString(relayer.publicKey()).toScVal(),
  Address.fromString(wallet).toScVal(),
  nativeToScVal(5_0000000n, { type: 'i128' })))
lap(`funded 5 USDC  (${funded.hash})`)

// 3. Tip. Simulate with the relayer as source to discover the wallet's auth
//    entry, sign only that entry with the owner key, then submit.
const escrow = new Contract(ESCROW)
const tipOp = escrow.call('tip',
  Address.fromString(wallet).toScVal(),
  nativeToScVal(CHANNEL, { type: 'string' }),
  nativeToScVal(2_0000000n, { type: 'i128' }),
  nativeToScVal('spike: hello from a smart wallet', { type: 'string' }))

const src = await server.getAccount(relayer.publicKey())
const draft = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
  .addOperation(tipOp).setTimeout(60).build()
const sim = await server.simulateTransaction(draft)
if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
const entries = sim.result.auth
console.log('  auth entries:', entries.map((e) => e.credentials.type))

const { sequence } = await server.getLatestLedger()
const signed = await Promise.all(entries.map((e) =>
  authorizeEntry(e, owner, sequence + 60, PASSPHRASE)))

const signedOp = Operation.invokeHostFunction({
  func: draft.operations[0].func,
  auth: signed,
})
const tipped = await submit(signedOp)
lap(`tipped 2 USDC  (${tipped.hash})`)

const bal = await server.simulateTransaction(
  new TransactionBuilder(await server.getAccount(relayer.publicKey()), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(escrow.call('balance', nativeToScVal(CHANNEL, { type: 'string' }))).setTimeout(30).build())
console.log('escrow balance for channel:', scValToNative(bal.result.retval).toString())
console.log(`https://stellar.expert/explorer/testnet/tx/${tipped.hash}`)
