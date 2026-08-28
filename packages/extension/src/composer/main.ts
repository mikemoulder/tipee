import type { ExtensionMessage, ScrapedCreator } from '@tipee/shared'
import './styles.css'

const app = document.querySelector<HTMLElement>('#app')

function render(creator: ScrapedCreator | null): void {
  if (!app) return

  const name = creator?.displayName ?? 'YouTube creator'
  const handle = creator?.handle ?? 'Unknown channel'
  const initials = name.slice(0, 1).toUpperCase()
  app.innerHTML = `
    <section>
      <span class="brand">Tipee / send a tip</span>
      <div class="creator">
        <div class="avatar">${escapeHtml(initials)}</div>
        <div class="creator-copy">
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(handle)} / unverified escrow</span>
        </div>
      </div>
      <h1>Send a little thanks.</h1>
      <span class="handle">Arc testnet / USDC</span>
      <label>
        Amount
        <input id="amount" inputmode="decimal" min="0.50" step="0.01" value="1.00" />
      </label>
      <div class="presets">
        <button class="preset" type="button" data-amount="1">$1</button>
        <button class="preset" type="button" data-amount="5">$5</button>
        <button class="preset" type="button" data-amount="10">$10</button>
        <button class="preset" type="button" data-amount="25">$25</button>
      </div>
      <button class="primary" id="send" type="button">Continue / 1.00 USDC</button>
      <span class="note">Estimated gas will appear here before signing.</span>
    </section>
  `

  const amountInput = document.querySelector<HTMLInputElement>('#amount')
  const sendButton = document.querySelector<HTMLButtonElement>('#send')
  document.querySelectorAll<HTMLButtonElement>('[data-amount]').forEach((preset) => {
    preset.addEventListener('click', () => {
      if (!amountInput || !sendButton) return
      amountInput.value = preset.dataset.amount ?? '1.00'
      sendButton.textContent = `Continue / ${amountInput.value} USDC`
    })
  })

  sendButton?.addEventListener('click', () => {
    const amount = amountInput?.value ?? ''
    const message: ExtensionMessage = { type: 'SEND_TIP', nonce: crypto.randomUUID(), amount, pin: '' }
    void chrome.runtime.sendMessage(message)
  })
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)
}

const params = new URLSearchParams(window.location.search)
const creatorParam = params.get('creator')
let creator: ScrapedCreator | null = null
if (creatorParam) {
  try {
    creator = JSON.parse(creatorParam) as ScrapedCreator
  } catch {
    creator = null
  }
}
render(creator)
