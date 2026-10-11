import {
  MIN_TIP,
  formatUsdc,
  tryParseUsdc,
  type ComposerContext,
  type ExtensionMessage,
  type ScrapedCreator,
  type SendTipOutcome,
} from '@tipee/shared'

import { EscrowUnavailableError, reportTip, resolveCreator } from '../chain/creators'
import { recordTip } from '../chain/journal'
import { NetworkUnavailableError, RelayError, SimulationError, authorise, relay, usdcBalance } from '../chain/stellar'
import { buildTipCall } from '../chain/tip'
import { WalletLockedError, WalletWipedError, getWalletAddress } from '../wallet/keystore'
import { keypairFromMnemonic } from '../wallet/sep5'
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
 * Reading needs no signature, and the wallet address is stored in the clear —
 * so the composer can show real numbers before the gifter has typed a PIN.
 * The fee is always zero to the gifter: Tipee's relayer pays it. Every field is
 * independently nullable: a balance that could not be read should not also
 * cost the gifter the creator.
 */
async function composerContext(_amount: string, _memo: string): Promise<ComposerContext> {
  const context: ComposerContext = {
    walletAddress: null,
    balance: null,
    gasCost: formatUsdc(0n),
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
      context.recipient = (await resolveCreator(pendingCreator.handle)).escrowContract
    } catch (error) {
      context.problem = error instanceof EscrowUnavailableError ? error.message : 'Could not find this creator.'
    }
  }

  try {
    context.balance = formatUsdc(await usdcBalance(context.walletAddress))
  } catch {
    context.problem ??= 'Could not read your balance from Stellar.'
  }

  return context
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
    const owner = keypairFromMnemonic(mnemonic)
    const wallet = await getWalletAddress()
    if (!wallet) return { ok: false, message: 'Set up your Tipee wallet before sending a tip.' }

    // Re-checked here rather than trusted from the composer: the balance there
    // was read before the PIN was typed, and it can have moved since.
    const balance = await usdcBalance(wallet)
    if (amount > balance) {
      return { ok: false, message: 'Not enough USDC in your wallet for this tip.' }
    }

    // Simulate, sign only the wallet's authorisation, and let the relayer
    // submit. The simulation is also the last check: a tip the chain would
    // refuse fails here, with a reason, before anything is signed.
    const call = buildTipCall({ wallet, channelId: creator.channelId, amount, memo: message.memo })
    const txHash = await relay(await authorise(call, owner))

    // Who this paid, so the wallet can say "Tipped @creator" later. The chain
    // records the channel ID; only this side knows the handle it was sent from.
    await recordTip({
      txHash,
      handle: pendingCreator.handle,
      displayName: pendingCreator.displayName,
      recipient: creator.escrowContract,
      amount: amount.toString(),
      at: Date.now(),
    })

    // And tell the backend, without making the gifter wait for it or see it
    // fail — the tip is already on Stellar either way.
    void reportTip({ channelId: creator.channelId, gifterAddress: wallet, amount, txHash })

    return { ok: true, txHash }
  } catch (error) {
    if (error instanceof SimulationError || error instanceof RelayError || error instanceof NetworkUnavailableError) {
      return { ok: false, message: error.message }
    }
    return { ok: false, message: 'The tip could not be sent.' }
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
