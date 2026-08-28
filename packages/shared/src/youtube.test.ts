import { describe, expect, it } from 'vitest'

import { isValidChannelId, normalizeHandle, parseChannelRef } from './youtube'

/** Real channel IDs, used so the 24-character shape is never accidentally loosened. */
const GOOGLE_DEVS = 'UC_x5XG1OV2P6uZZ5FSM9Ttw'
const MKBHD = 'UCBJycsmduvYEL83R_U4JriQ'

describe('isValidChannelId', () => {
  it('accepts UC plus 22 base64url characters', () => {
    expect(isValidChannelId(GOOGLE_DEVS)).toBe(true)
    expect(isValidChannelId(MKBHD)).toBe(true)
    expect(isValidChannelId('UC----------------------')).toBe(true)
  })

  it.each([
    ['UC_x5XG1OV2P6uZZ5FSM9Tt', 'one character short'],
    ['UC_x5XG1OV2P6uZZ5FSM9Ttww', 'one character long'],
    ['uc_x5XG1OV2P6uZZ5FSM9Ttw', 'lowercase prefix'],
    ['UA_x5XG1OV2P6uZZ5FSM9Ttw', 'wrong prefix'],
    ['UC_x5XG1OV2P6uZZ5FSM9Tt+', 'non-base64url character'],
    ['UC_x5XG1OV2P6uZZ5FSM9Tt ', 'trailing space'],
    ['@MrBeast', 'a handle'],
    ['', 'empty'],
  ])('rejects %j (%s)', (value) => {
    expect(isValidChannelId(value)).toBe(false)
  })

  it('rejects non-strings without throwing', () => {
    expect(isValidChannelId(null)).toBe(false)
    expect(isValidChannelId(undefined)).toBe(false)
    expect(isValidChannelId(42)).toBe(false)
    expect(isValidChannelId({ toString: () => GOOGLE_DEVS })).toBe(false)
  })
})

describe('normalizeHandle', () => {
  it('lowercases and prefixes, because YouTube resolves handles case-insensitively', () => {
    expect(normalizeHandle('@MrBeast')).toBe('@mrbeast')
    expect(normalizeHandle('MrBeast')).toBe('@mrbeast')
    expect(normalizeHandle('  @MrBeast  ')).toBe('@mrbeast')
    expect(normalizeHandle('@mrbeast')).toBe('@mrbeast')
  })

  it('is idempotent', () => {
    const once = normalizeHandle('@MrBeast')
    expect(once).not.toBeNull()
    expect(normalizeHandle(once as string)).toBe(once)
  })

  it('extracts the handle from a channel URL in any of its usual forms', () => {
    for (const input of [
      'https://www.youtube.com/@MrBeast',
      'http://www.youtube.com/@MrBeast',
      'HTTPS://WWW.YOUTUBE.COM/@MrBeast',
      '//www.youtube.com/@MrBeast',
      'www.youtube.com/@MrBeast',
      'youtube.com/@MrBeast',
      'm.youtube.com/@MrBeast',
      'music.youtube.com/@MrBeast',
      'https://www.youtube.com/@MrBeast/',
      'https://www.youtube.com/@MrBeast/videos',
      'https://www.youtube.com/@MrBeast?si=abc123',
    ]) {
      expect(normalizeHandle(input), input).toBe('@mrbeast')
    }
  })

  it('accepts the full character set YouTube allows', () => {
    expect(normalizeHandle('@some.creator_name-1')).toBe('@some.creator_name-1')
    expect(normalizeHandle('abc')).toBe('@abc')
    expect(normalizeHandle('a'.repeat(30))).toBe(`@${'a'.repeat(30)}`)
  })

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['@', 'sigil only'],
    ['ab', 'below three characters'],
    ['a'.repeat(31), 'above thirty characters'],
    ['@Mr Beast', 'internal space'],
    ['@Mr/Beast', 'slash'],
    ['@Mr!Beast', 'punctuation outside the allowed set'],
    ['@Mr+Beast', 'plus sign'],
  ])('rejects %j (%s)', (input) => {
    expect(normalizeHandle(input)).toBeNull()
  })

  it('returns null for URLs that are not handle URLs', () => {
    // parseChannelRef reports what these actually are; normalizeHandle only
    // claims to recognise handles.
    expect(normalizeHandle(`https://www.youtube.com/channel/${GOOGLE_DEVS}`)).toBeNull()
    expect(normalizeHandle('https://www.youtube.com/c/PewDiePie')).toBeNull()
    expect(normalizeHandle('https://www.youtube.com/user/PewDiePie')).toBeNull()
    expect(normalizeHandle('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(normalizeHandle('https://www.youtube.com/')).toBeNull()
  })

  it('does not read handles out of non-YouTube hosts', () => {
    expect(normalizeHandle('https://example.com/@MrBeast')).toBeNull()
    // Suffix confusion: the host ends in something that merely contains the
    // YouTube domain. Matching on a substring here would let any site claim to
    // be a channel page.
    expect(normalizeHandle('https://youtube.com.evil.example/@MrBeast')).toBeNull()
    expect(normalizeHandle('https://notyoutube.com/@MrBeast')).toBeNull()
  })

  it('rejects non-strings without throwing', () => {
    expect(normalizeHandle(null as unknown as string)).toBeNull()
    expect(normalizeHandle(undefined as unknown as string)).toBeNull()
    expect(normalizeHandle(42 as unknown as string)).toBeNull()
  })
})

describe('parseChannelRef', () => {
  it('reads a bare handle', () => {
    expect(parseChannelRef('@MrBeast')).toEqual({ kind: 'handle', handle: '@mrbeast' })
    expect(parseChannelRef('MrBeast')).toEqual({ kind: 'handle', handle: '@mrbeast' })
  })

  it('reads a handle URL', () => {
    expect(parseChannelRef('https://www.youtube.com/@MrBeast/featured')).toEqual({
      kind: 'handle',
      handle: '@mrbeast',
    })
  })

  it('reads a bare channel ID as a channel ID, not a handle', () => {
    // A channel ID is 24 characters of [A-Za-z0-9._-], so it also satisfies the
    // handle pattern. The channel-ID check must come first, or every pasted
    // channel ID would be resolved as a (non-existent) handle.
    expect(parseChannelRef(GOOGLE_DEVS)).toEqual({ kind: 'channelId', channelId: GOOGLE_DEVS })
    expect(parseChannelRef(`  ${MKBHD}  `)).toEqual({ kind: 'channelId', channelId: MKBHD })
  })

  it('preserves channel-ID case', () => {
    // channelId is the wallet mapping key. Lowercasing it would map two
    // different creators onto the same escrow wallet.
    const ref = parseChannelRef(GOOGLE_DEVS)
    expect(ref).toMatchObject({ kind: 'channelId' })
    if (ref?.kind === 'channelId') expect(ref.channelId).toBe(GOOGLE_DEVS)
  })

  it('reads a /channel/ URL', () => {
    expect(parseChannelRef(`https://www.youtube.com/channel/${GOOGLE_DEVS}`)).toEqual({
      kind: 'channelId',
      channelId: GOOGLE_DEVS,
    })
    expect(parseChannelRef(`youtube.com/channel/${GOOGLE_DEVS}/videos`)).toEqual({
      kind: 'channelId',
      channelId: GOOGLE_DEVS,
    })
  })

  it('rejects a /channel/ URL whose ID is malformed', () => {
    expect(parseChannelRef('https://www.youtube.com/channel/nonsense')).toBeNull()
    expect(parseChannelRef('https://www.youtube.com/channel/')).toBeNull()
    expect(parseChannelRef('https://www.youtube.com/channel')).toBeNull()
  })

  it('reports legacy custom URLs for the server to resolve', () => {
    expect(parseChannelRef('https://www.youtube.com/c/PewDiePie')).toEqual({
      kind: 'legacy',
      path: 'c/PewDiePie',
    })
    expect(parseChannelRef('https://www.youtube.com/user/PewDiePie')).toEqual({
      kind: 'legacy',
      path: 'user/PewDiePie',
    })
  })

  it('rejects a legacy prefix with no name', () => {
    expect(parseChannelRef('https://www.youtube.com/c')).toBeNull()
    expect(parseChannelRef('https://www.youtube.com/user/')).toBeNull()
  })

  it('rejects YouTube URLs that are not channel references', () => {
    expect(parseChannelRef('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseChannelRef('https://www.youtube.com/feed/subscriptions')).toBeNull()
    expect(parseChannelRef('https://www.youtube.com/')).toBeNull()
    expect(parseChannelRef('https://youtu.be/dQw4w9WgXcQ')).toBeNull()
  })

  it('will not accept a channel reference from another host', () => {
    // Otherwise a link on any domain could be pasted into the claim form and
    // pass as proof of a channel.
    expect(parseChannelRef(`https://example.com/channel/${GOOGLE_DEVS}`)).toBeNull()
    expect(parseChannelRef('https://youtube.com.evil.example/@MrBeast')).toBeNull()
  })

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['not a channel at all', 'free text'],
    ['@', 'sigil only'],
    ['ab', 'too short for a handle'],
  ])('rejects %j (%s)', (input) => {
    expect(parseChannelRef(input)).toBeNull()
  })

  it('rejects non-strings without throwing', () => {
    expect(parseChannelRef(null as unknown as string)).toBeNull()
    expect(parseChannelRef(42 as unknown as string)).toBeNull()
  })
})
