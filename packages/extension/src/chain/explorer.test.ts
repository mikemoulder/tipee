import { afterEach, describe, expect, it, vi } from 'vitest'

import { USDC_ADDRESS } from './arc'
import { ExplorerUnavailableError, explorerMovements } from './explorer'

const ME = '0x742d35cc6634c0532925a3b844bc454e4438f44e' as const
const THEM = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' as const
const TX = `0x${'ab'.repeat(32)}`

/** One row shaped the way Blockscout's `token-transfers` answers. */
function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    block_number: 60_385_561,
    transaction_hash: TX,
    log_index: 0,
    timestamp: '2026-09-04T08:52:24.000000Z',
    from: { hash: THEM },
    to: { hash: ME },
    token: { address_hash: USDC_ADDRESS, symbol: 'USDC', decimals: '6' },
    total: { value: '152210', decimals: '6' },
    ...overrides,
  }
}

function respond(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      json: async () => body,
    })),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('reading history from the explorer', () => {
  it('turns a page of transfers into movements', async () => {
    respond({ items: [item()] })

    const [movement] = await explorerMovements(ME)
    expect(movement).toMatchObject({
      txHash: TX,
      counterparty: THEM,
      amount: 152_210n,
      outgoing: false,
      blockNumber: 60_385_561n,
    })
    expect(movement?.at?.toISOString()).toBe('2026-09-04T08:52:24.000Z')
  })

  it('asks only for USDC, on the wallet being viewed', async () => {
    respond({ items: [] })
    await explorerMovements(ME)

    const url = String(vi.mocked(fetch).mock.calls[0]?.[0])
    expect(url).toContain(`/addresses/${ME}/token-transfers`)
    expect(url).toContain(`token=${USDC_ADDRESS}`)
  })

  it('reads direction from the wallet, whatever case the explorer used', async () => {
    respond({ items: [item({ from: { hash: ME.toUpperCase().replace('0X', '0x') }, to: { hash: THEM } })] })

    const [movement] = await explorerMovements(ME)
    expect(movement).toMatchObject({ outgoing: true, counterparty: THEM })
  })

  it('drops a row for any other token', async () => {
    // The query is filtered, but this is somebody else's server. A row for
    // another token rendered with USDC's decimals is a 10^12 error in what
    // somebody reads as dollars.
    respond({
      items: [item({ token: { address_hash: '0x' + '11'.repeat(20), decimals: '18' }, total: { value: '1', decimals: '18' } })],
    })

    expect(await explorerMovements(ME)).toEqual([])
  })

  it('drops a USDC row that claims the wrong decimals', async () => {
    respond({ items: [item({ total: { value: '1000', decimals: '18' } })] })
    expect(await explorerMovements(ME)).toEqual([])
  })

  it('drops rows that are malformed rather than guessing at them', async () => {
    respond({
      items: [
        item({ from: { hash: 'not-an-address' } }),
        item({ transaction_hash: '0xtooshort' }),
        item({ total: { value: '-5', decimals: '6' } }),
        item({ total: { value: '12.5', decimals: '6' } }),
      ],
    })

    expect(await explorerMovements(ME)).toEqual([])
  })

  it('keeps a row whose timestamp is missing or unreadable, without an age', async () => {
    respond({ items: [item({ timestamp: 'yesterday-ish' }), item({ timestamp: undefined })] })

    const movements = await explorerMovements(ME)
    expect(movements).toHaveLength(2)
    expect(movements.every((movement) => movement.at === undefined)).toBe(true)
  })

  it('honours the limit', async () => {
    respond({ items: [item(), item(), item()] })
    expect(await explorerMovements(ME, 2)).toHaveLength(2)
  })

  it('raises when the explorer cannot be used, so the caller falls back', async () => {
    respond({ items: [] }, false)
    await expect(explorerMovements(ME)).rejects.toBeInstanceOf(ExplorerUnavailableError)

    respond({ error: 'nope' })
    await expect(explorerMovements(ME)).rejects.toBeInstanceOf(ExplorerUnavailableError)

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new Error('not json') } })))
    await expect(explorerMovements(ME)).rejects.toBeInstanceOf(ExplorerUnavailableError)

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(explorerMovements(ME)).rejects.toBeInstanceOf(ExplorerUnavailableError)
  })
})
