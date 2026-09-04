import { encodeFunctionData } from 'viem'
import type { PublicClient } from 'viem'

import { ERC20_ABI, USDC_ADDRESS, usdcBalance } from './arc'

/**
 * What a send would do, worked out before anything is signed.
 *
 * Wallets show this because the alternative is asking someone to authorise a
 * transaction whose cost and outcome they cannot see. Arc's public RPCs support
 * neither `eth_simulateV1` nor `debug_traceCall` — both answer "method not
 * supported" — so the preview is built the way MetaMask builds it when its own
 * simulation service is unavailable: a dry `eth_call` that proves the transfer
 * would not revert, a gas estimate against that same call, and the resulting
 * balance worked out arithmetically.
 *
 * That is a preview of current state, not a promise: the chain can move between
 * this and the signature. It is re-run after the PIN for exactly that reason.
 */
export interface SendPreview {
  to: `0x${string}`
  /** Accounting units, all of them. */
  amount: bigint
  gasCost: bigint
  total: bigint
  balance: bigint
  balanceAfter: bigint
  /** The transaction this preview describes, ready to sign. */
  call: { to: `0x${string}`; data: `0x${string}` }
}

/** The transfer would not go through, and why in words a person can act on. */
export class SendUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SendUnavailableError'
  }
}

/**
 * Not enough USDC — carrying the shortfall, because "insufficient funds" on a
 * chain where gas is also USDC is usually somebody trying to send their whole
 * balance and being short by exactly the fee.
 */
export class InsufficientFundsError extends SendUnavailableError {
  constructor(
    readonly shortBy: bigint,
    message: string,
  ) {
    super(message)
    this.name = 'InsufficientFundsError'
  }
}

export function transferCall(to: `0x${string}`, amount: bigint): { to: `0x${string}`; data: `0x${string}` } {
  return {
    to: USDC_ADDRESS,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [to, amount] }),
  }
}

export async function previewSend(
  client: PublicClient,
  input: { from: `0x${string}`; to: `0x${string}`; amount: bigint },
): Promise<SendPreview> {
  const { from, to, amount } = input
  if (amount <= 0n) throw new SendUnavailableError('Enter an amount to send.')

  const call = transferCall(to, amount)

  let balance: bigint
  try {
    balance = await usdcBalance(client, from)
  } catch {
    throw new SendUnavailableError('Could not read your balance from Arc.')
  }

  // The dry run. It proves the transfer is accepted by the token contract as
  // this wallet, at this moment — the part arithmetic cannot tell you.
  try {
    const { result } = await client.simulateContract({
      account: from,
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, amount],
    })

    // A token may answer `false` instead of reverting. Reading the reply is the
    // whole point of simulating rather than estimating.
    if (result === false) throw new SendUnavailableError('Arc rejected this transfer.')
  } catch (error) {
    if (error instanceof SendUnavailableError) throw error
    throw new SendUnavailableError(revertMessage(error))
  }

  let gasCost: bigint
  try {
    const gas = await client.estimateGas({ account: from, to: call.to, data: call.data })
    const fees = await client.estimateFeesPerGas()
    const price = fees.maxFeePerGas ?? (await client.getGasPrice())
    gasCost = ceilToAccounting(gas * price)
  } catch {
    throw new SendUnavailableError('Could not estimate the network fee.')
  }

  const total = amount + gasCost
  if (total > balance) {
    // Gas on Arc is USDC out of this same balance, so sending the full balance
    // is always short by the fee. Say by how much rather than "insufficient".
    throw new InsufficientFundsError(
      total - balance,
      'Not enough USDC to cover this send and its network fee.',
    )
  }

  return { to, amount, gasCost, total, balance, balanceAfter: balance - total, call }
}

/**
 * The largest amount that can actually leave, which is never the whole balance
 * on a chain that charges gas in the asset being sent.
 */
export function maxSendable(balance: bigint, gasCost: bigint): bigint {
  return balance > gasCost ? balance - gasCost : 0n
}

/** Gas is priced in the 18-decimal native view; rounds up, never short. */
export function ceilToAccounting(wei: bigint): bigint {
  const scale = 10n ** 12n
  return (wei + scale - 1n) / scale
}

/**
 * A revert, in words. Node messages are for developers and sometimes carry
 * calldata; what a person needs is whether to change something and what.
 */
function revertMessage(error: unknown): string {
  const text = error instanceof Error ? `${error.message}` : ''
  if (/transfer amount exceeds balance|insufficient/i.test(text)) {
    return 'That is more USDC than this wallet holds.'
  }
  if (/reverted|execution reverted/i.test(text)) {
    return 'Arc rejected this transfer. The address may not be able to receive USDC.'
  }
  return 'Could not check this transfer with Arc.'
}
