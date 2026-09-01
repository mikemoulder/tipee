import arcLogo from './arc-logo.png'

/** The Arc mark on its own, for anywhere an image is wanted rather than markup. */
export const ARC_LOGO = arcLogo

/**
 * The network chip: Arc's mark plus the name of the network in words.
 *
 * The mark is `alt=""` and the text carries the meaning, so a screen reader
 * hears "Arc testnet" once rather than a filename and then the label. The
 * network is spelled out everywhere it appears — a logo alone does not tell
 * someone their funds are about to move on a test chain.
 */
export function arcMark(): string {
  return `<span class="arc-chip"><img class="arc-mark" src="${arcLogo}" alt="" />Arc testnet</span>`
}
