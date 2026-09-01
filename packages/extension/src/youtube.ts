import { normalizeHandle, type ScrapedCreator } from '@tipee/shared'

const VIDEO_ID_RE = /[?&]v=([^&#]+)/

export function currentVideoId(url = window.location.href): string | null {
  const match = url.match(VIDEO_ID_RE)
  return match?.[1] ?? null
}

/**
 * Reads the creator of the video currently on screen.
 *
 * ## Why the DOM comes first
 *
 * YouTube is a single-page app. Navigating from one video to the next swaps the
 * DOM but leaves the inline `ytInitialData` bootstrap script exactly as it was
 * written at first page load — YouTube fetches the new video's data over XHR and
 * never rewrites that tag.
 *
 * So the script tag is a snapshot of whichever video the tab opened on, and
 * trusting it after a navigation attributes the tip to the *previously watched*
 * creator. Since SPA navigation is how people actually browse YouTube, that
 * misroutes nearly every tip after the first. The live DOM is the only source
 * that is correct after a navigation, so it is the one consulted first.
 *
 * The bootstrap data is kept only as a fallback for the narrow window where the
 * content script runs before the owner section has rendered — and even there it
 * is accepted only if it can be proven to describe this same video.
 */
export function scrapeCreator(videoId: string, root?: unknown): ScrapedCreator | null {
  const candidate = creatorFromDom() ?? findCreator(initialDataFor(videoId, root))
  if (!candidate) return null

  const handle = normalizeHandle(candidate.vanityChannelUrl ?? candidate.canonicalBaseUrl ?? '')
  if (!handle || !candidate.title) return null

  return {
    handle,
    displayName: candidate.title,
    avatarUrl: candidate.avatar?.thumbnails?.[0]?.url ?? null,
    videoId,
  }
}

/**
 * Returns the bootstrap blob only when it demonstrably describes `videoId`.
 *
 * Unprovable is treated as wrong. Failing closed costs nothing — the caller
 * re-scrapes when the button is clicked, by which point the DOM has rendered —
 * whereas failing open routes money to the wrong channel.
 */
function initialDataFor(videoId: string, root?: unknown): unknown {
  const data = root ?? readInitialData()
  return initialDataVideoId(data) === videoId ? data : null
}

/**
 * The video a bootstrap blob was generated for, via `currentVideoEndpoint`.
 * A plain search for any `videoId` key would match the recommendations rail, so
 * only this one specific path counts.
 */
function initialDataVideoId(data: unknown): string | null {
  const endpoint = readObject(readObject(data)?.currentVideoEndpoint)
  const watch = readObject(endpoint?.watchEndpoint)
  const id = watch?.videoId
  return typeof id === 'string' ? id : null
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

/**
 * `window.ytInitialData` is deliberately not consulted. MV3 content scripts run
 * in an isolated world with their own `window`, so the page's global is never
 * visible here — reading it would be dead code that silently always misses.
 * The inline script's text, on the other hand, is DOM, and DOM we can read.
 */
function readInitialData(): unknown {
  const script = Array.from(document.scripts).find((item) =>
    item.textContent?.includes('ytInitialData'),
  )
  const source = script?.textContent
  if (!source) return null

  const match = source.match(/ytInitialData\s*=\s*({[\s\S]*?});/)
  if (!match?.[1]) return null

  try {
    return JSON.parse(match[1]) as unknown
  } catch {
    return null
  }
}

interface CreatorCandidate {
  channelId?: string
  title?: string
  vanityChannelUrl?: string
  canonicalBaseUrl?: string
  avatar?: { thumbnails?: Array<{ url?: string }> }
}

/**
 * Reads the owner section of the watch page. This is the authoritative source
 * after a SPA navigation, so it also has to supply the avatar — otherwise the
 * composer would lose the profile picture on every navigated-to video.
 */
function creatorFromDom(): CreatorCandidate | null {
  const owner =
    document.querySelector('ytd-video-owner-renderer') ??
    document.querySelector('#owner') ??
    document

  // The owner section holds two links to the same channel: the avatar (first in
  // document order, no text) and the channel name. Taking whichever matches
  // first would yield the avatar and an empty display name, so scan for the
  // first link that carries both a usable handle and visible text.
  const link = Array.from(
    owner.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/@"], ytd-channel-name a, #channel-name a',
    ),
  ).find((anchor) => anchor.textContent?.trim() && normalizeHandle(anchor.href))

  const title = link?.textContent?.trim()
  if (!link || !title) return null

  const avatar = owner.querySelector<HTMLImageElement>(
    '#avatar img, img#img, yt-img-shadow img, yt-avatar-shape img',
  )
  const avatarUrl = pictureUrl(avatar?.src)

  return {
    title,
    canonicalBaseUrl: link.href,
    ...(avatarUrl ? { avatar: { thumbnails: [{ url: avatarUrl }] } } : {}),
  }
}

/**
 * An avatar `src`, but only if it is a real address.
 *
 * YouTube mounts the image element before it has a picture to put in it, so
 * early on the `src` is empty or a placeholder. Capturing one of those is worse
 * than capturing nothing: it looks like a successful read, and the composer
 * would show a blank where a face belongs rather than falling back to initials.
 */
function pictureUrl(value: string | undefined): string | null {
  if (!value) return null
  return value.startsWith('https://') || value.startsWith('http://') ? value : null
}

function findCreator(value: unknown): CreatorCandidate | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findCreator(item)
      if (match) return match
    }
    return null
  }

  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const candidate = record as CreatorCandidate
  if (
    typeof candidate.channelId === 'string' &&
    (typeof candidate.vanityChannelUrl === 'string' ||
      typeof candidate.canonicalBaseUrl === 'string') &&
    typeof candidate.title === 'string'
  ) {
    return candidate
  }

  const owner = record.videoOwnerRenderer
  if (typeof owner === 'object' && owner !== null) {
    const ownerRecord = owner as Record<string, unknown>
    const title = textValue(ownerRecord.title)
    const navigation = ownerRecord.navigationEndpoint
    const url = findString(navigation, 'url')
    const channelUrl = url ? toYouTubeUrl(url) : null
    if (title && channelUrl && normalizeHandle(channelUrl)) {
      return { title, canonicalBaseUrl: channelUrl }
    }
  }

  for (const child of Object.values(record)) {
    const match = findCreator(child)
    if (match) return match
  }
  return null
}

function toYouTubeUrl(value: string): string | null {
  if (value.startsWith('/@')) return `https://www.youtube.com${value}`
  return value || null
}

function textValue(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (Array.isArray(record.runs)) {
    const text = record.runs
      .map((run) =>
        typeof run === 'object' && run !== null ? (run as Record<string, unknown>).text : null,
      )
      .filter((item): item is string => typeof item === 'string')
      .join('')
    return text || null
  }
  return typeof record.simpleText === 'string' ? record.simpleText : null
}

function findString(value: unknown, key: string): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, key)
      if (found) return found
    }
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record[key] === 'string') return record[key]
  for (const child of Object.values(record)) {
    const found = findString(child, key)
    if (found) return found
  }
  return null
}
