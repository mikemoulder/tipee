/**
 * YouTube identity parsing.
 *
 * Two identifiers matter, and conflating them is the impersonation bug in
 * idea.md §11:
 *
 * - **channelId** (`UCxxx…`) is immutable. It is the only safe key for a
 *   wallet mapping, and the only thing a verification token may be bound to.
 * - **handle** (`@name`) is mutable and re-assignable. Someone can acquire a
 *   handle another creator gave up, so a handle alone must never authorise
 *   anything or route funds.
 *
 * Handles are stored lowercased because YouTube resolves them
 * case-insensitively. Display names are kept separately and verbatim.
 */

/** `UC` plus 22 base64url characters. */
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/

/** YouTube allows 3–30 characters: letters, digits, underscore, hyphen, period. */
const HANDLE_RE = /^[A-Za-z0-9._-]{3,30}$/

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
])

export function isValidChannelId(value: unknown): value is string {
  return typeof value === 'string' && CHANNEL_ID_RE.test(value)
}

/**
 * Normalises any way a user might express a handle into `@lowercase` form.
 * Returns `null` when the input is not a handle — including channel-ID URLs
 * and legacy `/c/` or `/user/` paths, which `parseChannelRef` reports instead.
 */
export function normalizeHandle(input: string): string | null {
  if (typeof input !== 'string') return null

  let candidate = input.trim()
  if (candidate === '') return null

  // Pull the handle segment out of a URL, if that is what we were given.
  const fromUrl = extractPathSegments(candidate)
  if (fromUrl !== null) {
    const first = fromUrl[0]
    if (first === undefined || !first.startsWith('@')) return null
    candidate = first
  }

  if (candidate.startsWith('@')) candidate = candidate.slice(1)
  if (!HANDLE_RE.test(candidate)) return null

  return `@${candidate.toLowerCase()}`
}

export type ChannelRef =
  | { kind: 'handle'; handle: string }
  | { kind: 'channelId'; channelId: string }
  /** Legacy `/c/Name` or `/user/Name`. Only the server can resolve these. */
  | { kind: 'legacy'; path: string }

/**
 * Interprets whatever a creator pastes into the claim form — a bare handle, a
 * full channel URL, a channel ID, or a legacy custom URL.
 */
export function parseChannelRef(input: string): ChannelRef | null {
  if (typeof input !== 'string') return null

  const trimmed = input.trim()
  if (trimmed === '') return null

  const segments = extractPathSegments(trimmed)

  if (segments === null) {
    // Not a URL: either a bare channel ID or a bare handle.
    if (isValidChannelId(trimmed)) return { kind: 'channelId', channelId: trimmed }
    const handle = normalizeHandle(trimmed)
    return handle === null ? null : { kind: 'handle', handle }
  }

  const [first, second] = segments

  if (first === undefined) return null

  if (first.startsWith('@')) {
    const handle = normalizeHandle(first)
    return handle === null ? null : { kind: 'handle', handle }
  }

  if (first === 'channel') {
    return second !== undefined && isValidChannelId(second)
      ? { kind: 'channelId', channelId: second }
      : null
  }

  if (first === 'c' || first === 'user') {
    return second !== undefined && second !== ''
      ? { kind: 'legacy', path: `${first}/${second}` }
      : null
  }

  return null
}

/**
 * Returns the path segments of a YouTube URL, or `null` if the input is not a
 * URL at all. A URL on a non-YouTube host returns an empty array, so callers
 * treat it as unrecognised rather than as a bare handle.
 */
function extractPathSegments(input: string): string[] | null {
  const looksLikeUrl = /^(https?:)?\/\//i.test(input) || /^[\w.-]+\.[a-z]{2,}\//i.test(input)
  if (!looksLikeUrl) return null

  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input.replace(/^\/\//, '')}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }

  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return []

  return url.pathname.split('/').filter((segment) => segment !== '')
}
