import { createPublicClient, createWalletClient, http } from 'viem'
import type { Account, PublicClient, WalletClient } from 'viem'
import { arcTestnet } from 'viem/chains'

/**
 * Arc, and the one thing about it that changes how balances are read.
 *
 * On Arc the native gas asset *is* USDC — not a separate token that happens to
 * be named one. The same pool of funds is exposed two ways: a native view with
 * 18 decimals, used only for gas and `msg.value`, and the ERC-20 at the address
 * below with 6 decimals, used for everything else. They are the same money.
 *
 * So a balance is read from the ERC-20 and only from the ERC-20. Reading both
 * and showing them separately — or adding them — counts one pool twice, and
 * "converting" between them is not a swap because there is nothing to swap.
 * `viem`'s `useBalance`/`getBalance` returns the 18-decimal native view and its
 * symbol is also `USDC`, which is exactly how that mistake gets made.
 */
export const ARC_CHAIN = arcTestnet

/** USDC's ERC-20 interface. 6 decimals — the accounting view. */
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export function arcPublicClient(): PublicClient {
  return createPublicClient({ chain: ARC_CHAIN, transport: http() })
}

export function arcWalletClient(account: Account): WalletClient {
  return createWalletClient({ account, chain: ARC_CHAIN, transport: http() })
}

/**
 * The spendable USDC balance, in accounting units.
 *
 * Deliberately the ERC-20 `balanceOf` and not `getBalance` — see above.
 */
export async function usdcBalance(
  client: PublicClient,
  owner: `0x${string}`,
): Promise<bigint> {
  return client.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [owner],
  })
}
