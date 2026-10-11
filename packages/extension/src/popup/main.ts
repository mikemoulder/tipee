import { ESCROW_CONTRACT_ID, RELAYER_ADDRESS, explorerTxUrl, formatUsdc, tryParseUsdc } from '@tipee/shared'

import './styles.css'
import { NETWORK_LOGO, networkBadge, networkMark } from '../brand/network-mark'
import { ActivityUnavailableError, LEDGER_SECONDS, walletActivity, type ActivityReport, type Movement } from '../chain/activity'
import { apiBase, setApiBase } from '../chain/creators'
import { tipLabels, type TipRecord } from '../chain/journal'
import { RelayError, authorise, deployWallet, relay, requestFaucet, usdcBalance } from '../chain/stellar'
import {
  InsufficientFundsError,
  SendUnavailableError,
  isValidDestination,
  maxSendable,
  previewSend,
  type SendPreview,
} from '../chain/simulate'
import {
  WalletLockedError,
  WalletWipedError,
  createWalletRecord,
  getWalletAddress,
  hasWallet,
  unlockWallet,
} from '../wallet/keystore'
import {
  UNLOCK_POLICIES,
  isUnlocked,
  lock,
  sessionMnemonic,
  setUnlockPolicy,
  unlock,
  unlockPolicy,
  type UnlockPolicy,
} from '../wallet/session'
import { keypairFromMnemonic } from '../wallet/sep5'

const app = () => document.querySelector<HTMLElement>('#app')

/* Icons ------------------------------------------------------------------ */

const ICON = {
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6a2 2 0 1 1 4 0A1.7 1.7 0 0 0 16.9 6l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11a8.5 8.5 0 1 0-.9 4.7"/><path d="M20.5 5.5v6h-6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6.5 9.5 17 4 11.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5 2.8 20h18.4L12 4.5Z"/><path d="M12 10.5v3.5"/><path d="M12 17h.01"/></svg>',
}

/* Screens ---------------------------------------------------------------- */

async function boot(): Promise<void> {
  const host = app()
  if (!host) return
  if (!(await hasWallet())) return renderWelcome()

  const address = await getWalletAddress()
  if (!address) return renderWelcome()

  // Locked on a fresh browser, open for the rest of it — the owner sets which
  // in Settings.
  if (await isUnlocked()) return renderHome(address )
  renderLocked(address )
}

/* Lock screen ------------------------------------------------------------ */

function renderLocked(address: string): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    <header class="bar">
      <span class="wordmark">tipee</span>
      <span class="bar-actions">${networkBadge()}</span>
    </header>
    <section class="form locked">
      <div class="state">
        <span class="state-icon">${ICON.lock}</span>
        <p class="state-title">Wallet locked</p>
        <p class="state-detail">Enter your PIN to unlock ${escapeHtml(shorten(address))}.</p>
      </div>
      <label for="unlock-pin">PIN</label>
      <input id="unlock-pin" type="password" inputmode="numeric" maxlength="32" autocomplete="off" autofocus />
      <p class="error" id="unlock-error"></p>
      <div class="bracket"><button class="primary" id="unlock" type="button">Unlock</button></div>
    </section>
  `

  const submit = (): void => void unlockWalletFromScreen(address)
  document.querySelector('#unlock')?.addEventListener('click', submit)
  document.querySelector('#unlock-pin')?.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') submit()
  })
}

async function unlockWalletFromScreen(address: string): Promise<void> {
  const pin = document.querySelector<HTMLInputElement>('#unlock-pin')?.value ?? ''
  const error = document.querySelector<HTMLElement>('#unlock-error')
  if (pin === '') {
    if (error) error.textContent = 'Enter your PIN.'
    return
  }

  try {
    await unlock(pin)
    renderHome(address)
  } catch (err) {
    if (error) error.textContent = unlockMessage(err)
  }
}

function chrome_(): string {
  return `
    <header class="bar">
      <span class="wordmark">tipee</span>
      <span class="bar-actions">
        ${networkBadge()}
        <button class="icon-button" id="settings" type="button" aria-label="Settings">${ICON.gear}</button>
      </span>
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
function renderHome(address: string): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    ${chrome_()}

    <section class="holding">
      <p class="holding-label">Balance</p>
      <p class="holding-value" id="balance">$<span class="pending">—</span></p>
      <div class="holding-meta">
        <button class="chip-button" id="copy-address" type="button" aria-label="Copy wallet address">
          <span id="copy-address-label">${escapeHtml(shorten(address))}</span>${ICON.copy}
        </button>
      </div>
      <p class="holding-note" id="balance-note"></p>
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
      <div class="section-head">
        <p class="section-label">Activity</p>
        <span class="section-note" id="activity-window"></span>
        <button class="icon-button small" id="refresh" type="button" aria-label="Refresh activity">${ICON.refresh}</button>
      </div>
      <div class="activity-list" id="activity-list">${skeletonRows()}</div>
    </section>
  `

  document.querySelector('#settings')?.addEventListener('click', () => renderSettings(address))
  document.querySelector('#deposit')?.addEventListener('click', () => renderDeposit(address))
  document.querySelector('#withdraw')?.addEventListener('click', () => renderWithdraw(address))
  document.querySelector('#copy-address')?.addEventListener('click', () => void copyAddress(address))
  document.querySelector('#refresh')?.addEventListener('click', () => refreshHome(address))

  refreshHome(address)
}

function refreshHome(address: string): void {
  const list = document.querySelector<HTMLElement>('#activity-list')
  if (list) list.innerHTML = skeletonRows()
  void loadBalance(address)
  void loadActivity(address)
}

/** The address is the one thing on this screen worth putting on a clipboard. */
async function copyAddress(address: string): Promise<void> {
  const label = document.querySelector<HTMLElement>('#copy-address-label')
  if (!label) return

  try {
    await navigator.clipboard.writeText(address)
    label.textContent = 'Copied'
  } catch {
    label.textContent = 'Copy failed'
  }
  window.setTimeout(() => (label.textContent = shorten(address)), 1_500)
}

async function loadBalance(address: string): Promise<void> {
  const value = document.querySelector<HTMLElement>('#balance')
  const note = document.querySelector<HTMLElement>('#balance-note')
  if (!value) return

  try {
    const balance = await usdcBalance(address)
    // USDC is dollar-denominated, so the big number is shown in dollars — but
    // this is testnet, which the chip underneath never stops saying.
    value.textContent = `$${formatUsdc(balance)}`
    value.dataset.raw = formatUsdc(balance)
    if (note) {
      note.textContent = ''
      note.classList.remove('note-warn')
    }
  } catch {
    // Never a zero here. A balance that could not be read and a balance that is
    // empty are the same picture and opposite facts, and one of them sends
    // someone off to top up money they already have.
    value.innerHTML = '$<span class="pending">—</span>'
    if (note) {
      note.textContent = 'Stellar did not answer — balance unknown.'
      note.classList.add('note-warn')
    }
  }
}

async function loadActivity(address: string): Promise<void> {
  const list = document.querySelector<HTMLElement>('#activity-list')
  const covered = document.querySelector<HTMLElement>('#activity-window')
  if (!list) return

  try {
    const [report, labels] = await Promise.all([
      walletActivity(address),
      tipLabels(),
    ])
    if (covered) covered.textContent = coverageNote(report)

    if (report.movements.length === 0) {
      list.innerHTML = emptyState(ICON.clock, 'Nothing yet', 'Tips you send show up here, newest first.')
      return
    }

    list.innerHTML = report.movements
      .map((movement) => {
        // By hash only. Every tip goes to the one escrow, so the recipient says
        // nothing about which creator a tip was for.
        const tip = labels.byHash.get(movement.txHash.toLowerCase())
        return movementRow(movement, report.head, movement.outgoing ? tip : undefined)
      })
      .join('')
  } catch (error) {
    // Never an empty list here: "you have sent nothing" and "we could not find
    // out" look the same on screen and mean opposite things.
    if (covered) covered.textContent = ''
    list.innerHTML = emptyState(
      ICON.alert,
      error instanceof ActivityUnavailableError ? 'Could not reach Stellar' : 'Activity unavailable',
      'The network did not answer. Your balance and wallet are unaffected.',
      true,
    )
    document.querySelector('#retry')?.addEventListener('click', () => {
      list.innerHTML = skeletonRows()
      void loadActivity(address)
    })
  }
}

/** Placeholder rows, so the list does not jump when the real ones land. */
function skeletonRows(count = 3): string {
  return Array.from({ length: count }, () => '<div class="movement skeleton" aria-hidden="true"></div>').join('')
}

/** An empty or failed list, given the same footprint as a full one. */
function emptyState(icon: string, title: string, detail: string, retry = false): string {
  return `
    <div class="state">
      <span class="state-icon">${icon}</span>
      <p class="state-title">${escapeHtml(title)}</p>
      <p class="state-detail">${escapeHtml(detail)}</p>
      ${retry ? '<button class="ghost" id="retry" type="button"><span>Try again</span></button>' : ''}
    </div>`
}

/**
 * How much history the list actually covers, said only when it is not all of it.
 *
 * The scan reaches back about a day and a half, less when the RPC cuts it
 * short, and that needs saying: otherwise an old tip that is out of range and
 * an old tip that never happened look the same.
 */
export function coverageNote(report: Pick<ActivityReport, 'source' | 'scannedBlocks' | 'partial'>): string {
  if (report.scannedBlocks === undefined) return ''

  const span = duration(Number(report.scannedBlocks) * LEDGER_SECONDS)
  return report.partial ? `last ~${span} · cut short` : `last ~${span}`
}

/** A row's age: measured when the source knew it, estimated when it did not. */
export function ageOf(movement: Movement, head?: bigint, now: Date = new Date()): string {
  if (movement.at) {
    const seconds = (now.getTime() - movement.at.getTime()) / 1_000
    return seconds < 90 ? 'just now' : `${duration(seconds)} ago`
  }

  if (head === undefined) return ''
  return ageFromBlocks(head > movement.blockNumber ? head - movement.blockNumber : 0n)
}

/**
 * Ledger distance as a rough age, for a row without a close time. Stellar's
 * RPC reports one with every event, so this is a fallback. Everywhere it
 * surfaces carries a `~`.
 */
export function ageFromBlocks(blocks: bigint): string {
  const seconds = Number(blocks) * LEDGER_SECONDS
  return seconds < 90 ? 'just now' : `~${duration(seconds)} ago`
}

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${Math.max(minutes, 1)}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

/**
 * What a row says it is.
 *
 * A transfer log carries an address and an amount, and an escrow address is
 * deliberately anonymous on-chain — so a tip only reads as a tip because this
 * wallet noted whose escrow it paid. Without that note it is still an honest
 * row, just an unnamed one; it is never guessed at from the address alone.
 */
export function movementLabel(
  movement: Movement,
  tip?: Pick<TipRecord, 'handle' | 'displayName'>,
): { title: string; sub: string } {
  if (movement.outgoing && tip) {
    return { title: `Tipped ${tip.handle}`, sub: tip.displayName || shorten(movement.counterparty) }
  }
  if (movement.outgoing && movement.counterparty === ESCROW_CONTRACT_ID) {
    return { title: 'Tipped a creator', sub: 'Tipee escrow' }
  }
  if (!movement.outgoing && movement.counterparty === ESCROW_CONTRACT_ID) {
    return { title: 'Claimed', sub: 'Tipee escrow' }
  }
  if (!movement.outgoing && movement.counterparty === RELAYER_ADDRESS) {
    return { title: 'Test USDC', sub: 'Tipee faucet' }
  }

  return {
    title: movement.outgoing ? 'Sent' : 'Received',
    sub: shorten(movement.counterparty),
  }
}

function movementRow(movement: Movement, head?: bigint, tip?: TipRecord): string {
  const age = ageOf(movement, head)
  const { title, sub } = movementLabel(movement, tip)
  const direction = movement.outgoing ? 'out' : 'in'

  return `
    <div class="movement">
      <span class="movement-icon ${direction}">${movement.outgoing ? ICON.up : ICON.down}</span>
      <span class="movement-copy">
        <span class="movement-title">${escapeHtml(title)}</span>
        <span class="movement-sub">${escapeHtml(sub)}${age ? ` · ${escapeHtml(age)}` : ''}</span>
      </span>
      <span class="movement-amount ${direction}">${movement.outgoing ? '−' : '+'}${formatUsdc(movement.amount)}</span>
    </div>`
}

/* Deposit ---------------------------------------------------------------- */

function renderDeposit(address: string): void {
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
      <p class="warn">Only send <strong>USDC on Stellar testnet</strong> to this address. It is a contract address (C…): no trustline needed, but some exchanges cannot send to one yet.</p>

      <div class="asset-card">
        <div class="asset-head">
          <span class="asset-symbol">USDC</span>
          ${networkMark()}
        </div>
        <div class="asset-body">
          <p class="address" id="address">${escapeHtml(address)}</p>
          <button class="ghost" id="copy" type="button">${ICON.copy}<span>Copy</span></button>
        </div>
      </div>
    </section>

    <p class="error" id="faucet-note"></p>
    <div class="bracket"><button class="primary" id="faucet" type="button">Get 10 test USDC</button></div>
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
  // at all. Tipee's relayer hands out real Circle testnet USDC, once per
  // wallet, straight to this contract address.
  const faucet = document.querySelector<HTMLButtonElement>('#faucet')
  faucet?.addEventListener('click', () => void takeFaucet(address, faucet))
}

async function takeFaucet(address: string, button: HTMLButtonElement): Promise<void> {
  const note = document.querySelector<HTMLElement>('#faucet-note')
  button.disabled = true
  button.textContent = 'Sending test USDC…'
  try {
    const sent = await requestFaucet(address)
    button.textContent = `${sent.amount} USDC received`
    if (note) note.textContent = ''
    window.setTimeout(() => renderHome(address), 1_200)
  } catch (error) {
    button.disabled = false
    button.textContent = 'Get 10 test USDC'
    if (note) note.textContent = error instanceof RelayError ? error.message : 'The faucet did not answer. Try again.'
  }
}

async function renderQr(frame: HTMLElement, address: string): Promise<void> {
  // Loaded on demand: the encoder is only needed on this one screen, so it does
  // not sit in the popup's start-up cost.
  const { qrSvg } = await import('./qr')
  frame.innerHTML = qrSvg(address, { logo: NETWORK_LOGO })
}

/* Send ------------------------------------------------------------------- */

/**
 * Sending, in the three steps every wallet uses: say where and how much, look
 * at what it will actually do, then authorise it.
 *
 * The middle step is the one this screen used to be missing. A single form that
 * takes an address, an amount and a PIN together asks somebody to authorise a
 * transaction whose total and outcome they have not seen. On Stellar the dry
 * run also catches the classic dead end: a `G…` account with no USDC
 * trustline, which would refuse the transfer.
 *
 * A tip does not go through this. It is a fixed, small amount to an escrow the
 * extension resolved rather than an address somebody typed, and the composer
 * already shows its fee — a dry run there would buy a second confirmation step
 * for the flow that most needs to stay quick.
 */
interface SendDraft {
  to: string
  amount: string
}

function renderWithdraw(address: string, draft: SendDraft = { to: '', amount: '' }): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    ${backBar('Send')}
    <section class="form">
      <label for="to">To address</label>
      <input id="to" type="text" autocomplete="off" spellcheck="false" placeholder="G… or C…" value="${escapeHtml(draft.to)}" />

      <div class="field-head">
        <label for="amount">Amount</label>
        <span class="field-note" id="available">Available —</span>
      </div>
      <div class="field-row">
        <input id="amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${escapeHtml(draft.amount)}" />
        <button class="ghost" id="max" type="button" disabled><span>Max</span></button>
      </div>

      <p class="error" id="send-error"></p>
      <div class="bracket"><button class="primary" id="review" type="button">Review</button></div>
    </section>
  `

  document.querySelector('#back')?.addEventListener('click', () => renderHome(address))
  document.querySelector('#review')?.addEventListener('click', () => {
    const next: SendDraft = {
      to: document.querySelector<HTMLInputElement>('#to')?.value.trim() ?? '',
      amount: document.querySelector<HTMLInputElement>('#amount')?.value.trim() ?? '',
    }
    const checked = validateSendDraft(next)
    if (!checked.ok) {
      const error = document.querySelector<HTMLElement>('#send-error')
      if (error) error.textContent = checked.message
      return
    }
    renderSendReview(address, next, checked.to, checked.amount)
  })

  void loadSendable(address)
}

/**
 * What can actually leave, which is the balance less the fee — never the
 * balance. Max fills in that figure rather than making the sender discover it
 * by having a transaction refused.
 */
async function loadSendable(owner: string): Promise<void> {
  const available = document.querySelector<HTMLElement>('#available')
  const max = document.querySelector<HTMLButtonElement>('#max')

  try {
    const balance = await usdcBalance(owner)
    if (available) available.textContent = `Available ${formatUsdc(balance)} USDC`
    if (balance === 0n) return

    // The relayer pays the fee, so everything held can leave.
    const sendable = maxSendable(balance, 0n)
    if (!max || sendable === 0n) return

    max.disabled = false
    max.addEventListener('click', () => {
      const amount = document.querySelector<HTMLInputElement>('#amount')
      if (amount) amount.value = formatUsdc(sendable)
    })
  } catch {
    // Max is a convenience. Losing it must not stop somebody typing a figure.
    if (available && available.textContent === 'Available —') available.textContent = ''
  }
}

/**
 * Address and amount, checked before anything is asked of the network.
 *
 * Stellar addresses carry a checksum in every character (StrKey), so a typo
 * is caught here rather than discovered as money sent nowhere. Both kinds are
 * accepted: an account (`G…`) and a contract (`C…`), such as another Tipee
 * wallet. A `G…` account still needs a USDC trustline, which the review's
 * dry run checks.
 */
export function validateSendDraft(
  draft: SendDraft,
): { ok: true; to: string; amount: bigint } | { ok: false; message: string } {
  const to = draft.to.trim()
  if (to === '') return { ok: false, message: 'Enter the address to send to.' }
  if (/^0x/i.test(to)) return { ok: false, message: 'That is an EVM address. Tipee sends on Stellar: G… or C….' }
  if (!isValidDestination(to)) {
    return { ok: false, message: 'That is not a valid Stellar address — check for a typo.' }
  }

  const amount = tryParseUsdc(draft.amount)
  if (amount === null) return { ok: false, message: 'Enter an amount in USDC, like 5.00.' }
  if (amount <= 0n) return { ok: false, message: 'Enter an amount to send.' }

  return { ok: true, to, amount }
}

function renderSendReview(
  address: string,
  draft: SendDraft,
  to: string,
  amount: bigint,
): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    ${backBar('Review')}
    <section class="review">
      <div class="review-head">
        <p class="review-amount">$${escapeHtml(formatUsdc(amount))}</p>
        <p class="review-sub">to ${escapeHtml(shorten(to))}</p>
      </div>
      <div class="summary" id="summary">
        <div class="movement skeleton" aria-hidden="true"></div>
        <div class="movement skeleton" aria-hidden="true"></div>
      </div>
      <p class="sim" id="sim"><span class="sim-icon">${ICON.clock}</span>Running this transfer against Stellar…</p>
    </section>
    <div class="bracket"><button class="primary" id="confirm" type="button" disabled>Confirm</button></div>
  `

  document.querySelector('#back')?.addEventListener('click', () => renderWithdraw(address, draft))
  void loadPreview(address, draft, to, amount)
}

async function loadPreview(
  address: string,
  draft: SendDraft,
  to: string,
  amount: bigint,
): Promise<void> {
  const summary = document.querySelector<HTMLElement>('#summary')
  const sim = document.querySelector<HTMLElement>('#sim')
  const confirm = document.querySelector<HTMLButtonElement>('#confirm')

  try {
    const preview = await previewSend({ from: address, to, amount })

    if (summary) summary.innerHTML = summaryRows(preview)
    if (sim) {
      sim.classList.add('ok')
      sim.innerHTML = `<span class="sim-icon">${ICON.check}</span>Checked on Stellar against live state — this transfer succeeds. Re-checked when you confirm.`
    }
    if (confirm) {
      confirm.disabled = false
      confirm.addEventListener('click', () => {
        if (confirm.disabled) return
        void confirmSend(address, draft, preview, confirm)
      })
    }
  } catch (error) {
    // Nothing is signable from here. The way out is back to the form, with the
    // reason on screen rather than a disabled button and no explanation.
    if (summary) summary.innerHTML = ''
    if (sim) {
      sim.classList.add('bad')
      sim.innerHTML = `<span class="sim-icon">${ICON.alert}</span>${escapeHtml(sendErrorMessage(error))}`
    }
    if (confirm) confirm.textContent = 'Edit'
    if (confirm) {
      confirm.disabled = false
      confirm.addEventListener('click', () => renderWithdraw(address, draft))
    }
  }
}

function summaryRows(preview: SendPreview): string {
  return `
    <div class="summary-row"><span>To</span><span class="mono" title="${escapeHtml(preview.to)}">${escapeHtml(
      shorten(preview.to),
    )}</span></div>
    <div class="summary-row"><span>Amount</span><span>${escapeHtml(formatUsdc(preview.amount))} USDC</span></div>
    <div class="summary-row"><span>Network fee</span><span>Paid by Tipee</span></div>
    <div class="summary-row total"><span>Total</span><span>${escapeHtml(formatUsdc(preview.total))} USDC</span></div>
    <div class="summary-row"><span>Balance after</span><span>${escapeHtml(formatUsdc(preview.balanceAfter))} USDC</span></div>`
}

/**
 * Confirm is the signature.
 *
 * An open wallet signs here and goes straight to the receipt; one that is
 * locked — because the browser has just started, the session went idle, or the
 * owner asked for a PIN on every transaction — steps through the PIN screen
 * first. Either way the total being authorised is the one already on screen.
 */
async function confirmSend(
  address: string,
  draft: SendDraft,
  preview: SendPreview,
  button: HTMLButtonElement,
): Promise<void> {
  const mnemonic = await sessionMnemonic()
  if (!mnemonic) return renderSendConfirm(address, draft, preview)

  button.disabled = true
  button.textContent = 'Sending…'
  await performSend(address, preview, mnemonic, button, 'Confirm')
}

/**
 * The PIN screen, for a wallet that is not open.
 *
 * It sits after the numbers, never beside them: a PIN typed next to an amount
 * field is part of filling in a form, and this is the last thing before money
 * moves.
 */
function renderSendConfirm(address: string, draft: SendDraft, preview: SendPreview): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    ${backBar('Confirm')}
    <section class="form">
      <div class="review-head">
        <p class="review-amount">$${escapeHtml(formatUsdc(preview.amount))}</p>
        <p class="review-sub">to ${escapeHtml(shorten(preview.to))} · no fee to you</p>
      </div>
      <label for="pin">PIN</label>
      <input id="pin" type="password" inputmode="numeric" maxlength="32" autocomplete="off" />
      <p class="error" id="send-error"></p>
      <div class="bracket"><button class="primary" id="send" type="button">Send</button></div>
    </section>
  `

  document.querySelector('#back')?.addEventListener('click', () => renderSendReview(address, draft, preview.to, preview.amount))

  const button = document.querySelector<HTMLButtonElement>('#send')
  button?.addEventListener('click', () => {
    if (button.disabled) return
    void submitSend(address, draft, preview, button)
  })
}

async function submitSend(
  owner: string,
  draft: SendDraft,
  preview: SendPreview,
  button: HTMLButtonElement,
): Promise<void> {
  const error = document.querySelector<HTMLElement>('#send-error')
  const say = (message: string): void => {
    if (error) error.textContent = message
  }

  const pin = document.querySelector<HTMLInputElement>('#pin')?.value ?? ''
  if (pin === '') return say('Enter your PIN.')

  // Held down for the whole send: a second click is a second transaction.
  button.disabled = true
  button.textContent = 'Sending…'
  say('')

  let mnemonic: string
  try {
    // Unlocking here also opens the wallet for the rest of the session, unless
    // the owner asked for a PIN on every transaction.
    mnemonic = await unlock(pin)
  } catch (err) {
    button.disabled = false
    button.textContent = 'Send'
    return say(unlockMessage(err))
  }

  await performSend(owner, preview, mnemonic, button, 'Send')
}

/**
 * Signs and broadcasts, whichever screen got here.
 *
 * The preview is taken again first. The one on screen was built before the
 * confirmation — seconds ago, but a balance can move in that time, and this is
 * the same rule the tip path follows in the service worker.
 */
async function performSend(
  owner: string,
  preview: SendPreview,
  mnemonic: string,
  button: HTMLButtonElement,
  restoreLabel: string,
): Promise<void> {
  const error = document.querySelector<HTMLElement>('#send-error')

  try {
    const fresh = await previewSend({ from: owner, to: preview.to, amount: preview.amount })
    const txHash = await relay(await authorise(fresh.call, keypairFromMnemonic(mnemonic)))

    renderSendResult(owner, fresh, txHash)
  } catch (err) {
    button.disabled = false
    button.textContent = restoreLabel
    const message = sendErrorMessage(err)
    if (error) error.textContent = message
    else {
      // The review screen has no error line; the check line carries it.
      const sim = document.querySelector<HTMLElement>('#sim')
      if (sim) {
        sim.classList.remove('ok')
        sim.classList.add('bad')
        sim.innerHTML = `<span class="sim-icon">${ICON.alert}</span>${escapeHtml(message)}`
      }
    }
  }
}

function renderSendResult(address: string, preview: SendPreview, txHash: string): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    ${backBar('Sent')}
    <section class="review">
      <div class="state">
        <span class="state-icon ok">${ICON.check}</span>
        <p class="state-title">${escapeHtml(formatUsdc(preview.amount))} USDC sent</p>
        <p class="state-detail">to ${escapeHtml(shorten(preview.to))}</p>
        <a class="ghost" id="receipt" target="_blank" rel="noreferrer noopener"><span>View on Stellar Expert</span></a>
      </div>
    </section>
    <div class="bracket"><button class="primary" id="done" type="button">Done</button></div>
  `

  const receipt = document.querySelector<HTMLAnchorElement>('#receipt')
  if (receipt) receipt.href = explorerTxUrl(encodeURIComponent(txHash))

  document.querySelector('#back')?.addEventListener('click', () => renderHome(address))
  document.querySelector('#done')?.addEventListener('click', () => renderHome(address))
}

/** Failures, said in terms of what the sender can do about them. */
export function sendErrorMessage(error: unknown): string {
  if (error instanceof InsufficientFundsError) {
    return `${error.message} Short by ${formatUsdc(error.shortBy)} USDC.`
  }
  if (error instanceof SendUnavailableError) return error.message
  if (error instanceof RelayError) return error.message
  if (error instanceof Error && error.name === 'SimulationError') return error.message
  return 'The transfer could not be sent.'
}

/* Settings --------------------------------------------------------------- */

function renderSettings(address: string): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    ${backBar('Settings')}
    <section class="form">
      <p class="section-label">Wallet address</p>
      <p class="address">${escapeHtml(address)}</p>

      <p class="section-label">Tipee service</p>
      <p class="muted-line">Where creator escrow wallets are looked up. Without it, tips have nowhere to go.</p>
      <div class="field-row">
        <input id="api-base" type="text" autocomplete="off" spellcheck="false" placeholder="https://…" />
        <button class="ghost" id="save-api" type="button"><span>Save</span></button>
      </div>

      <p class="section-label">Ask for the PIN</p>
      <div class="choices" id="policy"></div>
      <button class="ghost" id="lock-now" type="button"><span>Lock wallet now</span></button>

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
  document.querySelector('#lock-now')?.addEventListener('click', () => void lock().then(() => renderLocked(address)))

  void renderPolicyChoices()
  void fillApiBase()

  document.querySelector('#save-api')?.addEventListener('click', () => {
    const field = document.querySelector<HTMLInputElement>('#api-base')
    const label = document.querySelector<HTMLElement>('#save-api span')
    if (!field) return

    void setApiBase(field.value).then(() => {
      if (!label) return
      label.textContent = 'Saved'
      window.setTimeout(() => (label.textContent = 'Save'), 1_500)
    })
  })
}

async function fillApiBase(): Promise<void> {
  const field = document.querySelector<HTMLInputElement>('#api-base')
  if (field) field.value = (await apiBase()) ?? ''
}

/** The unlock rule, as three plain statements of what the wallet will do. */
async function renderPolicyChoices(): Promise<void> {
  const host = document.querySelector<HTMLElement>('#policy')
  if (!host) return

  const current = await unlockPolicy()
  host.innerHTML = UNLOCK_POLICIES.map(
    (option) => `
      <label class="choice">
        <input type="radio" name="policy" value="${option.value}"${option.value === current ? ' checked' : ''} />
        <span class="choice-copy">
          <span class="choice-label">${escapeHtml(option.label)}</span>
          <span class="choice-detail">${escapeHtml(option.detail)}</span>
        </span>
      </label>`,
  ).join('')

  host.querySelectorAll<HTMLInputElement>('input[name="policy"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) void setUnlockPolicy(input.value as UnlockPolicy)
    })
  })
}

async function revealPhrase(address: string): Promise<void> {
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

function renderSeedReveal(address: string, mnemonic: string): void {
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
  continueButton?.addEventListener('click', () => renderSeedCheck(address, mnemonic))
}

/**
 * Three words back, before the wallet is ever used.
 *
 * A checkbox records an intention; it does not establish that the phrase was
 * written down, or written down correctly. This wallet is the only copy of the
 * key — nothing is escrowed and no reset exists — so a phrase that was never
 * really captured is a total loss the owner discovers months later, on the one
 * day they need it. Asking here costs seconds while the words are still on
 * screen behind a back link.
 */
function renderSeedCheck(address: string, mnemonic: string): void {
  const host = app()
  if (!host) return

  const words = seedWords(mnemonic)
  const indexes = pickCheckIndexes(words.length)

  host.innerHTML = `
    ${backBar('Confirm your backup')}
    <section class="form">
      <p class="muted-line">Type these words from the phrase you just wrote down.</p>
      ${indexes
        .map(
          (index, slot) => `
      <label for="check-${slot}">Word ${index + 1}</label>
      <input id="check-${slot}" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" />`,
        )
        .join('')}
      <p class="error" id="check-error"></p>
      <div class="bracket"><button class="primary" id="check-seed" type="button">Confirm</button></div>
      <button class="ghost" id="show-phrase" type="button">Show the phrase again</button>
    </section>
  `

  const showAgain = (): void => renderSeedReveal(address, mnemonic)
  document.querySelector('#back')?.addEventListener('click', showAgain)
  document.querySelector('#show-phrase')?.addEventListener('click', showAgain)

  document.querySelector('#check-seed')?.addEventListener('click', () => {
    const answers = indexes.map((index, slot) => ({
      index,
      word: document.querySelector<HTMLInputElement>(`#check-${slot}`)?.value ?? '',
    }))

    if (!seedWordsMatch(mnemonic, answers)) {
      const error = document.querySelector<HTMLElement>('#check-error')
      if (error) error.textContent = 'Those do not match. Check the phrase you wrote down.'
      return
    }

    renderWalletSetup(address, mnemonic)
  })
}

/**
 * The last step of onboarding: put the wallet on Stellar and give it something
 * to tip with.
 *
 * The wallet's address was known from the moment the phrase was made; this is
 * when Tipee's relayer deploys the contract at it, and the faucet sends test
 * USDC. Neither costs the gifter anything, and neither needs XLM. Both are safe
 * to retry, and skipping leaves a wallet that sets itself up on the next try.
 */
function renderWalletSetup(address: string, mnemonic: string): void {
  const host = app()
  if (!host) return

  host.innerHTML = `
    <header class="bar"><span class="wordmark">tipee</span><span class="bar-actions">${networkBadge()}</span></header>
    <section class="form">
      <div class="state">
        <span class="state-icon">${ICON.clock}</span>
        <p class="state-title" id="setup-title">Setting up your wallet</p>
        <p class="state-detail" id="setup-detail">Deploying your wallet contract on Stellar. No XLM, no fees — Tipee covers them.</p>
      </div>
      <p class="error" id="setup-error"></p>
      <div class="bracket"><button class="primary" id="setup-retry" type="button" hidden>Try again</button></div>
      <button class="ghost" id="setup-skip" type="button" hidden><span>Skip for now</span></button>
    </section>
  `

  const title = document.querySelector<HTMLElement>('#setup-title')
  const detail = document.querySelector<HTMLElement>('#setup-detail')
  const error = document.querySelector<HTMLElement>('#setup-error')
  const retry = document.querySelector<HTMLButtonElement>('#setup-retry')
  const skip = document.querySelector<HTMLButtonElement>('#setup-skip')
  retry?.addEventListener('click', () => renderWalletSetup(address, mnemonic))
  skip?.addEventListener('click', () => renderHome(address))

  void (async () => {
    try {
      await deployWallet(keypairFromMnemonic(mnemonic))
      if (title) title.textContent = 'Getting you test USDC'
      if (detail) detail.textContent = 'Real Circle USDC on Stellar testnet, straight to your wallet.'
      try {
        await requestFaucet(address)
      } catch {
        // A wallet without faucet money still works; Deposit offers it again.
      }
      renderHome(address)
    } catch (err) {
      if (error) error.textContent = err instanceof RelayError ? err.message : 'Could not reach Stellar.'
      if (retry) retry.hidden = false
      if (skip) skip.hidden = false
    }
  })()
}

/** The phrase as words, however it was spaced. */
function seedWords(mnemonic: string): string[] {
  return mnemonic.trim().split(/\s+/)
}

/**
 * Which positions to ask for. Drawn fresh each time so a retry after a failed
 * check asks a different trio — otherwise the same three words could be copied
 * off the reveal screen and typed back, which tests nothing.
 */
export function pickCheckIndexes(total: number, count = 3, random = randomFraction): number[] {
  const pool = Array.from({ length: total }, (_, index) => index)
  const picked: number[] = []

  while (picked.length < Math.min(count, total)) {
    picked.push(...pool.splice(Math.floor(random() * pool.length), 1))
  }

  return picked.sort((left, right) => left - right)
}

function randomFraction(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return (buffer[0] ?? 0) / 2 ** 32
}

/**
 * Compares answers the way a person writes them down: trimmed and any case.
 * BIP-39 words are lowercase ASCII, so nothing legitimate is lost by folding
 * case, and rejecting `Abandon` would only teach the owner to distrust a backup
 * that is in fact correct.
 */
export function seedWordsMatch(
  mnemonic: string,
  answers: ReadonlyArray<{ index: number; word: string }>,
): boolean {
  const words = seedWords(mnemonic)
  if (answers.length === 0) return false

  return answers.every(({ index, word }) => {
    const expected = words[index]
    return expected !== undefined && word.trim().toLowerCase() === expected
  })
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

/** `CABC…WXYZ` — enough of both ends to recognise, per idea.md §3.1.3. */
export function shorten(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)
}

void boot()
