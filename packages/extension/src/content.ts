import type { ExtensionMessage, ScrapedCreator } from '@tipee/shared'
import { currentVideoId, scrapeCreator } from './youtube'

const BUTTON_ID = 'tipee-tip-button'
const TOOLTIP_ID = 'tipee-tip-tooltip'
const MAX_CUES = 3
let injectedVideoId: string | null = null
let cueCount = 0
let cueTimer: number | undefined

const buttonStyle = document.createElement('style')
buttonStyle.textContent = `
  #${BUTTON_ID} { align-items: center; background: var(--tipee-pill-background); border: 0; border-radius: 18px; box-sizing: border-box; box-shadow: 0 1px 3px var(--tipee-pill-shadow); color: var(--tipee-pill-text); cursor: pointer; display: inline-flex; flex: 0 0 auto; font: 500 14px/20px Roboto, Arial, sans-serif; gap: 6px; height: 36px; margin-left: 8px; overflow: hidden; padding: 0 12px; position: relative; transition: background-color 120ms ease, box-shadow 120ms ease, color 120ms ease; }
  #${BUTTON_ID}.tipee-dark { --tipee-pill-background: rgba(255,255,255,.1); --tipee-pill-shadow: rgba(0,0,0,.35); --tipee-pill-text: #f1f1f1; }
  #${BUTTON_ID}.tipee-light { --tipee-pill-background: rgba(0,0,0,.1); --tipee-pill-shadow: rgba(0,0,0,.2); --tipee-pill-text: #0f0f0f; }
  #${BUTTON_ID}:hover, #${BUTTON_ID}:focus-visible { background: var(--tipee-pill-hover); color: var(--tipee-pill-text); outline: 0; }
  #${BUTTON_ID}.tipee-dark { --tipee-pill-hover: rgba(255,255,255,.16); }
  #${BUTTON_ID}.tipee-light { --tipee-pill-hover: rgba(0,0,0,.16); }
  #${BUTTON_ID}:focus-visible { box-shadow: 0 0 0 2px var(--tipee-pill-text), 0 1px 3px var(--tipee-pill-shadow); }
  #${BUTTON_ID} svg { display: block; fill: none; height: 18px; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.7; width: 18px; }
  #${BUTTON_ID}.tipee-cue svg { animation: tipee-gift-wiggle 600ms ease-in-out; }
  #${BUTTON_ID}.tipee-cue::after { animation: tipee-light-sweep 600ms ease-out; background: linear-gradient(100deg, transparent, rgba(255,255,255,.42), transparent); content: ''; inset: 0 auto 0 -70%; pointer-events: none; position: absolute; width: 55%; }
  #${TOOLTIP_ID} { animation: tipee-tooltip-in 160ms ease-out; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.25); font: 400 13px/18px Roboto, Arial, sans-serif; left: 50%; max-width: 280px; padding: 10px 12px; position: fixed; top: 58px; transform: translateX(-50%); z-index: 2147483647; }
  #${TOOLTIP_ID}.tipee-dark { background: #fff; color: #0f0f0f; }
  #${TOOLTIP_ID}.tipee-light { background: #0f0f0f; color: #fff; }
  #${TOOLTIP_ID} button { background: transparent; border: 0; color: var(--yt-spec-text-secondary, #606060); cursor: pointer; float: right; font-size: 16px; line-height: 16px; margin: -3px -5px 0 8px; padding: 0; }
  @keyframes tipee-gift-wiggle { 0%, 100% { transform: rotate(0) scale(1); } 25% { transform: rotate(-8deg) scale(1.08); } 75% { transform: rotate(8deg) scale(1.08); } }
  @keyframes tipee-light-sweep { from { left: -70%; } to { left: 125%; } }
  @keyframes tipee-tooltip-in { from { opacity: 0; transform: translate(-50%, -4px); } to { opacity: 1; transform: translate(-50%, 0); } }
  @media (prefers-reduced-motion: reduce) { #${BUTTON_ID}.tipee-cue svg, #${BUTTON_ID}.tipee-cue::after, #${TOOLTIP_ID} { animation: none; } }
`
document.documentElement.append(buttonStyle)

function injectTipButton(): void {
  const videoId = currentVideoId()
  if (!videoId || (injectedVideoId === videoId && document.getElementById(BUTTON_ID)?.isConnected)) return

  const creator = scrapeCreator(videoId)

  document.getElementById(BUTTON_ID)?.remove()

  const button = document.createElement('button')
  button.id = BUTTON_ID
  button.type = 'button'
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10H4zM3 10h18v3H3zM12 10v10M12 10H7.5a2.5 2.5 0 1 1 0-5c1.4 0 2.4 1.3 3 2.5L12 10Zm0 0h4.5a2.5 2.5 0 1 0 0-5c-1.4 0-2.4 1.3-3 2.5L12 10Z"/></svg><span>Tip</span>'
  button.setAttribute('aria-label', 'Tip this creator')
  applyTheme(button)
  button.addEventListener('click', () => {
    const currentCreator = creator ?? scrapeCreator(videoId)
    if (!currentCreator) {
      button.title = 'Creator details are still loading'
      return
    }
    const message: ExtensionMessage = {
      type: 'OPEN_COMPOSER',
      creator: currentCreator,
      screenX: window.screenX + window.innerWidth - 400,
      screenY: window.screenY + 80,
    }
    void chrome.runtime.sendMessage(message)
  })

  const actionBar = document.querySelector(
    '#top-level-buttons-computed, #top-level-buttons, ytd-watch-metadata #top-level-buttons-computed',
  )
  if (!actionBar) return

  actionBar.append(button)
  injectedVideoId = videoId
  startCueLoop(button)
}

function startCueLoop(button: HTMLButtonElement): void {
  if (cueTimer !== undefined) window.clearInterval(cueTimer)
  cueCount = 0
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  cueTimer = window.setInterval(() => {
    if (cueCount >= MAX_CUES || !button.isConnected) return
    const visible = button.getBoundingClientRect().bottom > 0 && button.getBoundingClientRect().top < window.innerHeight
    if (!visible) return
    cueCount += 1
    button.classList.remove('tipee-cue')
    void button.offsetWidth
    button.classList.add('tipee-cue')
    if (cueCount === 1) showTooltip()
    window.setTimeout(() => button.classList.remove('tipee-cue'), 650)
  }, 45_000)
}

function applyTheme(button: HTMLButtonElement): void {
  const bodyBackground = getComputedStyle(document.body).backgroundColor
  const rootBackground = getComputedStyle(document.documentElement).backgroundColor
  const background = bodyBackground.startsWith('rgba') && bodyBackground.endsWith(', 0)') ? rootBackground : bodyBackground
  const match = background.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  const isDark = match ? Number(match[1]) * 0.299 + Number(match[2]) * 0.587 + Number(match[3]) * 0.114 < 128 : true
  button.classList.toggle('tipee-dark', isDark)
  button.classList.toggle('tipee-light', !isDark)
  const tooltip = document.getElementById(TOOLTIP_ID)
  tooltip?.classList.toggle('tipee-dark', isDark)
  tooltip?.classList.toggle('tipee-light', !isDark)
}

function showTooltip(): void {
  if (document.getElementById(TOOLTIP_ID) || localStorage.getItem('tipee-tip-sent') === '1') return
  const tooltip = document.createElement('div')
  tooltip.id = TOOLTIP_ID
  const button = document.getElementById(BUTTON_ID)
  if (button instanceof HTMLButtonElement) applyTheme(button)
  tooltip.className = button?.classList.contains('tipee-light') ? 'tipee-light' : 'tipee-dark'
  tooltip.textContent = 'Enjoying the video? Tip the creator — it goes straight to them.'
  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.setAttribute('aria-label', 'Dismiss')
  dismiss.textContent = '×'
  dismiss.addEventListener('click', () => tooltip.remove())
  tooltip.prepend(dismiss)
  document.body.append(tooltip)
  window.setTimeout(() => tooltip.remove(), 4_000)
}

const observer = new MutationObserver(injectTipButton)
observer.observe(document.documentElement, { childList: true, subtree: true })
const themeObserver = new MutationObserver(() => {
  const button = document.getElementById(BUTTON_ID)
  if (button instanceof HTMLButtonElement) applyTheme(button)
})
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'dark', 'style'] })
themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'dark', 'style'] })
window.addEventListener('yt-navigate-finish', () => {
  if (cueTimer !== undefined) window.clearInterval(cueTimer)
  injectedVideoId = null
  document.getElementById(BUTTON_ID)?.remove()
  document.getElementById(TOOLTIP_ID)?.remove()
  injectTipButton()
})
injectTipButton()
