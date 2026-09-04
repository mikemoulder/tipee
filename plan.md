# Tipee Implementation Plan

## Goal
Build a Manifest V3 browser extension that lets viewers tip YouTube creators in Arc testnet USDC while keeping gifter keys non-custodial in the browser. Creators receive tips in Circle-managed escrow until they verify channel ownership and withdraw, less a 4% platform fee.

## Delivery Order

### 1. Foundation
- [x] Fix extension Web Crypto TypeScript errors.
- [x] Include all workspaces in root typechecking.
- [x] Add MV3 and Vite build configuration.
- [x] Add automated test, typecheck, and build checks.
- [x] Settle Arc configuration: chain via viem's `arcTestnet`, USDC ERC-20 at `0x3600…0000`, memo contract at `0x5294…de505`. **No longer blocked** — see *Decisions*.
- [ ] Document deployment configuration (`.env` for the backend, `tipee.apiBase.v1` for the extension).

### 2. Extension Shell
- [x] Add manifest, service worker, content script, and extension popup entrypoints.
- [x] Add composer popup-window entrypoint.
- [x] Produce a loadable `dist/` package.

### 3. Gifter Wallet
- [x] Generate a wallet on first run.
- [x] Encrypt seed material with PBKDF2-SHA256 (600k) and AES-256-GCM.
- [x] Store only encrypted material in `chrome.storage.local`.
- [x] Add PIN unlock with exponential backoff and opt-in wipe after 10 failures.
- [x] Route all PIN validation through a single validator.
- [x] Show the 12-word seed phrase and confirm three words by position before use.
- [x] Settings: reveal seed.
- [ ] Settings: change PIN.
- [x] ~~Session expiry~~ — **dropped by decision**, see *Decisions* below.

### 4. YouTube Tip Experience
- [x] Extract channel metadata from the watch page (live DOM first; bootstrap data only as a video-matched fallback).
- [x] Inject an accessible gift button into the action bar.
- [x] Handle SPA navigation and duplicate prevention.
- [x] Open the dedicated composer popup.
- [x] Amount presets, minimum validation, balance-plus-gas validation, memo with byte budget, PIN confirmation, signing, broadcast, and result states.
- [x] Wallet popup: balance, recent activity, deposit with QR, withdraw.
- [x] Home screen states: skeletons, copyable address, full-height empty and error states, refresh, coverage disclosure.
- [x] Full history from the Arc explorer, with the log scan as fallback.
- [x] Name tipped creators in activity from a local tip journal.
- [ ] Capture real YouTube watch-page HTML fixtures. **Deferred** — the injection and scrape path is behaving on real pages; hand-built DOM tests hold until a layout change proves otherwise.

### 5. Backend MVP — **the blocker**
- [ ] Add API service and PostgreSQL migrations.
- [ ] `GET /api/creators/resolve?handle=` returning `wallet_address`, with the channel ID established server-side.
- [ ] Provision Circle escrow wallets when needed.
- [ ] Record and validate tips with idempotency protection.

### 6. Creator Dashboard
- [ ] Add `/claim` channel lookup and balance view.
- [ ] Add About-page verification tokens and fallback verification.
- [ ] Add authenticated withdrawals with the 96% creator / 4% platform split.
- [ ] Show withdrawal status and receipts.

### 7. Security, Testing, and Release
- [ ] Verify that PINs, seeds, and private keys never leave extension contexts.
- [x] Wallet crypto, keystore, backoff, seed-backup check, YouTube parsing, chain, explorer, journal, composer, and popup tests (282).
- [ ] API, verification, and withdrawal tests.
- [ ] Run an end-to-end testnet demo.
- [ ] Package and document the Chrome Web Store release.

## Decisions

**No session key cache.** idea.md §3.1.1 originally specified caching the derived AES key in `chrome.storage.session` behind an expiry. That cannot coexist with "PIN required to sign every tip" (same section): if the key is cached the PIN is not needed, and if the PIN is needed the cache saves nothing. PIN-per-tip is the specified product behaviour, so the cache is dropped. Derive, decrypt, sign, discard — all inside one message handler, which comfortably outruns the ~30s MV3 idle termination the cache was meant to survive.

**Content script reads the DOM, backend resolves the channel ID.** MV3 content scripts run in an isolated world and cannot see `window.ytInitialData`. The DOM is the only source that stays correct across SPA navigation, so it is authoritative here; `channelId` resolution moves server-side where it can be hotfixed without an extension update and cannot be spoofed by a client.

**Balances come from the ERC-20 view only.** On Arc the gas asset is USDC itself, surfaced both as an 18-decimal native balance and as a 6-decimal ERC-20. They are one pool. Showing both, or adding them, counts the same money twice; "converting" between them is not a swap. Gas crosses the two views through a helper that rounds up, since a fee shown low turns into a balance check that passes on a transaction that cannot pay for itself.

**A memo'd tip is one transaction.** Arc's predeployed `Memo` contract forwards the USDC `transfer` through the `CallFrom` precompile and emits the note in the same transaction, so a failed transfer cannot leave behind a note claiming it happened. The precompile rejects contract callers, which fixes the gifter wallet as a plain EOA: an ERC-4337 or Circle modular wallet on the gifter side would silently lose memos.

**History from the explorer, chain as fallback.** Arc's public RPCs serve under 30,000 blocks and 20,000 logs per `eth_getLogs`, and rate-limit bursts, so a log scan can only ever show a recent window — 25,000-block windows walked backwards, capped at six, stopping early once the list is full, across a `fallback` transport over all three endpoints, with a late refusal returning what was read and marking it short rather than throwing. That is now the fallback. The primary source is Arc's Blockscout API, which has the whole history indexed with timestamps and answers in one request, with no host permission needed. The third party is confined to display: no keys, no money, and every row re-checked against the USDC address and its 6 decimals before rendering. The screen captions the list only when it is short of the full history, since an out-of-range tip and a tip that never happened otherwise look the same.

**Tip labels are local, and only labels.** An escrow address is anonymous on-chain and its creator mapping lives in the backend, so "Tipped @creator" can only come from a note this wallet writes when it sends one. That note never decides whether a tip happened or what it was worth — the chain does — and a movement with no note stays an honest unnamed row rather than being attributed by guesswork.

**Escrow resolution fails closed.** With no backend configured, or an unreachable one, or a reply that is not an address, the tip stops. There is no bundled fallback recipient and no reuse of a previously seen address. A tip that does not send is recoverable; a tip that sends to the wrong place is not, and both look the same to the gifter until the money is gone.

**Three words, not a checkbox.** A checkbox at the seed reveal records intent, not a backup. The positions asked are redrawn each attempt so a failed check cannot be passed by copying the same trio off the previous screen.

**PBKDF2 is an interim KDF.** It is GPU-friendly, so a 6-digit PIN is roughly minutes of offline compute for anyone who obtains the ciphertext. The defence that carries weight is that the ciphertext never leaves the device, backed by online backoff. Before mainnet this should become scrypt or Argon2id; `v` and `kdf` are stored in each record so migration is decrypt-and-re-encrypt.

## Blocked On
Nothing on the chain side. The remaining blocker is that no backend exists, so `resolveEscrowAddress` throws on every tip and the client's finished path cannot be exercised. `.env.example` lists what the service needs: Circle sandbox API key, entity secret and wallet set, `DATABASE_URL`, `API_ORIGIN`, `TREASURY_ADDRESS`.

`scripts/verify-chain.mjs` still exists and still wants `.env`, but the two facts it was written to settle — decimals and transfer shape — are settled. It is now a live-network sanity check, not a prerequisite.

## Current MVP Milestone
The client-side vertical slice is complete: scrape → gift button → composer → PIN → signed Arc transfer, plus a wallet popup with balance, activity, deposit and withdraw. The next slice is the backend MVP, after which one real testnet tip can be walked end to end.
