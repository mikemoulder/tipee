/**
 * What this wallet knows about its own tips.
 *
 * A `Transfer` log says an amount moved to an address. It cannot say that the
 * address is a creator's escrow, or which creator — that mapping lives in the
 * backend, and the escrow addresses themselves are deliberately anonymous
 * on-chain. So the extension keeps its own note when it sends one, and the
 * activity list reads "Tipped @creator" instead of "Sent 0x1f98…f984".
 *
 * It is a label, never a ledger. The chain remains the record of what happened:
 * nothing here is trusted for amounts or existence, an entry with no matching
 * transfer never appears on screen, and a wallet restored from its seed phrase
 * on another machine still shows every tip — just without the names.
 */

const KEY = 'tipee.tips.v1'

/**
 * How many notes to keep. The list shows twenty, and the window a scan can see
 * holds far fewer than this; the cap exists so a heavy tipper cannot grow
 * `chrome.storage.local` without bound.
 */
export const JOURNAL_LIMIT = 200

export interface TipRecord {
  txHash: `0x${string}`
  /** Normalised `@handle`, as scraped. */
  handle: string
  displayName: string
  /** The escrow that received it. */
  recipient: `0x${string}`
  /** Accounting units as a decimal string — `chrome.storage` cannot hold a bigint. */
  amount: string
  /** Epoch milliseconds, taken when the transaction was accepted. */
  at: number
}

/** Notes a sent tip. Failing to write one must never fail the tip itself. */
export async function recordTip(record: TipRecord): Promise<void> {
  try {
    const kept = [record, ...(await tipRecords()).filter((tip) => tip.txHash !== record.txHash)]
    await chrome.storage.local.set({ [KEY]: kept.slice(0, JOURNAL_LIMIT) })
  } catch {
    // The tip is already on-chain. A missing label is not worth an error.
  }
}

export async function tipRecords(): Promise<TipRecord[]> {
  try {
    const stored = (await chrome.storage.local.get(KEY))[KEY]
    return Array.isArray(stored) ? stored.filter(isTipRecord) : []
  } catch {
    return []
  }
}

/**
 * Notes keyed by both the transaction that carried them and the escrow they
 * paid. The hash is exact; the escrow covers a tip this browser did not send —
 * a second device, or one sent before an update — because an escrow address
 * belongs to one creator.
 */
export async function tipLabels(): Promise<{
  byHash: Map<string, TipRecord>
  byRecipient: Map<string, TipRecord>
}> {
  const byHash = new Map<string, TipRecord>()
  const byRecipient = new Map<string, TipRecord>()

  for (const tip of await tipRecords()) {
    byHash.set(tip.txHash.toLowerCase(), tip)
    if (!byRecipient.has(tip.recipient.toLowerCase())) {
      byRecipient.set(tip.recipient.toLowerCase(), tip)
    }
  }

  return { byHash, byRecipient }
}

/** Storage is writable by anything sharing this extension's origin, so it is checked. */
function isTipRecord(value: unknown): value is TipRecord {
  const tip = value as Partial<TipRecord> | null
  return (
    typeof tip?.txHash === 'string' &&
    typeof tip.handle === 'string' &&
    typeof tip.displayName === 'string' &&
    typeof tip.recipient === 'string' &&
    typeof tip.amount === 'string' &&
    typeof tip.at === 'number'
  )
}
