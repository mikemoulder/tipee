import { describe, expect, it, vi } from 'vitest'

import { ChannelLookupError, ChannelNotFoundError, resolveChannel } from './youtube.ts'

const CHANNEL = 'UCsBjURrPoezykLs9EqgamOA'

function page(overrides: { id?: string; title?: string; image?: string } = {}): string {
  return `
    <!doctype html><html><head>
      <meta itemprop="identifier" content="${overrides.id ?? CHANNEL}">
      <meta property="og:title" content="${overrides.title ?? 'Fireship'}">
      <meta property="og:image" content="${overrides.image ?? 'https://yt3.googleusercontent.com/abc=s900'}">
    </head><body></body></html>`
}

function respondWith(html: string, status = 200): typeof fetch {
  return vi.fn(async () => ({ ok: status < 400, status, text: async () => html })) as unknown as typeof fetch
}

describe('resolving a handle to a channel', () => {
  it('reads the channel ID, name and avatar from the channel page', async () => {
    const channel = await resolveChannel('@fireship', respondWith(page()))

    expect(channel).toEqual({
      channelId: CHANNEL,
      handle: '@fireship',
      displayName: 'Fireship',
      avatarUrl: 'https://yt3.googleusercontent.com/abc=s900',
    })
  })

  it('asks YouTube itself rather than trusting the caller', async () => {
    // The whole point of resolving server-side: a client could claim any
    // channel ID it liked and be paid somebody else's tips.
    const fetchImpl = respondWith(page())
    await resolveChannel('fireship', fetchImpl)

    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe('https://www.youtube.com/%40fireship')
  })

  it('finds the ID in the shapes YouTube actually serves', async () => {
    const canonical = `<link rel="canonical" href="https://www.youtube.com/channel/${CHANNEL}">`
    const bootstrap = `<script>var ytInitialData = {"externalId":"${CHANNEL}"};</script>`

    expect((await resolveChannel('@creator', respondWith(canonical))).channelId).toBe(CHANNEL)
    expect((await resolveChannel('@creator', respondWith(bootstrap))).channelId).toBe(CHANNEL)
  })

  it('refuses an avatar hosted anywhere but YouTube', async () => {
    // It ends up in an `<img src>` in the composer, so an attacker-controlled
    // URL would watch every tip that gets composed.
    const evil = page({ image: 'https://tracker.example.com/pixel.png' })
    expect((await resolveChannel('@creator', respondWith(evil))).avatarUrl).toBeNull()
  })

  it('falls back to the handle when the page has no title', async () => {
    const bare = `<meta itemprop="identifier" content="${CHANNEL}">`
    expect((await resolveChannel('@quiet', respondWith(bare))).displayName).toBe('@quiet')
  })

  it('unescapes a name that came through as HTML entities', async () => {
    const amped = page({ title: 'Rock &amp; Roll' })
    expect((await resolveChannel('@creator', respondWith(amped))).displayName).toBe('Rock & Roll')
  })

  it('says not found for a handle YouTube does not have', async () => {
    await expect(resolveChannel('@nobody', respondWith('', 404))).rejects.toBeInstanceOf(
      ChannelNotFoundError,
    )
  })

  it('says not found when the page carries no channel ID at all', async () => {
    // A consent interstitial, or a redirect to something that is not a channel.
    await expect(resolveChannel('@creator', respondWith('<html>cookies?</html>'))).rejects.toBeInstanceOf(
      ChannelNotFoundError,
    )
  })

  it('separates "no such channel" from "could not ask"', async () => {
    // One is an answer about the creator; the other is our problem, and the
    // difference decides whether a gifter should try again.
    const offline = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch

    await expect(resolveChannel('@creator', offline)).rejects.toBeInstanceOf(ChannelLookupError)
    await expect(resolveChannel('@creator', respondWith('', 500))).rejects.toBeInstanceOf(ChannelLookupError)
  })

  it('rejects something that is not a handle before asking anyone', async () => {
    const fetchImpl = respondWith(page())
    await expect(resolveChannel('   ', fetchImpl)).rejects.toBeInstanceOf(ChannelNotFoundError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
