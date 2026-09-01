import qrcode from 'qrcode-generator'
import { describe, expect, it } from 'vitest'

import { qrSvg } from './qr'

const ADDRESS = '0x742d35cc6634c0532925a3b844bc454e4438f44e'
const OTHER = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'
const FINDER = 7

/** The matrix the renderer is drawing, rebuilt independently. */
function matrix(value: string): { count: number; dark: (row: number, column: number) => boolean } {
  const code = qrcode(0, 'H')
  code.addData(value)
  code.make()
  return { count: code.getModuleCount(), dark: (row, column) => code.isDark(row, column) }
}

function dots(svg: string): Array<{ cx: number; cy: number; r: number }> {
  return [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>/g)].map((match) => ({
    cx: Number(match[1]),
    cy: Number(match[2]),
    r: Number(match[3]),
  }))
}

describe('the deposit QR', () => {
  it('draws every data module the matrix says is dark', () => {
    // The dots are decoration; the matrix is the payload. If clipping for the
    // finders or the logo ever eats a module it should not, the code silently
    // stops meaning the address it claims to.
    const { count, dark } = matrix(ADDRESS)
    const isFinder = (row: number, column: number): boolean => {
      const near = (value: number): boolean => value < FINDER
      const far = (value: number): boolean => value >= count - FINDER
      return (near(row) && near(column)) || (near(row) && far(column)) || (far(row) && near(column))
    }

    let expected = 0
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (dark(row, column) && !isFinder(row, column)) expected += 1
      }
    }

    expect(dots(qrSvg(ADDRESS))).toHaveLength(expected)
  })

  it('keeps the dots large enough to decode', () => {
    // Measured, not chosen: below ~0.5 modules the gaps between neighbours grow
    // wide enough that decoders fail outright. 0.42 looked tidier and did not
    // scan at all.
    for (const dot of dots(qrSvg(ADDRESS))) {
      expect(dot.r).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('puts a marker ring in three corners and not the fourth', () => {
    const svg = qrSvg(ADDRESS)
    expect([...svg.matchAll(/stroke-width="1"/g)]).toHaveLength(3)
  })

  it('clears space for a logo and puts it in the middle', () => {
    const { count } = matrix(ADDRESS)
    const plain = dots(qrSvg(ADDRESS)).length
    const withLogo = qrSvg(ADDRESS, { logo: 'asset.png' })

    expect(dots(withLogo).length).toBeLessThan(plain)
    expect(withLogo).toContain('<image href="asset.png"')

    // The hole stays a small share of the code, well inside what 'H' recovers.
    const cleared = plain - dots(withLogo).length
    expect(cleared / (count * count)).toBeLessThan(0.12)
  })

  it('encodes what it was given', () => {
    // A QR that renders but encodes the wrong thing looks perfectly fine.
    expect(qrSvg(ADDRESS)).not.toBe(qrSvg(OTHER))
    expect(qrSvg(ADDRESS)).toBe(qrSvg(ADDRESS))
  })

  it('leaves a quiet zone, without which scanners miss it', () => {
    const svg = qrSvg(ADDRESS)
    const { count } = matrix(ADDRESS)

    expect(svg).toContain(`viewBox="0 0 ${count + 4} ${count + 4}"`)
    for (const dot of dots(svg)) {
      expect(dot.cx).toBeGreaterThan(2)
      expect(dot.cy).toBeGreaterThan(2)
    }
  })

  it('takes its colours from the stylesheet rather than baking them in', () => {
    expect(qrSvg(ADDRESS)).toContain('var(--ink)')
    expect(qrSvg(ADDRESS)).toContain('var(--card)')
  })
})
