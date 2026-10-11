import {
  explorerTxUrl,
  MEMO_MAX_BYTES,
  MIN_TIP,
  TIP_PRESETS,
  fitMemo,
  formatUsdc,
  memoByteLength,
  tryParseUsdc,
  validateTip,
} from '@tipee/shared'
import type {
  ComposerContext,
  ExtensionMessage,
  ScrapedCreator,
  SendTipOutcome,
} from '@tipee/shared'
import './styles.css'

/**
 * What the worker knows about this tip: the balance it would come out of, the
 * fee it would cost, and where it would land. Null until the reply arrives, and
 * the composer stays usable meanwhile — the checks it can make alone still run,
 * and the worker re-checks everything before it signs regardless.
 */
let context: ComposerContext | null = null

/** Where a confirmed tip can be looked at. */

export function render(creator: ScrapedCreator | null): void {
  // Looked up per call rather than held from module scope: a reference captured
  // at load time goes stale the moment anything replaces the host element.
  const app = document.querySelector<HTMLElement>('#app')
  if (!app) return

  const name = creator?.displayName ?? 'YouTube creator'
  const handle = creator?.handle ?? '@unknown'
  const initial = name.trim().slice(0, 1).toUpperCase() || '?'

  document.body.classList.remove('is-signing')
  app.innerHTML = `
    <header class="strip">
      <span class="wordmark">tipee</span>
    </header>

    <section class="hero">
      <div class="avatar" id="avatar"><span class="initials">${escapeHtml(initial)}</span></div>
      <span class="name">${escapeHtml(name)}</span>
      <span class="handle">${escapeHtml(handle)}</span>
    </section>

    <h1 class="headline">Send a little <em>thanks</em>.</h1>

    <section class="entry">
    <div class="field">
      <input id="amount" inputmode="decimal" aria-label="Tip amount in USDC"
             aria-describedby="amount-note" value="${formatUsdc(TIP_PRESETS[0] ?? MIN_TIP)}" />
      <span class="denom" id="amount-note" aria-live="polite">USDC</span>
    </div>

    <div class="presets">${TIP_PRESETS.map(presetChip).join('')}</div>
    </section>

    <div class="memo">
      <div class="memo-head">
        <label for="memo">Leave a note (optional)</label>
        <span id="memo-count" aria-live="polite"></span>
      </div>
      <textarea id="memo" rows="3" autocomplete="off" placeholder="Say thanks…"></textarea>
    </div>

    <div id="footer">
      <p class="context-note" id="context-note" aria-live="polite"></p>
      <div class="bracket"><button class="primary" id="send" type="button">Continue</button></div>
    </div>
  `

  mountAvatar(creator)
  wireAmount()
}

/** Sits under the amount field whenever the amount is fine. */
const IDLE_NOTE = `min ${formatUsdc(MIN_TIP)}`

function presetChip(preset: bigint): string {
  // The value carries full precision; the label drops the cents so the chip
  // reads as the round number it is.
  return `<button class="preset" type="button" aria-pressed="false" data-amount="${formatUsdc(preset)}">$${formatUsdc(preset, { minDecimals: 0 })}</button>`
}

/**
 * Replaces the initials with the real picture, but only once it has loaded.
 *
 * Swapping on `load` rather than rendering an `<img>` up front means a dead or
 * blocked URL leaves the initials standing instead of a broken-image frame —
 * and those URLs go stale often, since they are whatever the watch page had
 * cached at the moment we scraped it.
 */
function mountAvatar(creator: ScrapedCreator | null): void {
  const slot = document.querySelector<HTMLElement>('#avatar')
  const url = safeAvatarUrl(creator?.avatarUrl ?? null)
  if (!slot || !url) return

  const image = new Image()
  image.alt = ''
  image.referrerPolicy = 'no-referrer'
  image.addEventListener('load', () => slot.replaceChildren(image))
  // Assigned as a property, never written into the markup above: this string
  // arrives in a query parameter, and the HTML parser must not see it.
  image.src = url
}

/**
 * The avatar URL, if it is an ordinary https image address.
 *
 * It reaches the composer through its own query string, which makes it
 * attacker-shaped the moment a channel can influence what we scraped. Allowing
 * exactly one scheme is what keeps `javascript:` and `data:` out; a blocklist
 * here would be a list of the tricks someone already thought of.
 */
export function safeAvatarUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? enlarge(url) : null
  } catch {
    return null
  }
}

/**
 * YouTube hands out the avatar at whatever size the watch page needed, encoded
 * in the path as `=s48-c-k…`. Drawn at 64px on a retina panel that is visibly
 * soft, and the size segment is the only knob involved — ask for 176 instead.
 */
function enlarge(url: URL): string {
  return url.href.replace(/=s\d+/, '=s176')
}

function wireAmount(): void {
  const input = document.querySelector<HTMLInputElement>('#amount')
  const send = document.querySelector<HTMLButtonElement>('#send')
  const note = document.querySelector<HTMLElement>('#amount-note')
  const presets = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-amount]'))
  if (!input || !send || !note) return

  const memo = wireMemo(() => void refreshContext())

  const sync = (): void => {
    const amount = tryParseUsdc(input.value)
    const problem = amountProblem(amount, context)

    // The unit caption doubles as the error line. Giving the message its own
    // reserved row left a visible hole under the chips whenever the amount was
    // fine, which is almost always; this way the line is never empty and the
    // button below it never moves.
    note.textContent = problem ?? IDLE_NOTE
    note.classList.toggle('is-error', problem !== null)
    input.setAttribute('aria-invalid', String(problem !== null))

    // A problem the gifter cannot fix by typing — no wallet, no backend, no
    // balance — blocks the tip too, but belongs beside the action rather than
    // under the amount field, which is not what is wrong.
    const blocker = context?.problem ?? null
    const contextNote = document.querySelector<HTMLElement>('#context-note')
    if (contextNote) contextNote.textContent = blocker ?? ''
    send.disabled = problem !== null || blocker !== null

    const formatted = amount !== null && !problem ? formatUsdc(amount) : null
    send.textContent = formatted ? `Continue · ${formatted} USDC` : 'Continue'

    for (const preset of presets) {
      const matches = formatted !== null && preset.dataset.amount === formatted
      preset.setAttribute('aria-pressed', String(matches))
    }
  }

  for (const preset of presets) {
    preset.addEventListener('click', () => {
      input.value = preset.dataset.amount ?? ''
      sync()
    })
  }

  // Typing has to drive this too. Previously only the presets updated the
  // button, so a typed 5.00 still offered to send 1.00.
  input.addEventListener('input', sync)

  send.addEventListener('click', () => {
    const amount = tryParseUsdc(input.value)
    if (amount === null || amountProblem(amount, context) !== null) return
    askForPin(formatUsdc(amount), memo().trim())
  })

  // The estimate depends on the shape of the call, and a memo turns a bare
  // transfer into a wrapped one — so the question is re-asked when the memo
  // appears or disappears, not on every keystroke inside it.
  const refreshContext = async (): Promise<void> => {
    await loadContext(input.value, memo().trim())
    sync()
  }

  sync()
  void refreshContext()
}

async function loadContext(amount: string, memo: string): Promise<void> {
  const request: ExtensionMessage = {
    type: 'GET_COMPOSER_CONTEXT',
    nonce: crypto.randomUUID(),
    amount,
    memo,
  }
  try {
    context = ((await chrome.runtime.sendMessage(request)) as ComposerContext | undefined) ?? null
  } catch {
    context = null
  }
}

/**
 * Swaps the footer for a PIN entry.
 *
 * A masked input is safe here in a way it would not be on the watch page: this
 * is an extension-origin document, so no script on YouTube can reach into it,
 * observe its keystrokes, or read its DOM (idea.md §3.1.3). The editable fields
 * are hidden while it is up, both to make room and because the amount and note
 * are settled by this point — what is being confirmed should not still move.
 */
function askForPin(amount: string, memo: string): void {
  const footer = document.querySelector<HTMLElement>('#footer')
  if (!footer) return
  document.body.classList.add('is-signing')

  // A wallet unlocked for this session signs on confirmation. Showing a PIN box
  // that nothing checks would teach people the box means nothing.
  const needsPin = context?.needsPin !== false

  footer.innerHTML = `
    <p class="signing-summary">${escapeHtml(amount)} USDC${memo ? ' · with a note' : ''}</p>
    ${
      needsPin
        ? `<label class="pin-label" for="pin">Enter your PIN to sign</label>
    <input id="pin" type="password" inputmode="numeric" autocomplete="off" />`
        : '<p class="pin-label">Confirm to send</p>'
    }
    <p class="error" id="pin-error"></p>
    <div class="bracket"><button class="primary" id="confirm" type="button">Send ${escapeHtml(amount)} USDC</button></div>
    <button class="link" id="cancel" type="button">Back</button>
  `

  const pin = document.querySelector<HTMLInputElement>('#pin')
  const confirm = document.querySelector<HTMLButtonElement>('#confirm')
  const error = document.querySelector<HTMLElement>('#pin-error')

  document.querySelector<HTMLButtonElement>('#cancel')?.addEventListener('click', () => {
    render(creatorFromQuery())
  })

  const submit = (): void => {
    if (!confirm) return
    if (needsPin) {
      if (!pin) return
      if (pin.value === '') {
        if (error) error.textContent = 'Enter your PIN.'
        return
      }
    }
    void signTip(amount, memo, pin?.value ?? '')
  }

  confirm?.addEventListener('click', submit)
  pin?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit()
  })
  pin?.focus()
}

async function signTip(amount: string, memo: string, pin: string): Promise<void> {
  const footer = document.querySelector<HTMLElement>('#footer')
  if (!footer) return

  footer.innerHTML = '<p class="signing-summary">Sending…</p>'

  const message: ExtensionMessage = {
    type: 'SEND_TIP',
    nonce: crypto.randomUUID(),
    amount,
    pin,
    memo,
  }

  let outcome: SendTipOutcome
  try {
    outcome = ((await chrome.runtime.sendMessage(message)) as SendTipOutcome | undefined) ?? {
      ok: false,
      message: 'The tip could not be sent.',
    }
  } catch {
    outcome = { ok: false, message: 'The tip could not be sent.' }
  }

  showOutcome(outcome, amount, memo)
}

function showOutcome(outcome: SendTipOutcome, amount: string, memo: string): void {
  const footer = document.querySelector<HTMLElement>('#footer')
  if (!footer) return

  if (outcome.ok) {
    footer.innerHTML = `
      <p class="signing-summary sent">Sent ${escapeHtml(amount)} USDC</p>
      <a class="link" id="receipt" target="_blank" rel="noreferrer noopener">View on Stellar Expert</a>
      <div class="bracket"><button class="primary" id="done" type="button">Close</button></div>
    `
    // Set as a property, so a hash from outside this window is never markup.
    const receipt = document.querySelector<HTMLAnchorElement>('#receipt')
    if (receipt) receipt.href = explorerTxUrl(encodeURIComponent(outcome.txHash))
    document.querySelector<HTMLButtonElement>('#done')?.addEventListener('click', () => window.close())
    return
  }

  footer.innerHTML = `
    <p class="error" id="send-error"></p>
    <div class="bracket"><button class="primary" id="retry" type="button">Try again</button></div>
    <button class="link" id="cancel" type="button">Back</button>
  `
  // textContent, not markup: this string can carry a revert reason from chain.
  const error = document.querySelector<HTMLElement>('#send-error')
  if (error) error.textContent = outcome.message

  document.querySelector<HTMLButtonElement>('#retry')?.addEventListener('click', () => askForPin(amount, memo))
  document.querySelector<HTMLButtonElement>('#cancel')?.addEventListener('click', () => {
    render(creatorFromQuery())
  })
}

/**
 * Wires the memo field to its byte counter and returns a reader for its value.
 *
 * The cap is enforced here rather than with `maxlength`, which counts UTF-16
 * code units: under that attribute an emoji spends one of its allowance and
 * four of its budget, so a "full" field could still be triple the byte limit.
 */
function wireMemo(onPresenceChange: () => void): () => string {
  const field = document.querySelector<HTMLTextAreaElement>('#memo')
  const counter = document.querySelector<HTMLElement>('#memo-count')
  if (!field || !counter) return () => ''

  let hadMemo = false
  const sync = (): void => {
    const fitted = fitMemo(field.value)
    // Only write back when something was actually dropped; assigning on every
    // keystroke would move the caret to the end mid-word.
    if (fitted !== field.value) field.value = fitted

    const used = memoByteLength(fitted)
    counter.textContent = `${used}/${MEMO_MAX_BYTES}`
    counter.classList.toggle('is-full', used >= MEMO_MAX_BYTES)

    const hasMemo = fitted.trim() !== ''
    if (hasMemo !== hadMemo) {
      hadMemo = hasMemo
      onPresenceChange()
    }
  }

  field.addEventListener('input', sync)
  sync()
  return () => field.value
}

/**
 * Why this amount cannot be sent, or null.
 *
 * The shape of the field is checked first, because it needs nothing external.
 * The rest — balance, and gas headroom on top of it — needs the worker's reply,
 * so it is skipped while that is missing rather than guessed at: refusing an
 * amount for a reason we cannot establish is worse than letting the signing
 * step refuse it, and the worker re-checks both before it broadcasts.
 *
 * The fee is zero to the gifter on Stellar — Tipee's relayer pays it — but it
 * stays part of the check, so the composer cannot drift from `validateTip`.
 */
export function amountProblem(
  amount: bigint | null,
  tipContext: ComposerContext | null = null,
): string | null {
  if (amount === null || amount <= 0n) return 'Enter an amount to tip.'
  if (amount < MIN_TIP) return `The minimum tip is ${formatUsdc(MIN_TIP)} USDC.`

  const balance = tipContext?.balance == null ? null : tryParseUsdc(tipContext.balance)
  const gasCost = tipContext?.gasCost == null ? null : tryParseUsdc(tipContext.gasCost)
  if (balance === null || gasCost === null) return null

  const check = validateTip({ amount, balance, gasCost, minimum: MIN_TIP })
  return check.ok ? null : check.message
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)
}

function creatorFromQuery(): ScrapedCreator | null {
  const raw = new URLSearchParams(window.location.search).get('creator')
  if (!raw) return null
  try {
    return JSON.parse(raw) as ScrapedCreator
  } catch {
    return null
  }
}

render(creatorFromQuery())
