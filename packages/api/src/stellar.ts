import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  StrKey,
  TransactionBuilder,
  hash,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk'

import {
  ESCROW_CONTRACT_ID,
  STELLAR_NETWORK_PASSPHRASE,
  USDC_CONTRACT_ID,
  WALLET_WASM_HASH,
  fromStroops,
  isValidChannelId,
  toStroops,
} from '@tipee/shared'

/**
 * Everything the API does on Stellar, behind one interface.
 *
 * The routes never touch the SDK: they talk to this, and the tests talk to a
 * fake of it. The real one holds two keys and is careful with both:
 *
 * - **The relayer** is the source of every transaction Tipee submits, so it
 *   pays every fee and deploys every gifter's wallet. It must never be talked
 *   into authorising anything with its own account, which is why `relay`
 *   refuses source-account credentials and anything that names the relayer.
 * - **The verifier** is the only key the escrow accepts for `claim`. It signs
 *   nothing but claims, and only after the API has checked channel ownership.
 */
export interface StellarGateway {
  /** Unclaimed USDC for a channel, accounting units. */
  escrowBalance(channelId: string): Promise<bigint>
  /**
   * Reads a transaction and returns the escrow `tip` it made, or null when it
   * made none. Throws `ChainUnavailableError` when the chain will not say.
   */
  verifyTip(txHash: string): Promise<VerifiedTip | null>
  /** Deploys the wallet owned by `owner` (a `G…` key), unless it exists. */
  deployWallet(owner: string): Promise<{ address: string; deployed: boolean; txHash: string | null }>
  /** USDC held by any address, accounting units. */
  usdcBalance(address: string): Promise<bigint>
  /** Sends testnet USDC from the relayer. */
  fund(address: string, amount: bigint): Promise<string>
  /** Submits a wallet-authorised invocation, relayer paying. */
  relay(funcXdr: string, authXdr: string[]): Promise<string>
  /** Pays a channel's escrow out to `to`, verifier signing. */
  claim(channelId: string, to: string): Promise<{ txHash: string; net: bigint; fee: bigint }>
}

export interface VerifiedTip {
  from: string
  channelId: string
  /** Accounting units. */
  amount: bigint
  note: string
}

export class ChainUnavailableError extends Error {
  constructor(message = 'Could not read that from Stellar.') {
    super(message)
    this.name = 'ChainUnavailableError'
  }
}

/** The relay will not submit this. The message is safe to return as-is. */
export class RelayRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RelayRefusedError'
  }
}

/** The chain rejected a transaction. The message is safe to return as-is. */
export class TransactionFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransactionFailedError'
  }
}

export interface StellarKeys {
  rpcUrl: string
  relayerSecret: string
  verifierSecret: string | null
}

export function stellarGateway(keys: StellarKeys): StellarGateway {
  const server = new rpc.Server(keys.rpcUrl, { allowHttp: keys.rpcUrl.startsWith('http://') })
  const relayer = Keypair.fromSecret(keys.relayerSecret)
  const verifier = keys.verifierSecret ? Keypair.fromSecret(keys.verifierSecret) : null
  const escrow = new Contract(ESCROW_CONTRACT_ID)
  const usdc = new Contract(USDC_CONTRACT_ID)

  /** Read-only call: simulate, never submit. */
  async function read(op: xdr.Operation): Promise<unknown> {
    const source = await server.getAccount(relayer.publicKey())
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: STELLAR_NETWORK_PASSPHRASE })
      .addOperation(op)
      .setTimeout(30)
      .build()
    const sim = await server.simulateTransaction(tx)
    if (rpc.Api.isSimulationError(sim)) throw new ChainUnavailableError()
    return sim.result ? scValToNative(sim.result.retval) : null
  }

  /**
   * Builds, simulates, signs and submits one operation, and waits for the
   * verdict. The source is the relayer unless said otherwise; a claim is
   * submitted by the verifier itself, because the escrow's `require_auth` on
   * the verifier is then met by the source-account signature. Transactions are
   * serialised: two in flight from one account would race for a sequence
   * number.
   */
  let queue: Promise<unknown> = Promise.resolve()
  function submit(
    op: xdr.Operation,
    signer: Keypair = relayer,
  ): Promise<rpc.Api.GetSuccessfulTransactionResponse & { hash: string }> {
    const run = async () => {
      const source = await server.getAccount(signer.publicKey())
      let tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: STELLAR_NETWORK_PASSPHRASE })
        .addOperation(op)
        .setTimeout(60)
        .build()
      try {
        tx = await server.prepareTransaction(tx)
      } catch (error) {
        throw new TransactionFailedError(simulationMessage(error))
      }
      tx.sign(signer)

      const sent = await server.sendTransaction(tx)
      if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER') {
        throw new TransactionFailedError('Stellar did not accept the transaction. Try again in a moment.')
      }
      const done = await server.pollTransaction(sent.hash, { attempts: 40 })
      if (done.status !== 'SUCCESS') {
        throw new TransactionFailedError('The transaction failed on Stellar.')
      }
      return { ...(done as rpc.Api.GetSuccessfulTransactionResponse), hash: sent.hash }
    }
    const next = queue.then(run, run)
    queue = next.catch(() => undefined)
    return next
  }

  /** Whether `address` is a contract running Tipee's wallet code. */
  async function isTipeeWallet(address: string): Promise<boolean> {
    if (!StrKey.isValidContract(address)) return false
    let found
    try {
      found = await server.getLedgerEntries(new Contract(address).getFootprint())
    } catch {
      throw new ChainUnavailableError()
    }
    const entry = found.entries[0]?.val as unknown as
      | { contractData?: { val?: { instance?: { executable?: { type: string; wasmHash?: { toString(enc: string): string } } } } } }
      | undefined
    const exe = entry?.contractData?.val?.instance?.executable
    return exe?.type === 'contractExecutableWasm' && exe.wasmHash?.toString('hex') === WALLET_WASM_HASH
  }

  function walletAddressFor(owner: string): { address: string; salt: Buffer } {
    const salt = Buffer.from(hash(Buffer.from(StrKey.decodeEd25519PublicKey(owner))))
    const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
      new xdr.HashIdPreimageContractId({
        networkId: hash(Buffer.from(STELLAR_NETWORK_PASSPHRASE)),
        contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
          new xdr.ContractIdPreimageFromAddress({
            address: Address.fromString(relayer.publicKey()).toScAddress(),
            salt,
          }),
        ),
      }),
    )
    return { address: StrKey.encodeContract(Buffer.from(hash(preimage.toXDR()))), salt: Buffer.from(salt) }
  }

  return {
    async escrowBalance(channelId) {
      const stroops = (await read(escrow.call('balance', nativeToScVal(channelId, { type: 'string' })))) as bigint
      return fromStroops(BigInt(stroops ?? 0))
    },

    async usdcBalance(address) {
      const stroops = (await read(usdc.call('balance', Address.fromString(address).toScVal()))) as bigint
      return fromStroops(BigInt(stroops ?? 0))
    },

    async verifyTip(txHash) {
      let tx
      try {
        tx = await server.getTransaction(txHash)
      } catch {
        throw new ChainUnavailableError()
      }
      if (tx.status === 'NOT_FOUND') throw new ChainUnavailableError('That transaction is not on Stellar yet.')
      if (tx.status !== 'SUCCESS') return null

      let events
      try {
        events = await server.getEvents({
          startLedger: tx.ledger,
          endLedger: tx.ledger + 1,
          filters: [{ type: 'contract', contractIds: [ESCROW_CONTRACT_ID] }],
          limit: 200,
        })
      } catch {
        throw new ChainUnavailableError()
      }

      for (const event of events.events) {
        if (event.txHash !== txHash) continue
        const topics = event.topic.map((t) => scValToNative(t) as unknown)
        if (topics[0] !== 'tip' || !isValidChannelId(topics[1]) || typeof topics[2] !== 'string') continue
        const data = scValToNative(event.value) as { amount?: bigint; note?: string }
        if (typeof data.amount !== 'bigint' || data.amount <= 0n) continue
        return {
          channelId: topics[1] as string,
          from: topics[2] as string,
          amount: fromStroops(data.amount),
          note: typeof data.note === 'string' ? data.note : '',
        }
      }
      return null
    },

    async deployWallet(owner) {
      if (!StrKey.isValidEd25519PublicKey(owner)) throw new RelayRefusedError('That is not an ed25519 public key.')
      const { address, salt } = walletAddressFor(owner)
      if (await isTipeeWallet(address)) return { address, deployed: false, txHash: null }

      const done = await submit(
        Operation.createCustomContract({
          address: Address.fromString(relayer.publicKey()),
          wasmHash: Buffer.from(WALLET_WASM_HASH, 'hex'),
          salt,
          constructorArgs: [nativeToScVal(Buffer.from(StrKey.decodeEd25519PublicKey(owner)), { type: 'bytes' })],
        }),
      )
      return { address, deployed: true, txHash: done.hash }
    },

    async fund(address, amount) {
      const done = await submit(
        usdc.call(
          'transfer',
          Address.fromString(relayer.publicKey()).toScVal(),
          Address.fromString(address).toScVal(),
          nativeToScVal(toStroops(amount), { type: 'i128' }),
        ),
      )
      return done.hash
    },

    async relay(funcXdr, authXdr) {
      let func: xdr.HostFunction
      let auth: xdr.SorobanAuthorizationEntry[]
      try {
        func = xdr.HostFunction.fromXDR(funcXdr, 'base64')
        auth = authXdr.map((a) => xdr.SorobanAuthorizationEntry.fromXDR(a, 'base64'))
      } catch {
        throw new RelayRefusedError('The invocation could not be read.')
      }

      const wallet = await checkRelayable(func, auth, relayer.publicKey())
      if (!(await isTipeeWallet(wallet))) {
        throw new RelayRefusedError('Tipee only pays fees for Tipee wallets.')
      }

      const done = await submit(Operation.invokeHostFunction({ func, auth }))
      return done.hash
    },

    async claim(channelId, to) {
      if (!verifier) throw new TransactionFailedError('Claims are not configured on this server.')
      const done = await submit(
        escrow.call('claim', nativeToScVal(channelId, { type: 'string' }), Address.fromString(to).toScVal()),
        verifier,
      )
      const [net, fee] = scValToNative(done.returnValue as xdr.ScVal) as [bigint, bigint]
      return { txHash: done.hash, net: fromStroops(net), fee: fromStroops(fee) }
    },
  }
}

/**
 * What the relayer will pay for, and nothing else. Returns the wallet whose
 * authority the invocation runs under, for the caller to check is a Tipee
 * wallet.
 *
 * - `escrow.tip(wallet, …)`: a tip.
 * - `usdc.transfer(wallet, to, amount)`: a withdrawal out of a wallet.
 * - `wallet.set_session(…)` / `wallet.revoke_session()`: the owner managing
 *   their quick-tip key.
 *
 * Every auth entry must be an address credential for that wallet. A
 * source-account credential would authorise *as the relayer*, which is the one
 * thing an untrusted caller must never be able to make it do.
 */
export async function checkRelayable(
  func: xdr.HostFunction,
  auth: xdr.SorobanAuthorizationEntry[],
  relayerAddress: string,
): Promise<string> {
  if (func.type !== 'hostFunctionTypeInvokeContract') {
    throw new RelayRefusedError('Only contract calls can be relayed.')
  }
  const call = (func as unknown as { invokeContract: xdr.InvokeContractArgs }).invokeContract
  const target = Address.fromScAddress(call.contractAddress).toString()
  const fn = call.functionName.toString()
  const args = call.args

  let wallet: string
  if (target === ESCROW_CONTRACT_ID && fn === 'tip' && args.length === 4) {
    wallet = Address.fromScVal(args[0] as xdr.ScVal).toString()
  } else if (target === USDC_CONTRACT_ID && fn === 'transfer' && args.length === 3) {
    wallet = Address.fromScVal(args[0] as xdr.ScVal).toString()
  } else if ((fn === 'set_session' || fn === 'revoke_session') && StrKey.isValidContract(target)) {
    wallet = target
  } else {
    throw new RelayRefusedError('Tipee only relays tips, withdrawals and wallet settings.')
  }

  if (!StrKey.isValidContract(wallet)) {
    throw new RelayRefusedError('Only Tipee wallets can be relayed for.')
  }
  if (auth.length === 0) {
    throw new RelayRefusedError('The wallet has not signed this.')
  }
  for (const entry of auth) {
    const credentials = entry.credentials as unknown as {
      type: string
      address?: { address: xdr.ScAddress }
      addressV2?: { address: xdr.ScAddress }
      addressWithDelegates?: { addressCredentials: { address: xdr.ScAddress } }
    }
    const scAddress =
      credentials.address?.address ??
      credentials.addressV2?.address ??
      credentials.addressWithDelegates?.addressCredentials.address
    if (!scAddress) {
      throw new RelayRefusedError('Only the wallet’s own signature is accepted.')
    }
    const signer = Address.fromScAddress(scAddress).toString()
    if (signer === relayerAddress || signer !== wallet) {
      throw new RelayRefusedError('Only the wallet’s own signature is accepted.')
    }
  }
  return wallet
}

function simulationMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  if (/Error\(Contract, #4\)/.test(text)) return 'The quick-tip limit for today would be exceeded.'
  if (/Error\(Contract, #5\)/.test(text)) return 'The quick-tip key has expired.'
  if (/balance is not sufficient|insufficient|#10\b/i.test(text)) return 'That is more USDC than this wallet holds.'
  if (/Error\(Auth|InvalidAction|signature/i.test(text)) return 'The wallet signature was not accepted.'
  return 'Stellar rejected this transaction.'
}
