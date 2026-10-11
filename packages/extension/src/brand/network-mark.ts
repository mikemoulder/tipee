/**
 * The network chip. A plain orbit mark rather than anyone's logo: what matters
 * is the words beside it, "Stellar testnet", which say where funds move.
 */
const MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#111"/>' +
  '<ellipse cx="12" cy="12" rx="8" ry="3.4" fill="none" stroke="#fff" stroke-width="1.6" transform="rotate(-24 12 12)"/>' +
  '<circle cx="12" cy="12" r="2.6" fill="#fff"/></svg>'

/** The mark on its own, for anywhere an image is wanted rather than markup. */
export const NETWORK_LOGO = `data:image/svg+xml,${encodeURIComponent(MARK_SVG)}`

export const NETWORK_NAME = 'Stellar testnet'

/**
 * The mark plus the network in words. The mark is `alt=""` and the text
 * carries the meaning, so a screen reader hears "Stellar testnet" once.
 */
export function networkMark(): string {
  return `<span class="arc-chip"><img class="arc-mark" src="${NETWORK_LOGO}" alt="" />${NETWORK_NAME}</span>`
}

/** The mark alone, for the top bar; the label carries the name. */
export function networkBadge(): string {
  return `<span class="arc-badge" role="img" aria-label="${NETWORK_NAME}" title="${NETWORK_NAME}"><img class="arc-mark" src="${NETWORK_LOGO}" alt="" /></span>`
}
