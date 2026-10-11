import { createPublicClient, decodeEventLog, fallback, http, parseAbi } from 'viem'
import type { PublicClient } from 'viem'
import { arcTestnet } from 'viem/chains'

/**
 * What a transaction actually did, read from the chain.
 *
 * The request body that reports a tip is a claim, not a fact: anyone can POST
 * a channel ID and an amount. So nothing in it is stored. The transaction is
 * fetched, its `Transfer` logs are decoded, and the tip is recorded as the
 * amount that genuinely reached that creator's escrow — or not recorded at all
 * (idea.md §8). Otherwise a creator's balance is whatever a stranger typed.
 */
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'

const TRANSFER_ABI = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])

export interface VerifiedTransfer {
  from: `0x${string}`
  to: `0x${string}`
  /** Accounting units, summed across every transfer to this recipient. */
  amount: bigint
}

export class ChainUnavailableError extends Error {
  constructor(message = 'Could not read that transaction from Arc.') {
    super(message)
    this.name = 'ChainUnavailableError'
  }
}

export function arcClient(): PublicClient {
  // The public endpoints rate-limit separately, so a refusal from one becomes a
  // slower answer rather than an unverifiable tip.
  return createPublicClient({
    chain: arcTestnet,
    transport: fallback(arcTestnet.rpcUrls.default.http.map((url) => http(url))),
  })
}

/**
 * Reads a transaction and returns the USDC that reached `recipient`.
 *
 * Null means the transaction is real but paid this recipient nothing — a
 * different creator, a plain transfer elsewhere, or a reverted attempt. That is
 * a refusal to record, not an error to retry.
 */
export async function verifyTransfer(
  client: PublicClient,
  txHash: `0x${string}`,
  recipient: string,
): Promise<VerifiedTransfer | null> {
  let receipt: Awaited<ReturnType<PublicClient['getTransactionReceipt']>>
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash })
  } catch {
    // Not yet mined and never mined look identical here, so this stays an
    // error the caller can retry rather than a verdict on the tip.
    throw new ChainUnavailableError()
  }

  if (receipt.status !== 'success') return null

  const wanted = recipient.toLowerCase()
  let total = 0n
  let from: `0x${string}` | null = null

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue

    let event: { eventName: string; args: { from: `0x${string}`; to: `0x${string}`; value: bigint } }
    try {
      event = decodeEventLog({ abi: TRANSFER_ABI, data: log.data, topics: log.topics }) as typeof event
    } catch {
      continue
    }

    if (event.eventName !== 'Transfer') continue
    if (event.args.to.toLowerCase() !== wanted) continue

    // Summed, because a memo'd tip routes its transfer through Arc's `Memo`
    // wrapper and an unusual sender could split one payment across two logs.
    total += event.args.value
    from ??= event.args.from
  }

  if (total === 0n || !from) return null

  return { from, to: recipient as `0x${string}`, amount: total }
}
