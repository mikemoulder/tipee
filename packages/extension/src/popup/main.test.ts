// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'

import { ESCROW_CONTRACT_ID, RELAYER_ADDRESS } from '@tipee/shared'

import type { Movement } from '../chain/activity'
import { InsufficientFundsError, SendUnavailableError } from '../chain/simulate'
import { WalletLockedError, WalletWipedError } from '../wallet/keystore'

let shorten: (address: string) => string
let unlockMessage: (error: unknown) => string
let pickCheckIndexes: (total: number, count?: number, random?: () => number) => number[]
let coverageNote: (report: { source: 'chain'; scannedBlocks?: bigint; partial: boolean }) => string
let ageFromBlocks: (blocks: bigint) => string
let ageOf: (movement: Movement, head?: bigint, now?: Date) => string
let validateSendDraft: (draft: { to: string; amount: string }) =>
  | { ok: true; to: string; amount: bigint }
  | { ok: false; message: string }
let sendErrorMessage: (error: unknown) => string
let movementLabel: (
  movement: Movement,
  tip?: { handle: string; displayName: string },
) => { title: string; sub: string }
let seedWordsMatch: (
  mnemonic: string,
  answers: ReadonlyArray<{ index: number; word: string }>,
) => boolean

beforeAll(async () => {
  // The module boots on import and reads storage; without this it throws before
  // a single export is reachable.
  Object.assign(globalThis, {
    chrome: { storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } } },
  })
  document.body.innerHTML = '<main id="app"></main>'
  const popup = await import('./main')
  shorten = popup.shorten
  unlockMessage = popup.unlockMessage
  pickCheckIndexes = popup.pickCheckIndexes
  coverageNote = popup.coverageNote
  ageFromBlocks = popup.ageFromBlocks
  ageOf = popup.ageOf
  movementLabel = popup.movementLabel
  validateSendDraft = popup.validateSendDraft
  sendErrorMessage = popup.sendErrorMessage
  seedWordsMatch = popup.seedWordsMatch
})

describe('shortened addresses', () => {
  it('keeps both ends, which is what makes one recognisable', () => {
    expect(shorten('GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP')).toBe('GCQRAK…5YZP')
  })

  it('leaves anything already short alone', () => {
    expect(shorten('GABC')).toBe('GABC')
  })
})

describe('unlock failures', () => {
  it('says how long a locked wallet has to wait', () => {
    expect(unlockMessage(new WalletLockedError(4_200))).toBe('Too many attempts. Try again in 5s.')
  })

  it('says plainly when the wallet is gone', () => {
    expect(unlockMessage(new WalletWipedError())).toBe(
      'Too many wrong PINs. This wallet has been erased.',
    )
  })

  it('gives nothing away about the PIN for anything else', () => {
    // Never echo length, digits, or how close a guess was.
    for (const error of [new Error('boom'), 'nonsense', null]) {
      expect(unlockMessage(error)).toBe('That PIN is not correct.')
    }
  })
})

const PHRASE = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

describe('backup check words', () => {
  it('asks for three distinct positions inside the phrase', () => {
    for (let run = 0; run < 200; run += 1) {
      const indexes = pickCheckIndexes(12)
      expect(indexes).toHaveLength(3)
      expect(new Set(indexes).size).toBe(3)
      expect(indexes.every((index) => index >= 0 && index < 12)).toBe(true)
    }
  })

  it('asks in phrase order, so the owner reads down their list once', () => {
    const indexes = pickCheckIndexes(12)
    expect([...indexes].sort((left, right) => left - right)).toEqual(indexes)
  })

  it('never asks for more words than the phrase has', () => {
    expect(pickCheckIndexes(2)).toHaveLength(2)
  })

  it('draws from the whole phrase, not a fixed trio', () => {
    const seen = new Set<number>()
    for (let run = 0; run < 300; run += 1) for (const index of pickCheckIndexes(12)) seen.add(index)
    expect(seen.size).toBe(12)
  })

  it('follows the randomness it is given', () => {
    // 0 always takes the first of what remains: positions 1, 2, 3.
    expect(pickCheckIndexes(12, 3, () => 0)).toEqual([0, 1, 2])
  })
})

describe('backup check answers', () => {
  const at = (index: number) => ({ index, word: PHRASE.split(' ')[index] as string })

  it('accepts the words the phrase actually has', () => {
    expect(seedWordsMatch(PHRASE, [at(0), at(4), at(11)])).toBe(true)
  })

  it('forgives capitals and stray spaces, which are not backup errors', () => {
    expect(seedWordsMatch(PHRASE, [{ index: 0, word: '  Legal ' }, { index: 11, word: 'YELLOW' }])).toBe(
      true,
    )
  })

  it('rejects a wrong word even when the others are right', () => {
    expect(seedWordsMatch(PHRASE, [at(0), { index: 4, word: 'wrong' }, at(11)])).toBe(false)
  })

  it('rejects a word from the phrase that is in the wrong position', () => {
    // 'winner' is word 2, not word 1 — position is half of what is checked.
    expect(seedWordsMatch(PHRASE, [{ index: 0, word: 'winner' }])).toBe(false)
  })

  it('rejects blanks and an empty submission', () => {
    expect(seedWordsMatch(PHRASE, [{ index: 0, word: '   ' }])).toBe(false)
    expect(seedWordsMatch(PHRASE, [])).toBe(false)
  })

  it('rejects a position the phrase does not have', () => {
    expect(seedWordsMatch(PHRASE, [{ index: 99, word: 'legal' }])).toBe(false)
  })
})

describe('how far back the list looks', () => {
  it('says nothing when it does not know the window', () => {
    expect(coverageNote({ source: 'chain', partial: false })).toBe('')
  })

  // Stellar closes a ledger about every 5s, so 24,000 ledgers is ~33h.
  it('states the scan window in hours a person can hold', () => {
    expect(coverageNote({ source: 'chain', scannedBlocks: 24_000n, partial: false })).toBe('last ~33h')
  })

  it('says when an RPC cut the scan short of that', () => {
    // Otherwise a shortened window and a quiet wallet look the same, and an
    // older tip that is simply out of range reads as one that never happened.
    expect(coverageNote({ source: 'chain', scannedBlocks: 4_000n, partial: true })).toBe('last ~6h · cut short')
  })

  it('reads ledger distance as an approximate age', () => {
    expect(ageFromBlocks(0n)).toBe('just now')
    expect(ageFromBlocks(10n)).toBe('just now')
    expect(ageFromBlocks(120n)).toBe('~10m ago')
    expect(ageFromBlocks(4_000n)).toBe('~6h ago')
    expect(ageFromBlocks(70_000n)).toBe('~4d ago')
  })

  it('never rounds a real movement down to nothing', () => {
    // 20 ledgers is under two minutes; '0m ago' would read as broken.
    expect(ageFromBlocks(20n)).toBe('~2m ago')
  })
})

describe('the age on a row', () => {
  const now = new Date('2026-09-04T12:00:00Z')
  const row = (blockNumber: bigint, at?: Date): Movement => ({
    txHash: 'ab'.repeat(32),
    counterparty: 'GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP',
    amount: 1_000_000n,
    outgoing: false,
    blockNumber,
    ...(at ? { at } : {}),
  })

  it('uses the real timestamp when the source knew one', () => {
    expect(ageOf(row(10n, new Date('2026-09-04T09:00:00Z')), 20n, now)).toBe('3h ago')
  })

  it('estimates from block distance when it did not, and marks it as an estimate', () => {
    // The `~` is the difference between a measurement and an average.
    expect(ageOf(row(100n), 4_100n, now)).toBe('~6h ago')
  })

  it('says nothing rather than guessing with no head and no timestamp', () => {
    expect(ageOf(row(100n), undefined, now)).toBe('')
  })
})

describe('what a row says it is', () => {
  const THEM = 'GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP'
  const row = (outgoing: boolean, counterparty: string = THEM): Movement => ({
    txHash: 'ab'.repeat(32),
    counterparty,
    amount: 2_500_000n,
    outgoing,
    blockNumber: 10n,
  })

  it('names the creator when this wallet noted who it paid', () => {
    expect(movementLabel(row(true), { handle: '@mkbhd', displayName: 'Marques Brownlee' })).toEqual({
      title: 'Tipped @mkbhd',
      sub: 'Marques Brownlee',
    })
  })

  it('falls back to the address when a note has no display name', () => {
    expect(movementLabel(row(true), { handle: '@x', displayName: '' }).sub).toBe('GCQRAK…5YZP')
  })

  it('stays an honest unnamed row when there is no note', () => {
    // An escrow address says nothing about whose it is, and guessing at one
    // from the address alone would put a creator's name on a stranger's tip.
    expect(movementLabel(row(true))).toEqual({ title: 'Sent', sub: 'GCQRAK…5YZP' })
    expect(movementLabel(row(false))).toEqual({ title: 'Received', sub: 'GCQRAK…5YZP' })
  })

  it('reads an unnoted transfer into the escrow as a tip, without guessing whose', () => {
    expect(movementLabel(row(true, ESCROW_CONTRACT_ID))).toEqual({ title: 'Tipped a creator', sub: 'Tipee escrow' })
  })

  it('names faucet money as test USDC rather than a bare relayer address', () => {
    expect(movementLabel(row(false, RELAYER_ADDRESS))).toEqual({ title: 'Test USDC', sub: 'Tipee faucet' })
  })
})

describe('checking a send before the network is asked', () => {
  it('accepts an account and an amount', () => {
    const checked = validateSendDraft({ to: 'GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP', amount: '2.50' })
    expect(checked).toMatchObject({ ok: true, to: 'GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP', amount: 2_500_000n })
  })

  it('accepts a contract address, such as another Tipee wallet', () => {
    expect(validateSendDraft({ to: 'CALSZXYNONPSDJD4UCZO5PE2MO66NGUEHP2SR5ZLHVLZEBR2XSGAQWZ2', amount: '1' })).toMatchObject({ ok: true })
  })

  it('trims a pasted address', () => {
    expect(validateSendDraft({ to: `  GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP\n`, amount: '1' })).toMatchObject({ ok: true, to: 'GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP' })
  })

  it('rejects an address whose checksum does not match', () => {
    // One changed character: StrKey's checksum catches it.
    const typo = 'GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZQ'
    expect(validateSendDraft({ to: typo, amount: '1' })).toMatchObject({
      ok: false,
      message: 'That isn’t a valid Stellar address. Check for a typo.',
    })
  })

  it('says what an EVM address is, rather than just refusing it', () => {
    expect(validateSendDraft({ to: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', amount: '1' })).toMatchObject({
      ok: false,
      message: 'That’s an Ethereum-style address. Tipee sends on Stellar: G… or C….',
    })
  })

  it('refuses anything that is not an address, and a secret key above all', () => {
    expect(validateSendDraft({ to: '', amount: '1' })).toMatchObject({ ok: false })
    expect(validateSendDraft({ to: 'romeo*stellar.org', amount: '1' })).toMatchObject({ ok: false })
    expect(validateSendDraft({ to: 'SBGWSG6BTNCKCOB3DIFBGCVMUPQFYPA2G4O34RMTB343OYPXU5DJDVMN', amount: '1' })).toMatchObject({
      ok: false,
    })
  })

  it('refuses an amount that is not one', () => {
    const to = 'GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP'
    expect(validateSendDraft({ to, amount: '' })).toMatchObject({ ok: false })
    expect(validateSendDraft({ to, amount: 'lots' })).toMatchObject({ ok: false })
    expect(validateSendDraft({ to, amount: '0' })).toMatchObject({
      ok: false,
      message: 'Enter an amount to send.',
    })
  })
})

describe('why a send did not go', () => {
  it('says how far short the balance was', () => {
    expect(sendErrorMessage(new InsufficientFundsError(1_950n, 'Not enough USDC.'))).toBe(
      'Not enough USDC. Short by 0.00195 USDC.',
    )
  })

  it('passes through what the chain check found', () => {
    expect(sendErrorMessage(new SendUnavailableError('That account cannot receive USDC yet.'))).toBe(
      'That account cannot receive USDC yet.',
    )
  })

  it('never shows a raw error to somebody moving money', () => {
    expect(sendErrorMessage(new Error('TransactionExecutionError: 0xdeadbeef'))).toBe(
      'The transfer could not be sent.',
    )
  })
})
