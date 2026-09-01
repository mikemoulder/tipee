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
  /* Every one of these is overwritten inline with a sibling's real values; the
     class rules below are only what stands in before that sampling lands. */
  #${BUTTON_ID} { align-items: center; background: var(--tipee-button-background); border: 0; border-radius: 50%; box-sizing: border-box; color: var(--tipee-button-text); cursor: pointer; display: inline-flex; flex: 0 0 auto; height: var(--tipee-button-size, 40px); justify-content: center; margin-right: 8px; overflow: hidden; padding: 0; position: relative; transition: background-color 120ms ease; width: var(--tipee-button-size, 40px); }
  #${BUTTON_ID}.tipee-dark { --tipee-button-background: #272727; --tipee-button-hover: #3f3f3f; --tipee-button-text: #f1f1f1; }
  #${BUTTON_ID}.tipee-light { --tipee-button-background: #f2f2f2; --tipee-button-hover: #e5e5e5; --tipee-button-text: #0f0f0f; }
  #${BUTTON_ID}:hover, #${BUTTON_ID}:focus-visible { background: var(--tipee-button-hover); outline: 0; }
  /* Dropped whole by browsers without color-mix, leaving the line above. */
  #${BUTTON_ID}:hover, #${BUTTON_ID}:focus-visible { background: color-mix(in srgb, var(--tipee-button-background), var(--tipee-button-text) 12%); }
  #${BUTTON_ID}:focus-visible { outline: 2px solid var(--tipee-button-text); outline-offset: 2px; }
  #${BUTTON_ID} svg { display: block; fill: none; height: 24px; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; width: 24px; }
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

/**
 * Where the button is allowed to land, most specific first.
 *
 * `#top-level-buttons-computed` is the id *every* `ytd-menu-renderer` carries:
 * every comment, every related video, and every card of the feed the viewer
 * arrived from. Handing all the candidates to one comma-joined `querySelector`
 * returns the first match in *document order* rather than the first selector
 * that matches, and `ytd-page-manager` parks the route you navigated away from
 * in the DOM under a `hidden` attribute instead of tearing it down. So opening
 * a video from the home feed appended the button to a stale, `display: none`
 * feed card — present, but invisible — and only a full page load, where no
 * previous route exists, put it in the right place.
 *
 * Each selector is therefore tried in turn, and matches sitting inside a hidden
 * subtree are skipped.
 */
const ACTION_BAR_SELECTORS = [
  'ytd-watch-metadata #top-level-buttons-computed',
  'ytd-watch-flexy #actions #top-level-buttons-computed',
  'ytd-video-primary-info-renderer #top-level-buttons-computed',
  'ytd-watch-metadata #top-level-buttons',
]

function findActionBar(): Element | null {
  for (const selector of ACTION_BAR_SELECTORS) {
    const match = Array.from(document.querySelectorAll(selector)).find(
      (candidate) => !candidate.closest('[hidden]'),
    )
    if (match) return match
  }
  return null
}

function injectTipButton(): void {
  const videoId = currentVideoId()
  if (!videoId) return

  // Resolved before anything is built. This runs on every mutation YouTube
  // makes, and for most of them the watch page has not rendered its action row
  // yet — no reason to walk the bootstrap blob or build a button to discard.
  const actionBar = findActionBar()
  if (!actionBar) return

  // A connected button is not the same as a *placed* one: when YouTube swaps
  // the metadata row it takes ours with it, leaving it parented to a detached
  // copy. The parent is what says whether there is still work to do.
  const existing = document.getElementById(BUTTON_ID)
  if (injectedVideoId === videoId && existing?.parentElement === actionBar) return
  existing?.remove()

  const creator = scrapeCreator(videoId)

  const button = document.createElement('button')
  button.id = BUTTON_ID
  button.type = 'button'
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10H4zM3 10h18v3H3zM12 10v10M12 10H7.5a2.5 2.5 0 1 1 0-5c1.4 0 2.4 1.3 3 2.5L12 10Zm0 0h4.5a2.5 2.5 0 1 0 0-5c-1.4 0-2.4 1.3-3 2.5L12 10Z"/></svg>'
  // The icon carries no text, so the label is the only name it has.
  button.setAttribute('aria-label', 'Tip this creator')
  button.title = 'Tip this creator'
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

  actionBar.prepend(button)
  // After insertion, not before: the theme is read off the buttons beside it,
  // and an element that is not in the row yet has no siblings to read.
  applyTheme(button)
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

/**
 * Picks the light or dark stand-in palette from the page background.
 *
 * This is only what the button wears until `matchSiblingButton` samples the
 * real thing; the values are YouTube's own flat greys rather than translucent
 * tints, so even the stand-in looks filled instead of washed out.
 */
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
  matchSiblingButton(button)
}

/**
 * Repaints the button with the computed style of a real neighbour.
 *
 * Naming a YouTube design token was not enough. `--yt-spec-badge-chip-background`
 * *is* defined, so the `var()` fallback never fired, but it is not what the
 * Share and Save buttons paint with — the gift ended up with no fill at all
 * while everything beside it looked solid. Sampling a sibling removes the
 * guesswork about which token is current: whatever those buttons are, we are,
 * in either theme and at whatever size the row is using.
 */
function matchSiblingButton(button: HTMLButtonElement): void {
  const row = button.parentElement
  if (!row) return

  const sibling = Array.from(row.querySelectorAll('button')).find(
    (candidate) =>
      candidate !== button && !isTransparent(getComputedStyle(candidate).backgroundColor),
  )
  if (!sibling) return

  const style = getComputedStyle(sibling)
  button.style.setProperty('--tipee-button-background', style.backgroundColor)
  button.style.setProperty('--tipee-button-text', style.color)

  // Matching the row's height beats guessing at it, but a button YouTube has
  // not laid out yet measures zero — leave the CSS default standing for that.
  const size = Math.round(sibling.getBoundingClientRect().height)
  if (size > 0) button.style.setProperty('--tipee-button-size', `${size}px`)
}

/** `transparent`, `rgba(…, 0)` and an unset value all mean nothing is painted. */
function isTransparent(color: string): boolean {
  // `rgba(0, 0, 0, 0)` is how a computed style spells 'nothing here'.
  const compact = color.split(' ').join('')
  return compact === '' || compact === 'transparent' || compact.endsWith(',0)')
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
