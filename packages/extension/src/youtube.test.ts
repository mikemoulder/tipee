// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'

import { currentVideoId, scrapeCreator } from './youtube'

const VIDEO_A = 'aaaaaaaaaaa'
const VIDEO_B = 'bbbbbbbbbbb'

/** The shape the watch page ships its bootstrap data in, trimmed to what we read. */
function bootstrapFor(videoId: string, name: string, handle: string): unknown {
  return {
    currentVideoEndpoint: { watchEndpoint: { videoId } },
    contents: {
      twoColumnWatchNextResults: {
        results: {
          results: {
            contents: [
              {
                videoSecondaryInfoRenderer: {
                  owner: {
                    videoOwnerRenderer: {
                      title: { runs: [{ text: name }] },
                      navigationEndpoint: {
                        commandMetadata: { webCommandMetadata: { url: `/${handle}` } },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  }
}

/** Mirrors the real owner section: avatar link first and textless, name link second. */
function renderOwner(name: string, handle: string, avatarUrl = 'https://yt3.example/pic.jpg'): void {
  document.body.innerHTML = `
    <ytd-video-owner-renderer>
      <a id="avatar-link" href="https://www.youtube.com/${handle}">
        <yt-img-shadow id="avatar"><img src="${avatarUrl}"></yt-img-shadow>
      </a>
      <div id="channel-name">
        <ytd-channel-name>
          <a href="https://www.youtube.com/${handle}">${name}</a>
        </ytd-channel-name>
      </div>
    </ytd-video-owner-renderer>`
}

function renderBootstrapScript(data: unknown): void {
  const script = document.createElement('script')
  script.textContent = `var ytInitialData = ${JSON.stringify(data)};`
  document.head.appendChild(script)
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('currentVideoId', () => {
  it('reads v= from a watch URL', () => {
    expect(currentVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(currentVideoId('https://www.youtube.com/watch?list=X&v=abc123&t=5')).toBe('abc123')
  })

  it('returns null off a watch page', () => {
    expect(currentVideoId('https://www.youtube.com/@MrBeast')).toBeNull()
    expect(currentVideoId('https://www.youtube.com/')).toBeNull()
  })
})

describe('scrapeCreator after a SPA navigation', () => {
  // The regression this file exists for. YouTube never rewrites the inline
  // bootstrap script when navigating between videos, so it still describes the
  // video the tab opened on. Trusting it here paid the wrong creator.
  it('reads the creator the viewer is watching, not the one the tab opened on', () => {
    renderBootstrapScript(bootstrapFor(VIDEO_A, 'First Creator', '@firstcreator'))
    renderOwner('Second Creator', '@secondcreator')

    const creator = scrapeCreator(VIDEO_B)

    expect(creator).toMatchObject({
      handle: '@secondcreator',
      displayName: 'Second Creator',
      videoId: VIDEO_B,
    })
  })

  it('discards bootstrap data belonging to a different video', () => {
    // No DOM owner at all, so the only candidate is the stale blob. Returning
    // nothing is correct: the caller re-scrapes on click.
    renderBootstrapScript(bootstrapFor(VIDEO_A, 'First Creator', '@firstcreator'))

    expect(scrapeCreator(VIDEO_B)).toBeNull()
  })

  it('discards bootstrap data that cannot prove which video it describes', () => {
    renderBootstrapScript({ contents: { note: 'no currentVideoEndpoint here' } })

    expect(scrapeCreator(VIDEO_A)).toBeNull()
  })
})

describe('scrapeCreator from the DOM', () => {
  it('takes the channel-name link rather than the textless avatar link', () => {
    renderOwner('Marques Brownlee', '@mkbhd')

    expect(scrapeCreator(VIDEO_A)).toMatchObject({
      handle: '@mkbhd',
      displayName: 'Marques Brownlee',
    })
  })

  it('treats a placeholder src as no picture at all', () => {
    // YouTube mounts the <img> before it has anything to put in it. A blank
    // where a face belongs is worse than the initials fallback.
    renderOwner('MKBHD', '@mkbhd', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=')
    expect(scrapeCreator(VIDEO_A)?.avatarUrl).toBeNull()

    renderOwner('MKBHD', '@mkbhd', '')
    expect(scrapeCreator(VIDEO_A)?.avatarUrl).toBeNull()
  })

  it('carries the avatar through, so the composer can show a picture', () => {
    renderOwner('Marques Brownlee', '@mkbhd', 'https://yt3.example/mkbhd.jpg')

    expect(scrapeCreator(VIDEO_A)?.avatarUrl).toBe('https://yt3.example/mkbhd.jpg')
  })

  it('lowercases the handle so it matches the backend key', () => {
    renderOwner('MrBeast', '@MrBeast')

    expect(scrapeCreator(VIDEO_A)?.handle).toBe('@mrbeast')
  })

  it('returns null when the owner section has no channel link', () => {
    document.body.innerHTML = '<ytd-video-owner-renderer><span>Loading</span></ytd-video-owner-renderer>'

    expect(scrapeCreator(VIDEO_A)).toBeNull()
  })
})

describe('scrapeCreator bootstrap fallback', () => {
  it('uses bootstrap data when it matches the video and the DOM has not rendered', () => {
    renderBootstrapScript(bootstrapFor(VIDEO_A, 'First Creator', '@firstcreator'))

    expect(scrapeCreator(VIDEO_A)).toMatchObject({
      handle: '@firstcreator',
      displayName: 'First Creator',
      videoId: VIDEO_A,
    })
  })

  it('ignores window.ytInitialData, which an isolated world can never see', () => {
    // Setting it proves the code does not read it: a content script's `window`
    // is not the page's, so any value here would be a lie in production.
    ;(window as typeof window & { ytInitialData?: unknown }).ytInitialData = bootstrapFor(
      VIDEO_A,
      'Page World Creator',
      '@pageworld',
    )

    expect(scrapeCreator(VIDEO_A)).toBeNull()
    delete (window as typeof window & { ytInitialData?: unknown }).ytInitialData
  })

  it('accepts an explicitly supplied blob only when the video matches', () => {
    const forA = bootstrapFor(VIDEO_A, 'First Creator', '@firstcreator')

    expect(scrapeCreator(VIDEO_A, forA)).toMatchObject({ handle: '@firstcreator' })
    expect(scrapeCreator(VIDEO_B, forA)).toBeNull()
  })

  it('returns null when there is nothing to read at all', () => {
    expect(scrapeCreator(VIDEO_A)).toBeNull()
  })
})
