import { Address, Contract, Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk'
import { describe, expect, it } from 'vitest'

import { ESCROW_CONTRACT_ID, RELAYER_ADDRESS, USDC_CONTRACT_ID } from '@tipee/shared'

import { RelayRefusedError, checkRelayable } from './stellar.ts'

const WALLET = 'CALSZXYNONPSDJD4UCZO5PE2MO66NGUEHP2SR5ZLHVLZEBR2XSGAQWZ2'
const OTHER_WALLET = 'CCUOOMKRC32GMRL36AQ7EOWBVSKAZYSAYBQMKIU7BPOXZU7OJTO7BNFT'
const STRANGER = Keypair.random().publicKey()

function hostFunction(contract: string, fn: string, ...args: xdr.ScVal[]): xdr.HostFunction {
  const op = new Contract(contract).call(fn, ...args)
  const body = xdr.Operation.fromXDR(op.toXDR('base64'), 'base64').body as unknown as {
    invokeHostFunctionOp: { hostFunction: xdr.HostFunction }
  }
  return body.invokeHostFunctionOp.hostFunction
}

function addressAuth(signer: string): xdr.SorobanAuthorizationEntry {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: Address.fromString(signer).toScAddress(),
        nonce: 1n,
        signatureExpirationLedger: 100,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: Address.fromString(ESCROW_CONTRACT_ID).toScAddress(),
          functionName: 'tip',
          args: [],
        }),
      ),
      subInvocations: [],
    }),
  })
}

function sourceAccountAuth(): xdr.SorobanAuthorizationEntry {
  const entry = addressAuth(WALLET)
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: entry.rootInvocation,
  })
}

const tip = (from: string) =>
  hostFunction(
    ESCROW_CONTRACT_ID,
    'tip',
    Address.fromString(from).toScVal(),
    nativeToScVal('UC_x5XG1OV2P6uZZ5FSM9Ttw', { type: 'string' }),
    nativeToScVal(10_000_000n, { type: 'i128' }),
    nativeToScVal('', { type: 'string' }),
  )

const transfer = (from: string, to: string) =>
  hostFunction(
    USDC_CONTRACT_ID,
    'transfer',
    Address.fromString(from).toScVal(),
    Address.fromString(to).toScVal(),
    nativeToScVal(10_000_000n, { type: 'i128' }),
  )

describe('what the relayer will pay for', () => {
  it('relays a tip the wallet signed', async () => {
    await expect(checkRelayable(tip(WALLET), [addressAuth(WALLET)], RELAYER_ADDRESS)).resolves.toBe(WALLET)
  })

  it('relays a withdrawal out of a wallet', async () => {
    await expect(checkRelayable(transfer(WALLET, STRANGER), [addressAuth(WALLET)], RELAYER_ADDRESS)).resolves.toBe(
      WALLET,
    )
  })

  it('relays a wallet managing its own context rules', async () => {
    const fn = hostFunction(WALLET, 'remove_context_rule', nativeToScVal(1, { type: 'u32' }))
    await expect(checkRelayable(fn, [addressAuth(WALLET)], RELAYER_ADDRESS)).resolves.toBe(WALLET)
  })

  it('never lets anyone authorise as the relayer', async () => {
    // A source-account credential authorises as the transaction source, which
    // is the relayer. This is the attack the relay exists to refuse.
    await expect(checkRelayable(tip(WALLET), [sourceAccountAuth()], RELAYER_ADDRESS)).rejects.toThrow(
      RelayRefusedError,
    )
    await expect(
      checkRelayable(transfer(RELAYER_ADDRESS, STRANGER), [addressAuth(RELAYER_ADDRESS)], RELAYER_ADDRESS),
    ).rejects.toThrow(RelayRefusedError)
  })

  it('refuses a tip from a plain account', async () => {
    await expect(checkRelayable(tip(STRANGER), [addressAuth(STRANGER)], RELAYER_ADDRESS)).rejects.toThrow(
      RelayRefusedError,
    )
  })

  it('refuses a signature from a different wallet than the one acting', async () => {
    await expect(checkRelayable(tip(WALLET), [addressAuth(OTHER_WALLET)], RELAYER_ADDRESS)).rejects.toThrow(
      RelayRefusedError,
    )
  })

  it('refuses an unsigned call', async () => {
    await expect(checkRelayable(tip(WALLET), [], RELAYER_ADDRESS)).rejects.toThrow(RelayRefusedError)
  })

  it('refuses execute and upgrade, even on the wallet itself', async () => {
    for (const name of ['execute', 'upgrade']) {
      await expect(checkRelayable(hostFunction(WALLET, name), [addressAuth(WALLET)], RELAYER_ADDRESS)).rejects.toThrow(
        RelayRefusedError,
      )
    }
  })

  it('refuses any other contract or function', async () => {
    const claim = hostFunction(
      ESCROW_CONTRACT_ID,
      'claim',
      nativeToScVal('UC_x5XG1OV2P6uZZ5FSM9Ttw', { type: 'string' }),
      Address.fromString(WALLET).toScVal(),
    )
    const mint = hostFunction(USDC_CONTRACT_ID, 'mint', Address.fromString(WALLET).toScVal())
    for (const fn of [claim, mint]) {
      await expect(checkRelayable(fn, [addressAuth(WALLET)], RELAYER_ADDRESS)).rejects.toThrow(RelayRefusedError)
    }
  })
})
