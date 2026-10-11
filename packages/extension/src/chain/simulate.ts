import { Address, Contract, StrKey, nativeToScVal, type xdr } from '@stellar/stellar-sdk'

import { USDC_CONTRACT_ID, toStroops } from '@tipee/shared'

import { NetworkUnavailableError, SimulationError, simulate, usdcBalance } from './stellar'

/**
 * What a send would do, worked out before anything is signed.
 *
 * Wallets show this because the alternative is asking someone to authorise a
 * transaction whose outcome they cannot see. On Stellar the preview is a real
 * simulation: the transfer is run against current state as this wallet, so a
 * send that would fail says so here, with the reason, before the PIN.
 *
 * That is a preview of current state, not a promise: the chain can move between
 * this and the signature. It is re-run after the PIN for exactly that reason.
 */
export interface SendPreview {
  to: string
  /** Accounting units, all of them. */
  amount: bigint
  /** What the sender pays in fees: always zero, Tipee's relayer pays. */
  gasCost: bigint
  total: bigint
  balance: bigint
  balanceAfter: bigint
  /** The call this preview describes, ready to authorise. */
  call: xdr.Operation
}

/** The transfer would not go through, and why in words a person can act on. */
export class SendUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SendUnavailableError'
  }
}

/** Not enough USDC, carrying the shortfall. */
export class InsufficientFundsError extends SendUnavailableError {
  readonly shortBy: bigint

  constructor(shortBy: bigint, message: string) {
    super(message)
    this.name = 'InsufficientFundsError'
    this.shortBy = shortBy
  }
}

export function transferCall(from: string, to: string, amount: bigint): xdr.Operation {
  return new Contract(USDC_CONTRACT_ID).call(
    'transfer',
    Address.fromString(from).toScVal(),
    Address.fromString(to).toScVal(),
    nativeToScVal(toStroops(amount), { type: 'i128' }),
  )
}

/** A Stellar address with a valid checksum: an account (`G…`) or a contract (`C…`). */
export function isValidDestination(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address)
}

export async function previewSend(input: { from: string; to: string; amount: bigint }): Promise<SendPreview> {
  const { from, to, amount } = input
  if (amount <= 0n) throw new SendUnavailableError('Enter an amount to send.')
  if (!isValidDestination(to)) throw new SendUnavailableError('That is not a valid Stellar address.')

  let balance: bigint
  try {
    balance = await usdcBalance(from)
  } catch {
    throw new SendUnavailableError('Could not read your balance from Stellar.')
  }

  if (amount > balance) {
    throw new InsufficientFundsError(amount - balance, 'Not enough USDC for this send.')
  }

  const call = transferCall(from, to, amount)

  // The dry run: proves the transfer is accepted as this wallet, right now —
  // the part arithmetic cannot tell you (a `G…` destination with no USDC
  // trustline, for one).
  try {
    await simulate(call)
  } catch (error) {
    if (error instanceof SimulationError) {
      throw new SendUnavailableError(
        /trustline|non-existent|MissingValue/i.test(error.detail)
          ? 'That account cannot receive USDC yet: it needs a USDC trustline.'
          : error.message,
      )
    }
    if (error instanceof NetworkUnavailableError) throw new SendUnavailableError(error.message)
    throw new SendUnavailableError('Could not check this transfer with Stellar.')
  }

  return { to, amount, gasCost: 0n, total: amount, balance, balanceAfter: balance - amount, call }
}

/** The largest amount that can leave. The whole balance, since the relayer pays the fee. */
export function maxSendable(balance: bigint, gasCost: bigint): bigint {
  return balance > gasCost ? balance - gasCost : 0n
}
