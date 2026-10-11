import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  StrKey,
  TransactionBuilder,
  authorizeEntry,
  hash,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk'

import {
  RELAYER_ADDRESS,
  STELLAR_NETWORK_PASSPHRASE,
  STELLAR_RPC_URL,
  USDC_CONTRACT_ID,
  fromStroops,
  type CreateWalletResponse,
  type FaucetResponse,
  type RelayResponse,
} from '@tipee/shared'

import { apiBase } from './creators'

/**
 * Tipee on Stellar, from the gifter's side.
 *
 * The gifter's wallet is a contract (`C…`) whose owner is an ed25519 key the
 * extension derives from the seed phrase. That key never pays for anything
 * and never holds XLM. What it does is sign **authorisations**: when the wallet
 * tips or sends, the extension simulates the call, gets back the one auth
 * entry the wallet must sign, signs that and only that, and hands the
 * invocation to Tipee's relayer, which submits it and pays the fee.
 *
 * The relayer cannot change what was signed: the signature covers the whole
 * invocation tree (which contract, which function, which amounts), the network,
 * and an expiry ledger. The worst it can do is not submit it.
 */

/** How long a signed authorisation stays usable: about five minutes. */
const AUTH_VALID_LEDGERS = 60

let server: rpc.Server | null = null
export function stellarServer(): rpc.Server {
  server ??= new rpc.Server(STELLAR_RPC_URL)
  return server
}

/** The network will not answer, said in words a person can act on. */
export class NetworkUnavailableError extends Error {
  constructor(message = 'Stellar did not answer. Try again in a moment.') {
    super(message)
    this.name = 'NetworkUnavailableError'
  }
}

/** Tipee's service refused or could not be reached. The message is the service's own. */
export class RelayError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RelayError'
  }
}

/**
 * The address of the wallet `owner` gets, worked out offline.
 *
 * A contract's address is a hash of who deployed it and a salt, and Tipee's
 * relayer deploys every wallet with `salt = sha256(owner key)`. So the
 * extension knows its own address before the wallet exists, can show it at
 * once, and can check the backend deployed what it says it did.
 */
export function walletAddressFor(owner: Keypair | string): string {
  const raw = typeof owner === 'string' ? StrKey.decodeEd25519PublicKey(owner) : owner.rawPublicKey()
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(new TextEncoder().encode(STELLAR_NETWORK_PASSPHRASE)),
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          address: Address.fromString(RELAYER_ADDRESS).toScAddress(),
          salt: hash(raw),
        }),
      ),
    }),
  )
  return StrKey.encodeContract(hash(preimage.toXDR()))
}

/**
 * Runs a call without submitting it. The relayer is the source because it is
 * the account that will submit for real, and simulating needs an account that
 * exists; nothing is signed by it here.
 */
export async function simulate(op: xdr.Operation): Promise<rpc.Api.SimulateTransactionSuccessResponse> {
  const rpcServer = stellarServer()
  let source
  try {
    source = await rpcServer.getAccount(RELAYER_ADDRESS)
  } catch {
    throw new NetworkUnavailableError()
  }
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: STELLAR_NETWORK_PASSPHRASE })
    .addOperation(op)
    .setTimeout(60)
    .build()

  let sim
  try {
    sim = await rpcServer.simulateTransaction(tx)
  } catch {
    throw new NetworkUnavailableError()
  }
  if (rpc.Api.isSimulationError(sim)) throw new SimulationError(sim.error)
  return sim as rpc.Api.SimulateTransactionSuccessResponse
}

/** The chain would refuse this call. `message` is for people; `detail` is the host's. */
export class SimulationError extends Error {
  readonly detail: string
  constructor(detail: string) {
    super(simulationMessage(detail))
    this.name = 'SimulationError'
    this.detail = detail
  }
}

/** USDC held by `address`, in accounting units (6 decimals, truncated). */
export async function usdcBalance(address: string): Promise<bigint> {
  const sim = await simulate(new Contract(USDC_CONTRACT_ID).call('balance', Address.fromString(address).toScVal()))
  const stroops = sim.result ? (scValToNative(sim.result.retval) as bigint) : 0n
  return fromStroops(BigInt(stroops))
}

/** Whether the wallet contract is on chain yet. */
export async function walletExists(address: string): Promise<boolean> {
  try {
    const found = await stellarServer().getLedgerEntries(new Contract(address).getFootprint())
    return found.entries.length > 0
  } catch {
    throw new NetworkUnavailableError()
  }
}

/**
 * Simulates `op`, signs the wallet's authorisation with `owner`, and returns
 * what the relay needs. Throws `SimulationError` when the chain would refuse
 * the call, before anything is signed.
 */
export async function authorise(op: xdr.Operation, owner: Keypair): Promise<{ func: string; auth: string[] }> {
  const sim = await simulate(op)
  const entries = sim.result?.auth ?? []

  let latest
  try {
    latest = await stellarServer().getLatestLedger()
  } catch {
    throw new NetworkUnavailableError()
  }

  const signed = await Promise.all(
    entries.map((entry) => authorizeEntry(entry, owner, latest.sequence + AUTH_VALID_LEDGERS, STELLAR_NETWORK_PASSPHRASE)),
  )

  const body = xdr.Operation.fromXDR(op.toXDR('base64'), 'base64').body as unknown as {
    invokeHostFunctionOp: { hostFunction: xdr.HostFunction }
  }
  return {
    func: body.invokeHostFunctionOp.hostFunction.toXDR('base64'),
    auth: signed.map((entry) => entry.toXDR('base64')),
  }
}

/** Hands a signed invocation to Tipee's relayer. Resolves with the transaction hash once it is on chain. */
export async function relay(signed: { func: string; auth: string[] }): Promise<string> {
  const body = await post<RelayResponse>('/api/relay', signed)
  return body.tx_hash
}

/** Asks Tipee to deploy this owner's wallet. Safe to repeat: an existing wallet is left alone. */
export async function deployWallet(owner: Keypair): Promise<CreateWalletResponse> {
  const body = await post<CreateWalletResponse>('/api/wallets', { owner: owner.publicKey() })
  // Trust, but check: the address is a pure function of the owner key, so a
  // backend that answered with any other one is not deploying *this* wallet.
  if (body.wallet_address !== walletAddressFor(owner)) {
    throw new RelayError('Tipee answered with a wallet that is not yours.')
  }
  return body
}

/** Testnet USDC for a new wallet. */
export async function requestFaucet(wallet: string): Promise<FaucetResponse> {
  return post<FaucetResponse>('/api/faucet', { wallet_address: wallet })
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const base = await apiBase()
  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new RelayError('Could not reach Tipee. Check your connection and try again.')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new RelayError('Tipee sent back something unreadable.')
  }
  if (!response.ok) {
    const message = (body as { message?: unknown } | null)?.message
    throw new RelayError(typeof message === 'string' ? message : 'Tipee could not do that just now.')
  }
  return body as T
}

/**
 * Host errors, in words. The numbered ones are the contracts' own: the escrow
 * (1 amount, 2 channel, 3 note) and the wallet (4 over the quick-tip cap,
 * 5 quick-tip key expired).
 */
export function simulationMessage(detail: string): string {
  if (/resulting balance is not within the allowed range|balance is not sufficient|insufficient/i.test(detail)) {
    return 'That is more USDC than this wallet holds.'
  }
  if (/trustline|non-existent|MissingValue/i.test(detail)) {
    return 'This wallet is not set up on Stellar yet.'
  }
  if (/Error\(Contract, #2\)/.test(detail)) return 'That channel ID is not one Tipee can pay.'
  if (/Error\(Contract, #3\)/.test(detail)) return 'That note is too long.'
  if (/Error\(Contract, #1\)/.test(detail)) return 'Enter an amount to send.'
  return 'Stellar would refuse this transaction.'
}

/** For callers that build calls by hand. */
export { nativeToScVal }
