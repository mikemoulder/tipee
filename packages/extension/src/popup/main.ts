import './styles.css'

const app = document.querySelector<HTMLElement>('#app')

if (app) {
  app.innerHTML = `
    <section>
      <span class="brand">Tipee / wallet</span>
      <h1>Give good work a little lift.</h1>
      <div class="balance">
        <div class="balance-label">Arc testnet balance</div>
        <div class="balance-value">0.00 USDC</div>
      </div>
      <button type="button">Set up wallet</button>
      <span class="meta">Non-custodial. Your keys stay in this extension.</span>
    </section>
  `
}
