// @vitest-environment happy-dom
import { MEMO_MAX_BYTES, MIN_TIP, TIP_PRESETS, formatUsdc, memoByteLength } from '@tipee/shared'
import type { ComposerContext, ScrapedCreator } from '@tipee/shared'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMessage = vi.fn()

const CREATOR: ScrapedCreator = {
  handle: '@romeoptt',
  displayName: 'Romeoptt',
  avatarUrl: 'https://yt3.googleusercontent.com/abc=s48-c-k-c0x00ffffff-no-rj',
  videoId: 'aaaaaaaaaaa',
}

let render: (creator: ScrapedCreator | null) => void
let safeAvatarUrl: (value: string | null | undefined) => string | null
let amountProblem: (amount: bigint | null, context?: ComposerContext | null) => string | null

beforeAll(async () => {
  Object.assign(globalThis, { chrome: { runtime: { sendMessage } } })
  document.body.innerHTML = '<main id="app"></main>'
  const composer = await import('./main')
  render = composer.render
  safeAvatarUrl = composer.safeAvatarUrl
  amountProblem = composer.amountProblem
})

beforeEach(() => {
  sendMessage.mockReset()
  document.body.innerHTML = '<main id="app"></main>'
})

const amountField = () => document.querySelector<HTMLInputElement>('#amount')
const sendButton = () => document.querySelector<HTMLButtonElement>('#send')
const noteLine = () => document.querySelector<HTMLElement>('#amount-note')
const memoField = () => document.querySelector<HTMLTextAreaElement>('#memo')
const memoCount = () => document.querySelector<HTMLElement>('#memo-count')
const pinField = () => document.querySelector<HTMLInputElement>('#pin')
const confirmButton = () => document.querySelector<HTMLButtonElement>('#confirm')

/** Only the tips. The composer also asks the worker for context on render. */
function tipsSent(): Array<Record<string, string>> {
  return sendMessage.mock.calls
    .map((call) => call[0] as Record<string, string>)
    .filter((message) => message?.type === 'SEND_TIP')
}

/** Walks the amount through the PIN step the way a gifter would. */
function sendWithPin(amount: string, pin = '123456'): void {
  type(amount)
  sendButton()?.click()
  const field = pinField()
  if (!field) throw new Error('the PIN step did not open')
  field.value = pin
  confirmButton()?.click()
}

function contextOf(balance: string | null, gasCost: string | null, needsPin = true): ComposerContext {
  return { walletAddress: '0xabc', balance, gasCost, recipient: '0xdef', problem: null, needsPin }
}

function typeMemo(value: string): void {
  const field = memoField()
  if (!field) throw new Error('no memo field')
  field.value = value
  field.dispatchEvent(new Event('input'))
}

function type(value: string): void {
  const input = amountField()
  if (!input) throw new Error('no amount field')
  input.value = value
  input.dispatchEvent(new Event('input'))
}

describe('avatar URLs', () => {
  it('accepts https and asks for a size worth rendering', () => {
    // The watch page hands over whatever thumbnail it had cached, usually 48px.
    expect(safeAvatarUrl(CREATOR.avatarUrl)).toBe(
      'https://yt3.googleusercontent.com/abc=s176-c-k-c0x00ffffff-no-rj',
    )
  })

  it('refuses everything that is not https', () => {
    // This value arrives in a query string, so the scheme is the whole defence.
    expect(safeAvatarUrl('javascript:alert(1)')).toBeNull()
    expect(safeAvatarUrl('data:image/svg+xml,<svg onload="alert(1)"/>')).toBeNull()
    expect(safeAvatarUrl('http://yt3.googleusercontent.com/abc')).toBeNull()
    expect(safeAvatarUrl('not a url')).toBeNull()
    expect(safeAvatarUrl(null)).toBeNull()
  })
})

describe('amount validation', () => {
  it('names the two problems the field can settle on its own', () => {
    expect(amountProblem(null)).toBe('Enter an amount to tip.')
    expect(amountProblem(0n)).toBe('Enter an amount to tip.')
    expect(amountProblem(MIN_TIP - 1n)).toBe(`The minimum tip is ${formatUsdc(MIN_TIP)} USDC.`)
  })

  it('passes anything at or above the minimum', () => {
    expect(amountProblem(MIN_TIP)).toBeNull()
    expect(amountProblem(TIP_PRESETS[0] ?? MIN_TIP)).toBeNull()
  })
})

describe('headroom for gas', () => {
  it('leaves the balance alone until the worker has answered', () => {
    // Refusing an amount for a reason we cannot establish is worse than
    // letting the signing step refuse it.
    expect(amountProblem(5_000_000n, null)).toBeNull()
    expect(amountProblem(5_000_000n, contextOf(null, null))).toBeNull()
  })

  it('refuses a tip the balance cannot cover', () => {
    expect(amountProblem(5_000_000n, contextOf('1.00', '0.01'))).toBe(
      'That is more than your balance.',
    )
  })

  it('refuses a tip that leaves nothing for the fee', () => {
    // The Arc case: gas is USDC out of the same balance, so a wallet holding
    // exactly the tip cannot send it. A plain amount <= balance check passes
    // this straight through to an on-chain revert.
    expect(amountProblem(1_000_000n, contextOf('1.00', '0.01'))).toBe(
      'Not enough left to cover the network fee.',
    )
  })

  it('allows a tip with room for both', () => {
    expect(amountProblem(1_000_000n, contextOf('5.00', '0.01'))).toBeNull()
  })
})

describe('how a tip ends', () => {
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('links a confirmed tip to the explorer', async () => {
    render(CREATOR)
    sendMessage.mockClear()
    sendMessage.mockResolvedValue({ ok: true, txHash: '0xabc123' })
    sendWithPin('2')
    await settle()

    const receipt = document.querySelector<HTMLAnchorElement>('#receipt')
    expect(receipt?.getAttribute('href')).toBe('https://testnet.arcscan.app/tx/0xabc123')
    expect(document.querySelector('.signing-summary')?.textContent).toContain('Sent 2.00 USDC')
  })

  it('shows why a tip failed, as text rather than markup', async () => {
    render(CREATOR)
    sendMessage.mockClear()
    sendMessage.mockResolvedValue({ ok: false, message: '<b>reverted</b>: no allowance' })
    sendWithPin('2')
    await settle()

    // A revert reason comes off the chain and is not ours to trust.
    const error = document.querySelector('#send-error')
    expect(error?.textContent).toBe('<b>reverted</b>: no allowance')
    expect(error?.querySelector('b')).toBeNull()
    expect(document.querySelector('#retry')).not.toBeNull()
  })

  it('treats a worker that answers nothing as a failure, not a success', async () => {
    render(CREATOR)
    sendMessage.mockClear()
    sendMessage.mockResolvedValue(undefined)
    sendWithPin('2')
    await settle()

    expect(document.querySelector('#receipt')).toBeNull()
    expect(document.querySelector('#send-error')?.textContent).toBe('The tip could not be sent.')
  })
})

describe('composer', () => {
  it('shows the creator, their handle, and the presets from the shared list', () => {
    render(CREATOR)

    expect(document.querySelector('.name')?.textContent).toBe('Romeoptt')
    expect(document.querySelector('.handle')?.textContent).toBe('@romeoptt')

    const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-amount]'))
    expect(chips.map((chip) => chip.dataset.amount)).toEqual(
      TIP_PRESETS.map((preset) => formatUsdc(preset)),
    )
  })

  it('starts on initials, which stand in until a picture actually loads', () => {
    render(CREATOR)

    // Rendering the <img> straight away would show a broken frame for the
    // avatar URLs that have gone stale since we scraped them.
    expect(document.querySelector('#avatar .initials')?.textContent).toBe('R')
    expect(document.querySelector('#avatar img')).toBeNull()
  })

  it('follows what is typed, not just what is clicked', () => {
    render(CREATOR)
    type('7.25')

    // Only the preset chips used to update this, so a typed amount and the
    // amount the button offered to send could disagree.
    expect(sendButton()?.textContent).toBe('Continue · 7.25 USDC')
  })

  it('refuses a tip under the minimum, in the caption and on the button', () => {
    render(CREATOR)
    type('0.10')

    expect(noteLine()?.textContent).toBe(`The minimum tip is ${formatUsdc(MIN_TIP)} USDC.`)
    expect(amountField()?.getAttribute('aria-invalid')).toBe('true')
    expect(sendButton()?.disabled).toBe(true)
  })

  it('puts the caption back to the minimum once the amount is good again', () => {
    render(CREATOR)
    type('0.10')
    type('2')

    expect(noteLine()?.textContent).toBe(`min ${formatUsdc(MIN_TIP)}`)
    expect(sendButton()?.disabled).toBe(false)
  })

  it('sends the amount in canonical form', () => {
    render(CREATOR)
    sendMessage.mockClear()
    sendWithPin('2')

    // '2' and '2.00' are the same tip; the wire should only ever see one of them.
    expect(tipsSent()).toHaveLength(1)
    expect(tipsSent()[0]).toMatchObject({ type: 'SEND_TIP', amount: '2.00', pin: '123456' })
  })

  it('stays silent while the amount is invalid', () => {
    render(CREATOR)
    sendMessage.mockClear()
    type('0.10')
    sendButton()?.click()

    expect(pinField()).toBeNull()
    expect(tipsSent()).toHaveLength(0)
  })

  it('carries the memo along with the tip', () => {
    render(CREATOR)
    sendMessage.mockClear()
    typeMemo('  thanks for this one  ')
    sendWithPin('2')

    // Trimmed, because leading and trailing space is paid for like any other
    // byte and reads as nothing on the other end.
    expect(tipsSent()[0]?.memo).toBe('thanks for this one')
  })

  it('sends an empty memo rather than omitting it', () => {
    render(CREATOR)
    sendMessage.mockClear()
    sendWithPin('2')

    expect(tipsSent()[0]?.memo).toBe('')
  })

  it('counts the memo in bytes, which is what it will cost', () => {
    render(CREATOR)

    expect(memoCount()?.textContent).toBe(`0/${MEMO_MAX_BYTES}`)
    typeMemo('🎁')
    // One character on screen, four bytes on the wire.
    expect(memoCount()?.textContent).toBe(`4/${MEMO_MAX_BYTES}`)
  })

  it('stops the memo at the budget without breaking a character', () => {
    render(CREATOR)
    typeMemo('🎁'.repeat(40))

    const value = memoField()?.value ?? ''
    expect(memoByteLength(value)).toBeLessThanOrEqual(MEMO_MAX_BYTES)
    expect(value).not.toContain('�')
    expect(memoCount()?.classList.contains('is-full')).toBe(true)
  })

    it('asks for a PIN before it sends anything', () => {
    render(CREATOR)
    sendMessage.mockClear()
    type('2')
    sendButton()?.click()

    // Continue confirms; it does not spend. Nothing reaches the worker until
    // a PIN has been entered (idea.md §3.1.3).
    expect(pinField()).not.toBeNull()
    expect(tipsSent()).toHaveLength(0)
  })

  it('will not sign on an empty PIN', () => {
    render(CREATOR)
    sendMessage.mockClear()
    type('2')
    sendButton()?.click()
    confirmButton()?.click()

    expect(tipsSent()).toHaveLength(0)
    expect(document.querySelector('#pin-error')?.textContent).toBe('Enter your PIN.')
  })

  it('escapes a display name instead of running it', () => {
    render({ ...CREATOR, displayName: '<img src=x onerror=alert(1)>' })

    expect(document.querySelector('#app img')).toBeNull()
    expect(document.querySelector('.name')?.textContent).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('a wallet that is already unlocked', () => {
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

  function answerWith(needsPin: boolean): void {
    sendMessage.mockClear()
    sendMessage.mockImplementation(async (message: { type: string }) =>
      message?.type === 'GET_COMPOSER_CONTEXT'
        ? contextOf('5.00', '0.01', needsPin)
        : { ok: true, txHash: '0xfeed' },
    )
  }

  it('confirms the tip without asking for a PIN again', async () => {
    answerWith(false)
    render(CREATOR)
    await settle()

    type('2')
    sendButton()?.click()

    expect(pinField()).toBeNull()
    confirmButton()?.click()
    await settle()

    expect(tipsSent()[0]?.pin).toBe('')
  })

  it('still asks when the worker says the wallet is locked', async () => {
    // The PIN box appears only when something will actually check it.
    answerWith(true)
    render(CREATOR)
    await settle()

    type('2')
    sendButton()?.click()

    expect(pinField()).not.toBeNull()
  })
})
