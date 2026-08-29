import './styles.css'
import { createWalletRecord, getWalletAddress, hasWallet, unlockWallet } from '../wallet/keystore'

const app = document.querySelector<HTMLElement>('#app')

let walletMnemonic: string[] = []

async function initWalletUi(): Promise<void> {
  if (!app) return

  const exists = await hasWallet()
  if (!exists) {
    renderWelcome()
    return
  }

  const address = await getWalletAddress()
  renderUnlockWallet(address ?? '0x0000000000000000000000000000000000000000')
}

function renderWelcome(): void {
  if (!app) return

  app.innerHTML = `
    <section class="wallet-shell">
      <span class="brand">Tipee / wallet</span>
      <h1>Give good work a little lift.</h1>
      <div class="balance">
        <div class="balance-label">Arc testnet balance</div>
        <div class="balance-value">0.00 USDC</div>
      </div>
      <button class="primary" id="setup-wallet" type="button">Set up wallet</button>
      <span class="meta">Non-custodial. Your keys stay in this extension.</span>
    </section>
  `

  const setup = document.querySelector<HTMLButtonElement>('#setup-wallet')
  setup?.addEventListener('click', () => renderPinSetup())
}

function renderPinSetup(): void {
  if (!app) return

  app.innerHTML = `
    <section class="wallet-shell form-shell">
      <span class="brand">Tipee / secure setup</span>
      <h2>Create a PIN</h2>
      <label>
        6-digit PIN
        <input id="pin" type="password" inputmode="numeric" maxlength="32" placeholder="123456" />
      </label>
      <label>
        Confirm PIN
        <input id="pin-confirm" type="password" inputmode="numeric" maxlength="32" placeholder="123456" />
      </label>
      <button class="primary" id="create-wallet" type="button">Create wallet</button>
      <p class="error" id="pin-error"></p>
    </section>
  `

  const createWallet = document.querySelector<HTMLButtonElement>('#create-wallet')
  createWallet?.addEventListener('click', async () => {
    const pinInput = document.querySelector<HTMLInputElement>('#pin')
    const confirmInput = document.querySelector<HTMLInputElement>('#pin-confirm')
    const error = document.querySelector<HTMLElement>('#pin-error')
    const pin = pinInput?.value ?? ''
    const confirm = confirmInput?.value ?? ''

    if (pin.length < 6 || !/^\d+$/.test(pin)) {
      if (error) error.textContent = 'PIN must be at least 6 digits.'
      return
    }

    if (pin !== confirm) {
      if (error) error.textContent = 'PINs do not match.'
      return
    }

    try {
      const record = await createWalletRecord(pin)
      renderSeedReveal(record.address, record.mnemonic)
    } catch (err) {
      if (error) error.textContent = err instanceof Error ? err.message : 'Could not create wallet.'
    }
  })
}

function renderSeedReveal(address: string, mnemonic: string): void {
  if (!app) return

  walletMnemonic = mnemonic.split(' ')

  app.innerHTML = `
    <section class="wallet-shell">
      <span class="brand">Tipee / backup</span>
      <h2>Write down your seed phrase</h2>
      <div class="seed-grid">
        ${walletMnemonic
          .map((word, index) => `<div class="seed-word"><span>${index + 1}</span>${word}</div>`)
          .join('')}
      </div>
      <label class="confirm-box">
        <input id="seed-confirm" type="checkbox" />
        I have saved my 12-word seed phrase.
      </label>
      <button class="primary" id="continue-wallet" type="button" disabled>Continue</button>
    </section>
  `

  const confirm = document.querySelector<HTMLInputElement>('#seed-confirm')
  const continueButton = document.querySelector<HTMLButtonElement>('#continue-wallet')

  confirm?.addEventListener('change', () => {
    if (continueButton) continueButton.disabled = !confirm.checked
  })

  continueButton?.addEventListener('click', () => renderReadyState(address))
}

function renderUnlockWallet(address: string): void {
  if (!app) return

  app.innerHTML = `
    <section class="wallet-shell form-shell">
      <span class="brand">Tipee / unlock</span>
      <h2>Enter your PIN</h2>
      <div class="balance">
        <div class="balance-label">Wallet address</div>
        <div class="balance-value address">${address}</div>
      </div>
      <label>
        PIN
        <input id="unlock-pin" type="password" inputmode="numeric" maxlength="32" placeholder="123456" />
      </label>
      <button class="primary" id="unlock-wallet" type="button">Unlock wallet</button>
      <p class="error" id="unlock-error"></p>
    </section>
  `

  const unlockButton = document.querySelector<HTMLButtonElement>('#unlock-wallet')
  unlockButton?.addEventListener('click', async () => {
    const pinInput = document.querySelector<HTMLInputElement>('#unlock-pin')
    const error = document.querySelector<HTMLElement>('#unlock-error')
    const pin = pinInput?.value ?? ''

    try {
      const mnemonic = await unlockWallet(pin)
      if (!mnemonic) throw new Error('Wallet did not decrypt.')
      renderReadyState(address)
    } catch (err) {
      if (error) error.textContent = err instanceof Error ? err.message : 'Incorrect PIN.'
    }
  })
}

function renderReadyState(address: string): void {
  if (!app) return

  app.innerHTML = `
    <section class="wallet-shell">
      <span class="brand">Tipee / wallet</span>
      <h1>Wallet ready.</h1>
      <div class="balance">
        <div class="balance-label">Address</div>
        <div class="balance-value address">${address}</div>
      </div>
      <div class="balance secondary">
        <div class="balance-label">Arc testnet balance</div>
        <div class="balance-value">0.00 USDC</div>
      </div>
      <button class="primary" type="button">Wallet unlocked</button>
      <span class="meta">Your keys are encrypted and stored only in this browser.</span>
    </section>
  `
}

void initWalletUi()
