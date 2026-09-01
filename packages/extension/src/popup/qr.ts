import qrcode from 'qrcode-generator'

/** The three position markers, seven modules square, one per corner but bottom-right. */
const FINDER = 7

/**
 * Dot radius, in modules.
 *
 * Not a free choice. Below about 0.5 the gaps between neighbouring dots grow
 * wide enough that decoders stop recognising runs of dark modules, and the code
 * fails outright — 0.42 looked the tidiest and did not scan at all. 0.55 keeps
 * adjacent dots touching while still reading as dots.
 */
const DOT = 0.55

export interface QrOptions {
  /** Image drawn in the middle. Its space is cleared out of the matrix. */
  logo?: string
}

/**
 * Renders `value` as a QR code.
 *
 * Drawn module by module rather than through the library's own SVG helper, so
 * the shapes and colours are ours: dots for data, concentric rings for the
 * corner markers, and a hole in the middle for a network logo. That styling is
 * cosmetic — the matrix underneath is untouched, and a scanner reads dots and
 * squares alike.
 *
 * Encoding stays with the library on purpose. A wallet address that scans wrong
 * is money sent nowhere, and it looks perfectly fine on screen; hand-rolling
 * Reed–Solomon to save 10 KB would trade a real risk for a small one.
 */
export function qrSvg(value: string, options: QrOptions = {}): string {
  // Always 'H', the 30% recovery level, even with no logo to make room for.
  // Round modules are the cost: at 'M' a dotted code decodes unreliably, and at
  // 'H' the same code reads with margin to spare. Verified by rasterising this
  // renderer's output and decoding it — not by eye, since a QR that looks right
  // and scans wrong is money sent nowhere.
  const code = qrcode(0, 'H')
  code.addData(value)
  code.make()

  const count = code.getModuleCount()
  const quiet = 2
  const size = count + quiet * 2
  const centre = (count - 1) / 2
  // ~7% of the code's area, well inside what 'H' can lose and still read.
  const hole = options.logo ? Math.ceil(count * 0.11) : -1

  const dots: string[] = []
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (!code.isDark(row, column)) continue
      if (isFinder(row, column, count)) continue
      if (hole >= 0 && Math.abs(row - centre) <= hole && Math.abs(column - centre) <= hole) continue
      dots.push(`<circle cx="${column + quiet + 0.5}" cy="${row + quiet + 0.5}" r="${DOT}"/>`)
    }
  }

  const markers = [
    [quiet, quiet],
    [quiet + count - FINDER, quiet],
    [quiet, quiet + count - FINDER],
  ]
    .map(([x, y]) => {
      const cx = (x ?? 0) + FINDER / 2
      const cy = (y ?? 0) + FINDER / 2
      return [
        `<circle cx="${cx}" cy="${cy}" r="2.9" fill="none" stroke="var(--ink)" stroke-width="1"/>`,
        `<circle cx="${cx}" cy="${cy}" r="1.45" fill="var(--ink)"/>`,
      ].join('')
    })
    .join('')

  return [
    `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="Wallet address QR code">`,
    `<rect width="${size}" height="${size}" fill="var(--card)"/>`,
    `<g fill="var(--ink)">${dots.join('')}</g>`,
    markers,
    options.logo ? logoTag(options.logo, quiet + centre + 0.5, hole) : '',
    '</svg>',
  ].join('')
}

function isFinder(row: number, column: number, count: number): boolean {
  const near = (value: number): boolean => value < FINDER
  const far = (value: number): boolean => value >= count - FINDER
  return (near(row) && near(column)) || (near(row) && far(column)) || (far(row) && near(column))
}

/**
 * The logo, on its own patch of background.
 *
 * The patch matters: the cleared modules leave a hole the same colour as the
 * page, and a logo with transparency dropped straight into it would read as
 * part of the code rather than as a mark sitting on top of it.
 */
function logoTag(href: string, centre: number, hole: number): string {
  const patch = hole * 2 + 1
  const logo = patch * 0.74
  return [
    `<rect x="${centre - patch / 2}" y="${centre - patch / 2}" width="${patch}" height="${patch}" rx="1.2" fill="var(--card)"/>`,
    `<image href="${href}" x="${centre - logo / 2}" y="${centre - logo / 2}" width="${logo}" height="${logo}" preserveAspectRatio="xMidYMid meet"/>`,
  ].join('')
}
