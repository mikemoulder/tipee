import { normalizeHandle, type ScrapedCreator } from '@tipee/shared'

const VIDEO_ID_RE = /[?&]v=([^&#]+)/

export function currentVideoId(url = window.location.href): string | null {
  const match = url.match(VIDEO_ID_RE)
  return match?.[1] ?? null
}

export function scrapeCreator(videoId: string, root?: unknown): ScrapedCreator | null {
  const candidate = findCreator(root ?? readInitialData()) ?? creatorFromDom()
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

function readInitialData(): unknown {
  const page = window as typeof window & { ytInitialData?: unknown }
  if (page.ytInitialData) return page.ytInitialData

  const script = Array.from(document.scripts).find((item) => item.textContent?.includes('ytInitialData'))
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

function creatorFromDom(): CreatorCandidate | null {
  const link = document.querySelector<HTMLAnchorElement>(
    'ytd-video-owner-renderer a[href*="/@"], ytd-channel-name a, #owner a[href*="/@"]',
  )
  const handleUrl = link?.href ?? ''
  const title = link?.textContent?.trim()
  if (!title || !normalizeHandle(handleUrl)) return null

  return { title, canonicalBaseUrl: handleUrl }
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
    (typeof candidate.vanityChannelUrl === 'string' || typeof candidate.canonicalBaseUrl === 'string') &&
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
      .map((run) => (typeof run === 'object' && run !== null ? (run as Record<string, unknown>).text : null))
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
