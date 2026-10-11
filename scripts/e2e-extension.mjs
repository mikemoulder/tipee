// Drives the built extension in real Chrome, end to end on Stellar testnet:
// onboarding (PIN, seed phrase, seed check), wallet deployment and faucet,
// a tip through the composer, and the activity list afterwards.
//
//   npm i --no-save puppeteer-core
//   VITE_TIPEE_API=http://localhost:3000 npm run build -w @tipee/extension
//   node scripts/e2e-extension.mjs packages/extension/dist /tmp/shots
//
// Needs a running API (see packages/api/README.md) and Google Chrome.

import puppeteer from 'puppeteer-core'

const DIST = process.argv[2]
const SHOTS = process.argv[3]
const PIN = '482915'
const t0 = Date.now()
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${m}`)

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome',
  headless: true,
  pipe: true,
  enableExtensions: [DIST],
  args: ['--no-sandbox'],
})

try {
  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'), {
    timeout: 20000,
  })
  const id = new URL(sw.url()).host
  log(`extension loaded: ${id}`)
  const worker = await sw.worker()
  worker.on('console', (m) => console.log('   [sw]', m.text()))

  const page = await browser.newPage()
  page.on('console', (m) => console.log('   [popup]', m.text()))
  page.on('pageerror', (e) => console.log('   [popup error]', e.message))
  await page.setViewport({ width: 380, height: 620 })
  await page.goto(`chrome-extension://${id}/index.html`)

  await page.waitForSelector('#setup-wallet')
  await page.click('#setup-wallet')
  await page.waitForSelector('#pin')
  await page.type('#pin', PIN)
  await page.type('#pin-confirm', PIN)
  await page.click('#create-wallet')

  await page.waitForSelector('.seed-word', { timeout: 30000 })
  const words = await page.$$eval('.seed-word', (els) => els.map((el) => el.lastChild.textContent.trim()))
  log(`seed phrase shown (${words.length} words)`)
  await page.click('#seed-confirm')
  await page.click('#continue-wallet')

  await page.waitForSelector('#check-seed')
  const slots = await page.$$eval('label[for^="check-"]', (els) =>
    els.map((el) => ({ id: el.getAttribute('for'), n: Number(el.textContent.replace(/\D/g, '')) })),
  )
  for (const slot of slots) await page.type(`#${slot.id}`, words[slot.n - 1])
  await page.click('#check-seed')
  log('seed check passed; wallet setup running')
  await page.screenshot({ path: `${SHOTS}/1-setup.png` })

  await page.waitForFunction(() => /\$\d/.test(document.querySelector('#balance')?.textContent ?? ''), { timeout: 90000 })
  await page.waitForFunction(() => document.querySelector('#balance')?.textContent !== '$0.00', { timeout: 20000 }).catch(() => {})
  const balance = await page.$eval('#balance', (el) => el.textContent)
  const address = await page.evaluate(async () => (await chrome.storage.local.get('tipee.wallet.v2'))['tipee.wallet.v2'].address)
  log(`home: balance ${balance}, wallet ${address}`)
  await page.screenshot({ path: `${SHOTS}/2-home.png` })

  // The content script sends exactly this when the gift button is clicked.
  const composerTarget = browser.waitForTarget((t) => t.url().includes('/composer.html'), { timeout: 15000 })
  await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: 'OPEN_COMPOSER',
      creator: { handle: '@fireship', displayName: 'Fireship', avatarUrl: null, videoId: 'e2e' },
      screenX: 0,
      screenY: 0,
    }),
  )
  const composer = await (await composerTarget).page()
  composer.on('pageerror', (e) => console.log('   [composer error]', e.message))
  await composer.setViewport({ width: 380, height: 620 })
  await composer.waitForSelector('#amount')
  await composer.waitForFunction(() => !/Checking|—/.test(document.querySelector('#context-note')?.textContent ?? ''), {
    timeout: 20000,
  }).catch(() => {})
  log(`composer open: "${await composer.$eval('#context-note', (el) => el.textContent.trim())}"`)
  await composer.click('#amount', { clickCount: 3 })
  await composer.type('#amount', '1.50')
  await composer.type('#memo', 'e2e from real Chrome')
  await composer.screenshot({ path: `${SHOTS}/3-composer.png` })
  await composer.click('#send')

  await composer.waitForSelector('#confirm, #pin', { timeout: 15000 })
  if (await composer.$('#pin')) await composer.type('#pin', PIN)
  await composer.click('#confirm')
  log('tip signed; waiting for the relayer')

  await composer.waitForSelector('.signing-summary.sent, #send-error', { timeout: 90000 })
  const error = await composer.$eval('#send-error', (el) => el.textContent).catch(() => null)
  if (error) throw new Error(`tip failed: ${error}`)
  const receipt = await composer.$eval('#receipt', (el) => el.href)
  log(`tip confirmed: ${receipt}`)
  await composer.screenshot({ path: `${SHOTS}/4-sent.png` })

  await page.reload()
  await page.waitForSelector('#balance')
  await page.waitForFunction(() => document.querySelectorAll('.movement:not(.skeleton)').length > 0, { timeout: 60000 })
  const rows = await page.$$eval('.movement:not(.skeleton) .movement-title', (els) => els.map((el) => el.textContent))
  log(`activity: ${JSON.stringify(rows)}; balance ${await page.$eval('#balance', (el) => el.textContent)}`)
  await page.screenshot({ path: `${SHOTS}/5-activity.png` })
} finally {
  await browser.close()
}
