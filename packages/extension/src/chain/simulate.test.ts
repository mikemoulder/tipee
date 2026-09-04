import type { PublicClient } from 'viem'
import { describe, expect, it } from 'vitest'

import { USDC_ADDRESS } from './arc'
import {
  InsufficientFundsError,
  SendUnavailableError,
  ceilToAccounting,
  maxSendable,
  previewSend,
  transferCall,
} from './simulate'

const ME = '0x742d35cc6634c0532925a3b844bc454e4438f44e' as const
const THEM = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' as const

/** An RPC that answers the four questions a preview asks. */
function fakeClient(options: {
  balance?: bigint
  gas?: bigint
  price?: bigint
  simulate?: () => unknown
  failOn?: 'balance' | 'gas'
}): PublicClient {
  return {
    readContract: async () => {
      if (options.failOn === 'balance') throw new Error('rpc down')
      return options.balance ?? 100_000_000n
    },
    simulateContract: async () => {
      if (options.simulate) return { result: options.simulate() }
      return { result: true }
    },
    estimateGas: async () => {
      if (options.failOn === 'gas') throw new Error('rpc down')
      return options.gas ?? 65_000n
    },
    estimateFeesPerGas: async () => ({ maxFeePerGas: options.price ?? 30_000_000_000n }),
    getGasPrice: async () => options.price ?? 30_000_000_000n,
  } as unknown as PublicClient
}

describe('previewing a send', () => {
  it('reports the fee, the total, and what the balance becomes', async () => {
    // 65,000 gas at 30 gwei is 0.00195 USDC in the 18-decimal view.
    const preview = await previewSend(fakeClient({ balance: 20_000_000n }), {
      from: ME,
      to: THEM,
      amount: 5_000_000n,
    })

    expect(preview.gasCost).toBe(1_950n)
    expect(preview.total).toBe(5_001_950n)
    expect(preview.balanceAfter).toBe(20_000_000n - 5_001_950n)
    expect(preview.call.to).toBe(USDC_ADDRESS)
    expect(preview.call.data).toBe(transferCall(THEM, 5_000_000n).data)
  })

  it('counts the fee against the balance, because gas here is the asset being sent', async () => {
    // The whole balance can never leave: the fee comes out of the same pool.
    const client = fakeClient({ balance: 5_000_000n })

    await expect(previewSend(client, { from: ME, to: THEM, amount: 5_000_000n })).rejects.toBeInstanceOf(
      InsufficientFundsError,
    )
  })

  it('says how far short, since the shortfall is usually exactly the fee', async () => {
    const client = fakeClient({ balance: 5_000_000n })
    const error = await previewSend(client, { from: ME, to: THEM, amount: 5_000_000n }).catch((e) => e)

    expect((error as InsufficientFundsError).shortBy).toBe(1_950n)
  })

  it('refuses a transfer the token contract answers false to', async () => {
    // Not every failure reverts. Reading the reply is the point of running the
    // transfer rather than only estimating its gas.
    const client = fakeClient({ simulate: () => false })

    await expect(previewSend(client, { from: ME, to: THEM, amount: 1_000_000n })).rejects.toThrow(
      'Arc rejected this transfer.',
    )
  })

  it('turns a revert into something the sender can act on', async () => {
    const client = fakeClient({
      simulate: () => {
        throw new Error('execution reverted: ERC20: transfer amount exceeds balance')
      },
    })

    await expect(previewSend(client, { from: ME, to: THEM, amount: 1_000_000n })).rejects.toThrow(
      'That is more USDC than this wallet holds.',
    )
  })

  it('does not guess a fee it could not estimate', async () => {
    const client = fakeClient({ failOn: 'gas' })
    await expect(previewSend(client, { from: ME, to: THEM, amount: 1_000_000n })).rejects.toThrow(
      'Could not estimate the network fee.',
    )
  })

  it('does not proceed on a balance it could not read', async () => {
    const client = fakeClient({ failOn: 'balance' })
    await expect(previewSend(client, { from: ME, to: THEM, amount: 1_000_000n })).rejects.toBeInstanceOf(
      SendUnavailableError,
    )
  })

  it('refuses an empty send before asking the network anything', async () => {
    await expect(previewSend(fakeClient({}), { from: ME, to: THEM, amount: 0n })).rejects.toThrow(
      'Enter an amount to send.',
    )
  })
})

describe('the most that can be sent', () => {
  it('is the balance less the fee', () => {
    expect(maxSendable(20_000_000n, 1_950n)).toBe(19_998_050n)
  })

  it('is nothing when the fee is the whole balance', () => {
    expect(maxSendable(1_000n, 1_950n)).toBe(0n)
  })
})

describe('pricing gas in accounting units', () => {
  it('rounds up, so a fee is never shown short', () => {
    // A fee shown a hundredth of a cent low is a balance check that passes on a
    // transaction that cannot pay for itself.
    expect(ceilToAccounting(1n)).toBe(1n)
    expect(ceilToAccounting(10n ** 12n)).toBe(1n)
    expect(ceilToAccounting(10n ** 12n + 1n)).toBe(2n)
  })
})
