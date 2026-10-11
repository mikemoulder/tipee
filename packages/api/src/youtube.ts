import { isValidChannelId, normalizeHandle } from '@tipee/shared'

/**
 * Turning a handle into the channel ID that owns it.
 *
 * This happens here and never in the extension. A handle is what a viewer can
 * see, but it is re-assignable — YouTube releases abandoned ones — and a client
 * could simply claim any channel ID it liked. Resolving server-side from the
 * channel page means the mapping comes from YouTube, can be corrected without
 * shipping an extension update, and cannot be forged by a caller who would like
 * their own escrow to receive somebody else's tips (idea.md §8).
 */
export interface ResolvedChannel {
  channelId: string
  handle: string
  displayName: string
  avatarUrl: string | null
}

export class ChannelNotFoundError extends Error {
  constructor(handle: string) {
    super(`No YouTube channel found for ${handle}.`)
    this.name = 'ChannelNotFoundError'
  }
}

export class ChannelLookupError extends Error {
  constructor(message = 'Could not reach YouTube to look up that channel.') {
    super(message)
    this.name = 'ChannelLookupError'
  }
}

const LOOKUP_TIMEOUT_MS = 8_000

export async function resolveChannel(
  rawHandle: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedChannel> {
  const handle = normalizeHandle(rawHandle)
  if (!handle) throw new ChannelNotFoundError(rawHandle)

  let response: Response
  try {
    response = await fetchImpl(`https://www.youtube.com/${encodeURIComponent(handle)}`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      headers: {
        // Without a browser-ish UA, YouTube serves a consent interstitial that
        // carries no channel identity at all.
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
      },
    })
  } catch {
    throw new ChannelLookupError()
  }

  if (response.status === 404) throw new ChannelNotFoundError(handle)
  if (!response.ok) throw new ChannelLookupError()

  let html: string
  try {
    html = await response.text()
  } catch {
    throw new ChannelLookupError()
  }

  const channelId = findChannelId(html)
  if (!channelId) throw new ChannelNotFoundError(handle)

  return {
    channelId,
    handle,
    displayName: findDisplayName(html) ?? handle,
    avatarUrl: findAvatar(html),
  }
}

/**
 * Three places the page states its own channel ID, in order of how hard they
 * are to spoof by putting text in a video title or description.
 */
function findChannelId(html: string): string | null {
  const patterns = [
    /<meta\s+itemprop="identifier"\s+content="(UC[\w-]{22})"/i,
    /<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/i,
    /"externalId"\s*:\s*"(UC[\w-]{22})"/,
    /"channelId"\s*:\s*"(UC[\w-]{22})"/,
  ]

  for (const pattern of patterns) {
    const found = pattern.exec(html)?.[1]
    if (found && isValidChannelId(found)) return found
  }

  return null
}

function findDisplayName(html: string): string | null {
  const name =
    /<meta\s+property="og:title"\s+content="([^"]{1,120})"/i.exec(html)?.[1] ??
    /<meta\s+name="title"\s+content="([^"]{1,120})"/i.exec(html)?.[1]
  return name ? decodeEntities(name) : null
}

function findAvatar(html: string): string | null {
  const url = /<meta\s+property="og:image"\s+content="(https:\/\/[^"]{1,300})"/i.exec(html)?.[1]
  if (!url) return null

  // Only YouTube's own image hosts. The value ends up in an `<img src>` in the
  // composer, so a URL from anywhere else is a page somebody else controls
  // watching every tip that gets composed.
  try {
    const host = new URL(url).hostname
    const allowed = host.endsWith('.ggpht.com') || host.endsWith('.googleusercontent.com')
    return allowed ? url : null
  } catch {
    return null
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
