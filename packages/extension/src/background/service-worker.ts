import {
  MIN_TIP,
  formatUsdc,
  tryParseUsdc,
  type ComposerContext,
  type ExtensionMessage,
  type ScrapedCreator,
  type SendTipOutcome,
} from '@tipee/shared'
import { mnemonicToAccount } from 'viem/accounts'

import { arcPublicClient, arcWalletClient, usdcBalance } from '../chain/arc'
import { EscrowUnavailableError, reportTip, resolveCreator } from '../chain/creators'
import { recordTip } from '../chain/journal'
import { buildTipCall } from '../chain/tip'
import { WalletLockedError, WalletWipedError, getWalletAddress } from '../wallet/keystore'
import { isUnlocked, sessionMnemonic, unlock } from '../wallet/session'

let composerWindowId: number | undefined
let pendingCreator: ScrapedCreator | null = null

chrome.runtime.onInstalled.addListener(() => {
  console.info('Tipee extension installed')
})

/**
 * `sendResponse` is only allowed to fire while the listener has returned `true`,
 * and only for the branches that actually answer — returning `true` from a
 * fire-and-forget branch leaves the caller's port open until it times out.
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'OPEN_COMPOSER') {
    pendingCreator = message.creator
    void openComposer()
    return false
  }

  if (message.type === 'GET_COMPOSER_CONTEXT') {
    void composerContext(message.amount, message.memo).then(sendResponse)
    return true
  }

  if (message.type === 'SEND_TIP') {
    void sendTip(message).then(sendResponse)
    return true
  }

  return false
})

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === composerWindowId) {
    composerWindowId = undefined
    pendingCreator = null
  }
})

async function openComposer(): Promise<void> {
  if (composerWindowId !== undefined) {
    try {
      await chrome.windows.update(composerWindowId, { focused: true })
      return
    } catch {
      composerWindowId = undefined
    }
  }

  const query = pendingCreator ? `?creator=${encodeURIComponent(JSON.stringify(pendingCreator))}` : ''
  const window = await chrome.windows.create({
    url: `${chrome.runtime.getURL('composer.html')}${query}`,
    type: 'popup',
    width: 380,
    height: 620,
    focused: true,
  })
  composerWindowId = window.id
}

/**
 * What this tip would cost, read without unlocking anything.
 *
 * Estimation needs a sender but not a signature, and the wallet address is
 * stored in the clear — so the composer can show real numbers before the gifter
 * has typed a PIN. Every field is independently nullable: a balance that could
 * not be read should not also cost the gifter the escrow address.
 */
async function composerContext(amount: string, memo: string): Promise<ComposerContext> {
  const context: ComposerContext = {
    walletAddress: null,
    balance: null,
    gasCost: null,
    recipient: null,
    problem: null,
    needsPin: !(await isUnlocked()),
  }

  context.walletAddress = await getWalletAddress()
  if (!context.walletAddress) {
    context.problem = 'Set up your Tipee wallet before sending a tip.'
    return context
  }

  if (pendingCreator) {
    try {
      context.recipient = (await resolveCreator(pendingCreator.handle)).escrowAddress
    } catch (error) {
      context.problem = error instanceof EscrowUnavailableError ? error.message : 'Could not find this creator.'
    }
  }

  const client = arcPublicClient()
  try {
    context.balance = formatUsdc(await usdcBalance(client, context.walletAddress as `0x${string}`))
  } catch {
    context.problem ??= 'Could not read your balance from Arc.'
  }

  const parsed = tryParseUsdc(amount) ?? MIN_TIP
  if (context.recipient) {
    try {
      // Estimated against the call that will actually be sent — a memo turns a
      // bare transfer into a wrapped one, and the difference is real gas.
      const call = buildTipCall({
        recipient: context.recipient as `0x${string}`,
        amount: parsed,
        memo,
        nonce: crypto.randomUUID(),
      })
      const gas = await client.estimateGas({
        account: context.walletAddress as `0x${string}`,
        to: call.to,
        data: call.data,
      })
      const fees = await client.estimateFeesPerGas()
      const price = fees.maxFeePerGas ?? (await client.getGasPrice())
      context.gasCost = formatUsdc(nativeToAccounting(gas * price))
    } catch {
      context.problem ??= 'Could not estimate the network fee.'
    }
  }

  return context
}

/**
 * Gas is priced in the 18-decimal native view; everything the user sees is the
 * 6-decimal ERC-20 view of the same money. Scaling down truncates, so this
 * rounds *up* — a fee shown a hundredth of a cent low is a fee that can leave a
 * balance check passing on a transaction that cannot pay for itself.
 */
function nativeToAccounting(wei: bigint): bigint {
  const scale = 10n ** 12n
  return (wei + scale - 1n) / scale
}

async function sendTip(message: Extract<ExtensionMessage, { type: 'SEND_TIP' }>): Promise<SendTipOutcome> {
  const amount = tryParseUsdc(message.amount)
  if (amount === null || amount < MIN_TIP) {
    return { ok: false, message: 'That amount cannot be sent.' }
  }

  if (!pendingCreator) {
    return { ok: false, message: 'This tip has lost track of its creator. Close and try again.' }
  }

  let creator: Awaited<ReturnType<typeof resolveCreator>>
  try {
    creator = await resolveCreator(pendingCreator.handle)
  } catch (error) {
    return { ok: false, message: error instanceof EscrowUnavailableError ? error.message : 'Could not find this creator.' }
  }

  // An open wallet signs without asking again; a locked one — or an owner who
  // asked for a PIN every time — comes through with one to check.
  let mnemonic: string | null = message.pin === '' ? await sessionMnemonic() : null
  if (mnemonic === null) {
    try {
      mnemonic = await unlock(message.pin)
    } catch (error) {
      return { ok: false, message: unlockMessage(error) }
    }
  }

  try {
    const account = mnemonicToAccount(mnemonic)
    const recipient = creator.escrowAddress
    const call = buildTipCall({ recipient, amount, memo: message.memo, nonce: message.nonce })

    // Re-checked here rather than trusted from the composer: the estimate there
    // was taken before the PIN was typed, and the balance can have moved since.
    const client = arcPublicClient()
    const balance = await usdcBalance(client, account.address)
    const gas = await client.estimateGas({ account: account.address, to: call.to, data: call.data })
    const fees = await client.estimateFeesPerGas()
    const price = fees.maxFeePerGas ?? (await client.getGasPrice())
    if (amount + nativeToAccounting(gas * price) > balance) {
      return { ok: false, message: 'Not enough USDC left to cover the tip and its network fee.' }
    }

    const txHash = await arcWalletClient(account).sendTransaction({
      account,
      chain: undefined,
      to: call.to,
      data: call.data,
    })

    // Who this paid, so the wallet can say "Tipped @creator" later. The chain
    // knows the transfer; only this side knows whose escrow that address is.
    await recordTip({
      txHash,
      handle: pendingCreator.handle,
      displayName: pendingCreator.displayName,
      recipient,
      amount: amount.toString(),
      at: Date.now(),
    })

    // And tell the backend, without making the gifter wait for it or see it
    // fail — the tip is already on Arc either way.
    void reportTip({ channelId: creator.channelId, gifterAddress: account.address, amount, txHash })

    return { ok: true, txHash }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'The tip could not be sent.' }
  }
}

/** Unlock failures, translated without echoing anything about the PIN itself. */
function unlockMessage(error: unknown): string {
  if (error instanceof WalletWipedError) {
    return 'Too many wrong PINs — this wallet has been erased.'
  }
  if (error instanceof WalletLockedError) {
    const seconds = Math.ceil(error.retryAfterMs / 1000)
    return `Too many attempts. Try again in ${seconds}s.`
  }
  return 'That PIN is not correct.'
}
