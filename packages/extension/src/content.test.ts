// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const BUTTON_ID = 'tipee-tip-button'

function setUrl(path: string): void {
  ;(window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(
    `https://www.youtube.com/${path}`,
  )
}

function watchVideo(videoId: string): void {
  setUrl(`watch?v=${videoId}`)
}

/** A `ytd-menu-renderer`, the element that owns `#top-level-buttons-computed`. */
function menu(children = ''): string {
  return `<ytd-menu-renderer><div id="top-level-buttons-computed">${children}</div></ytd-menu-renderer>`
}

const LIKE_BACKGROUND = 'rgb(242, 242, 242)'
const LIKE_TEXT = 'rgb(15, 15, 15)'

/** What YouTube puts in the action row; the inner button carries the fill. */
const LIKE_PILL =
  '<segmented-like-dislike-button-view-model>' +
  `<button style="background-color: ${LIKE_BACKGROUND}; color: ${LIKE_TEXT}">Like</button>` +
  '</segmented-like-dislike-button-view-model>'

/**
 * The DOM a viewer lands on when they open a video from the home feed.
 *
 * `ytd-page-manager` keeps the route they came from mounted under `hidden`
 * *ahead of* the watch page, and both its cards and the comments below the
 * video carry the very same id as the watch page's own action row.
 */
function renderWatchPage({ actionRow = true } = {}): void {
  document.body.innerHTML = `
    <ytd-page-manager>
      <ytd-browse hidden>
        <ytd-rich-item-renderer>${menu()}</ytd-rich-item-renderer>
      </ytd-browse>
      <ytd-watch-flexy>
        <div id="primary">
          <ytd-watch-metadata>
            <ytd-video-owner-renderer>
              <a href="https://www.youtube.com/@creator">Creator</a>
            </ytd-video-owner-renderer>
            ${actionRow ? `<div id="actions">${menu(LIKE_PILL)}</div>` : ''}
          </ytd-watch-metadata>
          <ytd-comment-thread-renderer>${menu()}</ytd-comment-thread-renderer>
        </div>
      </ytd-watch-flexy>
    </ytd-page-manager>`
}

/** Gives the MutationObserver that drives injection a turn to run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function watchActionRow(): Element {
  const row = document.querySelector('ytd-watch-metadata #top-level-buttons-computed')
  if (!row) throw new Error('fixture is missing the watch action row')
  return row
}

beforeAll(async () => {
  watchVideo('booting00000')
  await import('./content')
})

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('tip button injection', () => {
  it('lands in the watch action row, not in the route the viewer navigated from', async () => {
    watchVideo('aaaaaaaaaaa')
    renderWatchPage()
    await settle()

    const button = document.getElementById(BUTTON_ID)
    expect(button).not.toBeNull()
    expect(button?.parentElement).toBe(watchActionRow())
    expect(button?.closest('[hidden]')).toBeNull()
  })

  it('sits ahead of the like pill, in the gap next to Subscribe', async () => {
    watchVideo('ddddddddddd')
    renderWatchPage()
    await settle()

    expect(watchActionRow().firstElementChild?.id).toBe(BUTTON_ID)
  })

  it('waits for the action row rather than settling for a comment menu', async () => {
    watchVideo('bbbbbbbbbbb')
    renderWatchPage({ actionRow: false })
    await settle()

    expect(document.getElementById(BUTTON_ID)).toBeNull()

    const metadata = document.querySelector('ytd-watch-metadata')
    const actions = document.createElement('div')
    actions.id = 'actions'
    actions.innerHTML = menu(LIKE_PILL)
    metadata?.append(actions)
    await settle()

    expect(document.getElementById(BUTTON_ID)?.parentElement).toBe(watchActionRow())
  })

  it('re-anchors when YouTube swaps the action row out from under it', async () => {
    watchVideo('ccccccccccc')
    renderWatchPage()
    await settle()
    expect(document.getElementById(BUTTON_ID)).not.toBeNull()

    const actions = document.querySelector('#actions')
    if (actions) actions.innerHTML = menu(LIKE_PILL)
    await settle()

    expect(document.querySelectorAll(`#${BUTTON_ID}`)).toHaveLength(1)
    expect(document.getElementById(BUTTON_ID)?.parentElement).toBe(watchActionRow())
  })

  it('carries an accessible name now that the icon stands alone', async () => {
    watchVideo('eeeeeeeeeee')
    renderWatchPage()
    await settle()

    const button = document.getElementById(BUTTON_ID)
    expect(button?.getAttribute('aria-label')).toBe('Tip this creator')
    expect(button?.textContent?.trim()).toBe('')
  })

  it('takes its fill from the button beside it rather than a design token', async () => {
    watchVideo('fffffffffff')
    renderWatchPage()
    await settle()

    // A named token burned us once already: `--yt-spec-badge-chip-background`
    // is defined, so the `var()` fallback never fired, but it is not what these
    // buttons paint with — the gift rendered with no fill beside solid pills.
    const button = document.getElementById(BUTTON_ID)
    expect(button?.style.getPropertyValue('--tipee-button-background')).toBe(LIKE_BACKGROUND)
    expect(button?.style.getPropertyValue('--tipee-button-text')).toBe(LIKE_TEXT)
  })

  it('ignores neighbours that paint nothing', async () => {
    watchVideo('ggggggggggg')
    renderWatchPage()
    const ghost = document.createElement('button')
    ghost.style.backgroundColor = 'rgba(0, 0, 0, 0)'
    watchActionRow().prepend(ghost)
    await settle()

    const sampled = document
      .getElementById(BUTTON_ID)
      ?.style.getPropertyValue('--tipee-button-background')
    expect(sampled).toBe(LIKE_BACKGROUND)
  })

  it('stays off pages that are not a watch page', async () => {
    setUrl('feed/subscriptions')
    document.body.innerHTML = `<ytd-browse><ytd-rich-item-renderer>${menu()}</ytd-rich-item-renderer></ytd-browse>`
    await settle()

    expect(document.getElementById(BUTTON_ID)).toBeNull()
  })
})
