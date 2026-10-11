#!/usr/bin/env node
/**
 * End-to-end smoke test against a running Tipee API on Stellar testnet.
 *
 * Does what the extension does, in order, with a brand-new key:
 *
 *   1. resolve a real YouTube handle to its channel ID       GET  /api/creators/resolve
 *   2. deploy an OpenZeppelin smart account for the new key   POST /api/wallets
 *   3. take testnet USDC from the faucet                      POST /api/faucet
 *   4. tip through the escrow: simulate, sign only the
 *      wallet's auth entry, hand it to the relayer            POST /api/relay
 *   5. report the tip, which the API re-reads from chain      POST /api/tips
 *
 * The key never leaves this process and the script never holds XLM: if it
 * passes, a gifter needs nothing but USDC.
 *
 *   API=http://localhost:3000 node scripts/verify-chain.mjs [@handle]
 */

import {
  Address, BASE_FEE, Contract, Keypair, TransactionBuilder, authorizeEntry, hash, nativeToScVal, rpc, xdr,
} from '@stellar/stellar-sdk'

const API = (process.env.API ?? 'http://localhost:3000').replace(/\/+$/, '')
const HANDLE = process.argv[2] ?? '@fireship'
const RPC = 'https://soroban-testnet.stellar.org'
const PASSPHRASE = 'Test SDF Network ; September 2015'
const ESCROW = 'CB7OEDRTDDPLG37HWY76OQQYOO56P3R3CAAWX5IUSJXIAC3IDZ7OKGUV'
const RELAYER = 'GCBOETCF6JUQIVT46TOINOEESGRK536Q3DNS57BNNKDQJ24A4RAEA27L'
const ED25519_VERIFIER = 'CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4'

/**
 * The wallet is an OpenZeppelin smart account, so its signature is an
 * AuthPayload over the auth digest, every call approved by context rule 0.
 * Same scheme as packages/extension/src/chain/account.ts.
 */
function accountSigner(owner, entry) {
  const count = (inv) => 1 + inv.subInvocations.reduce((n, sub) => n + count(sub), 0)
  const ids = Array(count(entry.rootInvocation)).fill(0)
  const idsVal = () => xdr.ScVal.scvVec(ids.map((id) => xdr.ScVal.scvU32(id)))
  const signer = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('External'),
    Address.fromString(ED25519_VERIFIER).toScVal(),
    xdr.ScVal.scvBytes(owner.rawPublicKey()),
  ])
  return async (_preimage, payload) => {
    const digest = hash(Buffer.concat([Buffer.from(payload), Buffer.from(idsVal().toXDR())]))
    return {
      signatureScVal: xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('context_rule_ids'), val: idsVal() }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('signers'),
          val: xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: signer, val: xdr.ScVal.scvBytes(owner.sign(digest)) })]),
        }),
      ]),
    }
  }
}

const server = new rpc.Server(RPC)
const t0 = Date.now()
const step = (label) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${label}`)

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await response.json()
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${JSON.stringify(json)}`)
  return json
}

const creator = await call('GET', `/api/creators/resolve?handle=${encodeURIComponent(HANDLE)}`)
step(`resolved ${creator.handle} → ${creator.channel_id}  (escrow holds ${creator.unclaimed_balance} USDC)`)
if (creator.escrow_contract !== ESCROW) throw new Error(`unexpected escrow ${creator.escrow_contract}`)

const owner = Keypair.random()
const wallet = await call('POST', '/api/wallets', { owner: owner.publicKey() })
step(`wallet ${wallet.wallet_address}  (deployed: ${wallet.deployed})`)

const faucet = await call('POST', '/api/faucet', { wallet_address: wallet.wallet_address })
step(`faucet sent ${faucet.amount} USDC  (${faucet.tx_hash})`)

// Simulate with the relayer as the source: it is who will submit, and this
// account needs no XLM of its own to find out what it must sign.
const tipOp = new Contract(ESCROW).call(
  'tip',
  Address.fromString(wallet.wallet_address).toScVal(),
  nativeToScVal(creator.channel_id, { type: 'string' }),
  nativeToScVal(2_5000000n, { type: 'i128' }),
  nativeToScVal('verify-chain: great video', { type: 'string' }),
)
const draft = new TransactionBuilder(await server.getAccount(RELAYER), {
  fee: BASE_FEE,
  networkPassphrase: PASSPHRASE,
})
  .addOperation(tipOp)
  .setTimeout(60)
  .build()
const sim = await server.simulateTransaction(draft)
if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error)

const { sequence } = await server.getLatestLedger()
const auth = await Promise.all(
  sim.result.auth.map((entry) => authorizeEntry(entry, accountSigner(owner, entry), sequence + 60, PASSPHRASE)),
)
const func = draft.operations[0].func

const relayed = await call('POST', '/api/relay', {
  func: func.toXDR('base64'),
  auth: auth.map((entry) => entry.toXDR('base64')),
})
step(`tipped 2.50 USDC  (${relayed.tx_hash})`)

const recorded = await call('POST', '/api/tips', {
  gifter_address: wallet.wallet_address,
  creator_channel_id: creator.channel_id,
  amount: '2.50',
  tx_hash: relayed.tx_hash,
})
step(`recorded by the API as ${recorded.amount} USDC, ${recorded.status}`)

const after = await call('GET', `/api/creators/resolve?handle=${encodeURIComponent(HANDLE)}`)
step(`escrow now holds ${after.unclaimed_balance} USDC for ${after.handle}`)
console.log(`\nhttps://stellar.expert/explorer/testnet/tx/${relayed.tx_hash}`)
