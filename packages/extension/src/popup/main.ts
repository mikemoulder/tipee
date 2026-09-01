import { MIN_TIP, formatUsdc, tryParseUsdc, validateTip } from '@tipee/shared'

import './styles.css'
import { ARC_LOGO, arcMark } from '../brand/arc-mark'
import { ActivityUnavailableError, recentMovements, type Movement } from '../chain/activity'
import { arcPublicClient, arcWalletClient, usdcBalance } from '../chain/arc'
import { buildTipCall } from '../chain/tip'
import {
  WalletLockedError,
  WalletWipedError,
  createWalletRecord,
  getWalletAddress,
  hasWallet,
  unlockWallet,
} from '../wallet/keystore'
import { mnemonicToAccount } from 'viem/accounts'
import { isAddress } from 'viem'

const app = () => document.querySelector<HTMLElement>('#app')

/* Icons ------------------------------------------------------------------ */

const ICON = {
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6a2 2 0 1 1 4 0A1.7 1.7 0 0 0 16.9 6l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
}

/* Screens ---------------------------------------------------------------- */

async function boot(): Promise<void> {
  const host = app()
  if (!host) return
  if (!(await hasWallet())) return renderWelcome()

  const address = await getWalletAddress()
  if (!address) return renderWelcome()
  renderHome(address as `0x${string}`)
}

function chrome_(): string {
  return `
    <header class="bar">
      <span class="wordmark">tipee</span>
      <button class="icon-button" id="settings" type="button" aria-label="Settings">${ICON.gear}</button>
    </header>`
}

function backBar(title: string): string {
  return `
    <header class="bar">
      <button class="icon-button" id="back" type="button" aria-label="Back">${ICON.back}</button>
      <span class="bar-title">${escapeHtml(title)}</span>
      <span class="bar-spacer"></span>
    </header>`
}

/**
 * The wallet's home: what you hold, the two things you can do with it, and what
 * has happened lately — the structure OKX uses, in Talise's language.
 */
function renderHome(address: `0x${string}`): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    ${chrome_()}
    <section class="holding">
      <p class="holding-label">Balance</p>
      <p class="holding-value" id="balance">—</p>
      <p class="holding-sub" id="balance-sub">${arcMark()}</p>
    </section>

    <nav class="actions">
      <button class="action" id="deposit" type="button">
        <span class="action-icon">${ICON.down}</span>
        <span class="action-label">Deposit</span>
      </button>
      <button class="action" id="withdraw" type="button">
        <span class="action-icon">${ICON.up}</span>
        <span class="action-label">Withdraw</span>
      </button>
    </nav>

    <section class="activity">
      <p class="section-label">Activity</p>
      <div id="activity-list"><p class="muted-line">Loading…</p></div>
    </section>
  `

  document.querySelector('#settings')?.addEventListener('click', () => renderSettings(address))
  document.querySelector('#deposit')?.addEventListener('click', () => renderDeposit(address))
  document.querySelector('#withdraw')?.addEventListener('click', () => renderWithdraw(address))

  void loadBalance(address)
  void loadActivity(address)
}

async function loadBalance(address: `0x${string}`): Promise<void> {
  const value = document.querySelector<HTMLElement>('#balance')
  if (!value) return
  try {
    const balance = await usdcBalance(arcPublicClient(), address)
    // USDC is dollar-denominated, so the big number is shown in dollars — but
    // this is testnet, which the chip underneath never stops saying.
    value.textContent = `$${formatUsdc(balance)}`
    value.dataset.raw = formatUsdc(balance)
  } catch {
    value.textContent = '—'
    const sub = document.querySelector<HTMLElement>('#balance-sub')
    if (sub) sub.innerHTML = `${arcMark()}<span class="muted-line"> · balance unavailable</span>`
  }
}

async function loadActivity(address: `0x${string}`): Promise<void> {
  const list = document.querySelector<HTMLElement>('#activity-list')
  if (!list) return

  try {
    const movements = await recentMovements(arcPublicClient(), address)
    if (movements.length === 0) {
      list.innerHTML = '<p class="muted-line">Nothing yet. Tips you send will show up here.</p>'
      return
    }
    list.innerHTML = movements.map(movementRow).join('')
  } catch (error) {
    // Never an empty list here: "you have sent nothing" and "we could not find
    // out" look the same on screen and mean opposite things.
    list.innerHTML = `<p class="muted-line">${
      error instanceof ActivityUnavailableError ? 'Could not read activity from Arc.' : 'Activity unavailable.'
    }</p>`
  }
}

function movementRow(movement: Movement): string {
  const sign = movement.outgoing ? '−' : '+'
  return `
    <div class="movement">
      <span class="movement-icon ${movement.outgoing ? 'out' : 'in'}">${movement.outgoing ? ICON.up : ICON.down}</span>
      <span class="movement-copy">
        <span class="movement-title">${movement.outgoing ? 'Sent' : 'Received'}</span>
        <span class="movement-sub">${escapeHtml(shorten(movement.counterparty))}</span>
      </span>
      <span class="movement-amount ${movement.outgoing ? 'out' : 'in'}">${sign}${formatUsdc(movement.amount)}</span>
    </div>`
}

/* Deposit ---------------------------------------------------------------- */

function renderDeposit(address: `0x${string}`): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    <header class="bar">
      <button class="icon-button" id="back" type="button" aria-label="Back">${ICON.back}</button>
      <span class="bar-title">Deposit</span>
      <button class="icon-button" id="close" type="button" aria-label="Close">${ICON.close}</button>
    </header>

    <section class="deposit">
      <div class="qr-frame" id="qr"></div>
      <p class="warn">Only send <strong>USDC on Arc testnet</strong> to this address.</p>

      <div class="asset-card">
        <div class="asset-head">
          <span class="asset-symbol">USDC</span>
          ${arcMark()}
        </div>
        <div class="asset-body">
          <p class="address" id="address">${escapeHtml(address)}</p>
          <button class="ghost" id="copy" type="button">${ICON.copy}<span>Copy</span></button>
        </div>
      </div>
    </section>

    <div class="bracket"><button class="primary" id="faucet" type="button">Get testnet USDC</button></div>
  `

  // Generated from our own stored address, and the SVG is built by us — but it
  // still goes in as markup, so it is kept away from anything user-supplied.
  const frame = document.querySelector<HTMLElement>('#qr')
  if (frame) void renderQr(frame, address)

  document.querySelector('#back')?.addEventListener('click', () => renderHome(address))
  document.querySelector('#close')?.addEventListener('click', () => window.close())
  document.querySelector('#copy')?.addEventListener('click', () => {
    void navigator.clipboard.writeText(address).then(() => {
      const label = document.querySelector<HTMLElement>('#copy span')
      if (!label) return
      label.textContent = 'Copied'
      window.setTimeout(() => (label.textContent = 'Copy'), 1_500)
    })
  })

  // Replaces OKX's "Set amount", which asks the sender for a figure. On a test
  // network the useful action is not naming an amount — it is having any USDC
  // at all, and the faucet is the only place it comes from.
  document.querySelector('#faucet')?.addEventListener('click', () => openTab(CIRCLE_FAUCET))
}

/** Where testnet USDC comes from. */
const CIRCLE_FAUCET = 'https://faucet.circle.com'

function openTab(url: string): void {
  // `chrome.tabs.create` needs no permission for this, but the popup is also
  // rendered outside an extension context during development.
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    void chrome.tabs.create({ url })
    return
  }
  window.open(url, '_blank', 'noopener')
}

async function renderQr(frame: HTMLElement, address: string): Promise<void> {
  // Loaded on demand: the encoder is only needed on this one screen, so it does
  // not sit in the popup's start-up cost.
  const { qrSvg } = await import('./qr')
  frame.innerHTML = qrSvg(address, { logo: ARC_LOGO })
}

/* Withdraw --------------------------------------------------------------- */

function renderWithdraw(address: `0x${string}`): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    ${backBar('Withdraw')}
    <section class="form">
      <label for="to">To address</label>
      <input id="to" type="text" autocomplete="off" spellcheck="false" placeholder="0x…" />
      <label for="amount">Amount</label>
      <input id="amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" />
      <label for="pin">PIN</label>
      <input id="pin" type="password" inputmode="numeric" autocomplete="off" />
      <p class="error" id="withdraw-error"></p>
      <div class="bracket"><button class="primary" id="send" type="button">Withdraw</button></div>
    </section>
  `

  document.querySelector('#back')?.addEventListener('click', () => renderHome(address))
  document.querySelector('#send')?.addEventListener('click', () => void submitWithdraw(address))
}

async function submitWithdraw(owner: `0x${string}`): Promise<void> {
  const to = document.querySelector<HTMLInputElement>('#to')?.value.trim() ?? ''
  const amountText = document.querySelector<HTMLInputElement>('#amount')?.value ?? ''
  const pin = document.querySelector<HTMLInputElement>('#pin')?.value ?? ''
  const error = document.querySelector<HTMLElement>('#withdraw-error')
  const say = (message: string): void => {
    if (error) error.textContent = message
  }

  if (!isAddress(to)) return say('That is not a valid address.')
  const amount = tryParseUsdc(amountText)
  if (amount === null || amount <= 0n) return say('Enter an amount to withdraw.')
  if (pin === '') return say('Enter your PIN.')

  say('Sending…')

  let mnemonic: string
  try {
    mnemonic = await unlockWallet(pin)
  } catch (err) {
    return say(unlockMessage(err))
  }

  try {
    const account = mnemonicToAccount(mnemonic)
    const call = buildTipCall({ recipient: to as `0x${string}`, amount, memo: '', nonce: crypto.randomUUID() })
    const client = arcPublicClient()

    // Same headroom rule as a tip: gas is USDC out of this balance, so a wallet
    // holding exactly the amount cannot send it (idea.md §3.1.5).
    const balance = await usdcBalance(client, owner)
    const gas = await client.estimateGas({ account: account.address, to: call.to, data: call.data })
    const fees = await client.estimateFeesPerGas()
    const price = fees.maxFeePerGas ?? (await client.getGasPrice())
    const check = validateTip({ amount, balance, gasCost: ceilToAccounting(gas * price), minimum: MIN_TIP })
    if (!check.ok) return say(check.message)

    await arcWalletClient(account).sendTransaction({
      account,
      chain: undefined,
      to: call.to,
      data: call.data,
    })
    renderHome(owner)
  } catch (err) {
    say(err instanceof Error ? err.message : 'The withdrawal could not be sent.')
  }
}

/** Gas is priced in 18 decimals; rounds up, so a fee is never shown short. */
function ceilToAccounting(wei: bigint): bigint {
  const scale = 10n ** 12n
  return (wei + scale - 1n) / scale
}

/* Settings --------------------------------------------------------------- */

function renderSettings(address: `0x${string}`): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    ${backBar('Settings')}
    <section class="form">
      <p class="section-label">Wallet address</p>
      <p class="address">${escapeHtml(address)}</p>

      <p class="section-label">Recovery phrase</p>
      <p class="muted-line">Twelve words that restore this wallet anywhere. Anyone who reads them can spend your funds.</p>
      <label for="reveal-pin">PIN</label>
      <input id="reveal-pin" type="password" inputmode="numeric" autocomplete="off" />
      <p class="error" id="reveal-error"></p>
      <div class="bracket"><button class="primary" id="reveal" type="button">Reveal phrase</button></div>
    </section>
  `

  document.querySelector('#back')?.addEventListener('click', () => renderHome(address))
  document.querySelector('#reveal')?.addEventListener('click', () => void revealPhrase(address))
}

async function revealPhrase(address: `0x${string}`): Promise<void> {
  const pin = document.querySelector<HTMLInputElement>('#reveal-pin')?.value ?? ''
  const error = document.querySelector<HTMLElement>('#reveal-error')
  if (pin === '') {
    if (error) error.textContent = 'Enter your PIN.'
    return
  }

  let mnemonic: string
  try {
    mnemonic = await unlockWallet(pin)
  } catch (err) {
    if (error) error.textContent = unlockMessage(err)
    return
  }

  const host = app()
  if (!host) return
  host.innerHTML = `
    ${backBar('Recovery phrase')}
    <section class="form">
      ${seedGrid(mnemonic)}
      <p class="warn">Write these down offline. Screenshots and password managers both end up somewhere you did not choose.</p>
      <div class="bracket"><button class="primary" id="done" type="button">Done</button></div>
    </section>
  `
  document.querySelector('#back')?.addEventListener('click', () => renderHome(address))
  document.querySelector('#done')?.addEventListener('click', () => renderHome(address))
}

function seedGrid(mnemonic: string): string {
  return `<div class="seed-grid">${mnemonic
    .split(' ')
    .map((word, index) => `<div class="seed-word"><span>${index + 1}</span>${escapeHtml(word)}</div>`)
    .join('')}</div>`
}

/* Onboarding ------------------------------------------------------------- */

function renderWelcome(): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    ${chrome_()}
    <section class="holding">
      <p class="holding-label">Balance</p>
      <p class="holding-value">$0.00</p>
      <p class="holding-sub">${arcMark()}</p>
    </section>
    <section class="form">
      <p class="muted-line">Tipee keeps a wallet in this browser, encrypted with a PIN. The keys never leave it.</p>
      <div class="bracket"><button class="primary" id="setup-wallet" type="button">Set up wallet</button></div>
    </section>
  `

  document.querySelector('#settings')?.addEventListener('click', () => renderWelcome())
  document.querySelector('#setup-wallet')?.addEventListener('click', () => renderPinSetup())
}

function renderPinSetup(): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    ${backBar('Create a PIN')}
    <section class="form">
      <label for="pin">6-digit PIN</label>
      <input id="pin" type="password" inputmode="numeric" maxlength="32" autocomplete="off" />
      <label for="pin-confirm">Confirm PIN</label>
      <input id="pin-confirm" type="password" inputmode="numeric" maxlength="32" autocomplete="off" />
      <p class="error" id="pin-error"></p>
      <div class="bracket"><button class="primary" id="create-wallet" type="button">Create wallet</button></div>
    </section>
  `

  document.querySelector('#back')?.addEventListener('click', () => renderWelcome())
  document.querySelector('#create-wallet')?.addEventListener('click', async () => {
    const pin = document.querySelector<HTMLInputElement>('#pin')?.value ?? ''
    const confirm = document.querySelector<HTMLInputElement>('#pin-confirm')?.value ?? ''
    const error = document.querySelector<HTMLElement>('#pin-error')
    const say = (message: string): void => {
      if (error) error.textContent = message
    }

    if (pin.length < 6 || !/^\d+$/.test(pin)) return say('PIN must be at least 6 digits.')
    if (pin !== confirm) return say('PINs do not match.')

    try {
      const record = await createWalletRecord(pin)
      renderSeedReveal(record.address, record.mnemonic)
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not create wallet.')
    }
  })
}

function renderSeedReveal(address: `0x${string}`, mnemonic: string): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    ${backBar('Back up your wallet')}
    <section class="form">
      ${seedGrid(mnemonic)}
      <label class="confirm-box">
        <input id="seed-confirm" type="checkbox" />
        I have written down these 12 words.
      </label>
      <div class="bracket"><button class="primary" id="continue-wallet" type="button" disabled>Continue</button></div>
    </section>
  `

  const confirm = document.querySelector<HTMLInputElement>('#seed-confirm')
  const continueButton = document.querySelector<HTMLButtonElement>('#continue-wallet')
  confirm?.addEventListener('change', () => {
    if (continueButton) continueButton.disabled = !confirm.checked
  })
  continueButton?.addEventListener('click', () => renderHome(address))
}

/* Shared ----------------------------------------------------------------- */

/** Unlock failures, translated without echoing anything about the PIN itself. */
export function unlockMessage(error: unknown): string {
  if (error instanceof WalletWipedError) return 'Too many wrong PINs — this wallet has been erased.'
  if (error instanceof WalletLockedError) {
    return `Too many attempts. Try again in ${Math.ceil(error.retryAfterMs / 1000)}s.`
  }
  return 'That PIN is not correct.'
}

/** `0x1a2b…9f0e` — enough of both ends to recognise, per idea.md §3.1.3. */
export function shorten(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)
}

void boot()
