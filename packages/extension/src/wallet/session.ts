import { unlockWallet } from './keystore'

/**
 * Staying unlocked, the way every wallet people already use behaves.
 *
 * The seed sits in `chrome.storage.session`, which is memory-backed and is
 * dropped when the browser closes — it is never written to disk, and a content
 * script cannot read it (session storage is trusted-contexts only by default).
 * What it buys is that a PIN is typed once per browsing session instead of once
 * per transaction.
 *
 * What it costs is real and worth stating: while a wallet is unlocked, anything
 * that can reach an extension page can sign without knowing the PIN. That is
 * the same bargain MetaMask and OKX strike, and like them the bargain is the
 * owner's to set — `UNLOCK_POLICY` decides whether a session is kept until the
 * browser closes, expires after a quiet spell, or is refused entirely so that
 * every signature needs the PIN again.
 *
 * This replaces the "no session cache, PIN per tip" rule in plan.md, by
 * decision.
 */

const SEED_KEY = 'tipee.session.seed.v1'
const TOUCHED_KEY = 'tipee.session.touched.v1'
const POLICY_KEY = 'tipee.unlockPolicy.v1'

/** How long a `timeout` session survives without being used. */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1_000

export type UnlockPolicy = 'session' | 'timeout' | 'always'

export const UNLOCK_POLICIES: ReadonlyArray<{ value: UnlockPolicy; label: string; detail: string }> = [
  { value: 'session', label: 'Until the browser closes', detail: 'Unlock once, then send without a PIN.' },
  { value: 'timeout', label: 'After 15 minutes idle', detail: 'Locks itself when the wallet sits unused.' },
  { value: 'always', label: 'Every transaction', detail: 'A PIN for every signature. Safest, slowest.' },
]

export async function unlockPolicy(): Promise<UnlockPolicy> {
  try {
    const stored = (await chrome.storage.local.get(POLICY_KEY))[POLICY_KEY]
    return stored === 'timeout' || stored === 'always' ? stored : 'session'
  } catch {
    return 'session'
  }
}

export async function setUnlockPolicy(policy: UnlockPolicy): Promise<void> {
  await chrome.storage.local.set({ [POLICY_KEY]: policy })
  // Tightening the rule has to apply now, not at the next browser restart.
  if (policy === 'always') await lock()
}

/** Verifies the PIN and, unless the owner asked otherwise, keeps the wallet open. */
export async function unlock(pin: string): Promise<string> {
  const mnemonic = await unlockWallet(pin)

  if ((await unlockPolicy()) !== 'always') {
    try {
      await chrome.storage.session.set({ [SEED_KEY]: mnemonic, [TOUCHED_KEY]: Date.now() })
    } catch {
      // No session storage is a wallet that asks for its PIN more often, which
      // is a worse experience and not a broken one.
    }
  }

  return mnemonic
}

/**
 * The seed for signing, or `null` when a PIN is needed.
 *
 * Reading it counts as use: an idle timeout measures time since the wallet was
 * last used, not since it was unlocked, or a long session of sending would
 * lock itself mid-flow.
 */
export async function sessionMnemonic(now = Date.now()): Promise<string | null> {
  const policy = await unlockPolicy()
  if (policy === 'always') return null

  let seed: unknown
  let touched: unknown
  try {
    const stored = await chrome.storage.session.get([SEED_KEY, TOUCHED_KEY])
    seed = stored[SEED_KEY]
    touched = stored[TOUCHED_KEY]
  } catch {
    return null
  }

  if (typeof seed !== 'string' || seed === '') return null

  if (policy === 'timeout') {
    const last = typeof touched === 'number' ? touched : 0
    if (now - last > IDLE_TIMEOUT_MS) {
      await lock()
      return null
    }
  }

  try {
    await chrome.storage.session.set({ [TOUCHED_KEY]: now })
  } catch {
    // Losing the touch only shortens this session.
  }

  return seed
}

export async function isUnlocked(now = Date.now()): Promise<boolean> {
  return (await sessionMnemonic(now)) !== null
}

/** Forgets the seed. Called on demand, and whenever the policy tightens. */
export async function lock(): Promise<void> {
  try {
    await chrome.storage.session.remove([SEED_KEY, TOUCHED_KEY])
  } catch {
    // Nothing to forget.
  }
}
