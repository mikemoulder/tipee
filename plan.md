# Tipee Implementation Plan

## Goal
Build a Manifest V3 browser extension that lets viewers tip YouTube creators in Arc testnet USDC while keeping gifter keys non-custodial in the browser. Creators receive tips in Circle-managed escrow until they verify channel ownership and withdraw, less a 4% platform fee.

## Delivery Order

### 1. Foundation
- [x] Fix extension Web Crypto TypeScript errors.
- [x] Include all workspaces in root typechecking.
- [x] Add MV3 and Vite build configuration.
- [x] Add automated test, typecheck, and build checks.
- [ ] Document Arc and environment configuration. **Blocked** — needs the values listed under *Blocked On* below.

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
- [ ] Show and confirm the 12-word seed phrase (onboarding UI).
- [ ] Settings: change PIN, reveal seed.
- [x] ~~Session expiry~~ — **dropped by decision**, see *Decisions* below.

### 4. YouTube Tip Experience
- [x] Extract channel metadata from the watch page (live DOM first; bootstrap data only as a video-matched fallback).
- [x] Inject an accessible gift button into the action bar.
- [x] Handle SPA navigation and duplicate prevention.
- [x] Open the dedicated composer popup.
- [ ] Add amount presets, minimum validation, balance-plus-gas validation, PIN confirmation, signing, broadcast, and result states.

### 5. Backend MVP
- [ ] Add API service and PostgreSQL migrations.
- [ ] Resolve creators by immutable YouTube channel ID.
- [ ] Provision Circle escrow wallets when needed.
- [ ] Record and validate tips with idempotency protection.

### 6. Creator Dashboard
- [ ] Add `/claim` channel lookup and balance view.
- [ ] Add About-page verification tokens and fallback verification.
- [ ] Add authenticated withdrawals with 96% creator / 4% platform split.
- [ ] Show withdrawal status and receipts.

### 7. Security, Testing, and Release
- [ ] Verify that PINs, seeds, and private keys never leave extension contexts.
- [x] Wallet crypto, keystore, backoff, and YouTube parsing tests.
- [ ] API, verification, and withdrawal tests.
- [ ] Configure Arc testnet and Circle credentials.
- [ ] Run an end-to-end testnet demo.
- [ ] Package and document the Chrome Web Store release.

## Decisions

**No session key cache.** idea.md §3.1.1 originally specified caching the derived AES key in `chrome.storage.session` behind an expiry. That cannot coexist with "PIN required to sign every tip" (same section): if the key is cached the PIN is not needed, and if the PIN is needed the cache saves nothing. PIN-per-tip is the specified product behaviour, so the cache is dropped. Derive, decrypt, sign, discard — all inside one message handler, which comfortably outruns the ~30s MV3 idle termination the cache was meant to survive.

**Content script reads the DOM, backend resolves the channel ID.** MV3 content scripts run in an isolated world and cannot see `window.ytInitialData`. The DOM is the only source that stays correct across SPA navigation, so it is authoritative here; `channelId` resolution moves server-side where it can be hotfixed without an extension update and cannot be spoofed by a client.

**PBKDF2 is an interim KDF.** It is GPU-friendly, so a 6-digit PIN is roughly minutes of offline compute for anyone who obtains the ciphertext. The defence that carries weight is that the ciphertext never leaves the device, backed by online backoff. Before mainnet this should become scrypt or Argon2id; `v` and `kdf` are stored in each record so migration is decrypt-and-re-encrypt.

## Blocked On
`scripts/verify-chain.mjs` is written and cannot run without a `.env` containing:
Arc testnet RPC URL, chain ID, USDC contract address (if an ERC-20 exists), explorer base URL, Circle sandbox API key and entity secret, and a funded testnet address.

Its output settles two facts that `wallet/chain.ts` cannot be written without: `NATIVE_DECIMALS`, and whether a tip is a native value transfer or an ERC-20 `transfer()` call.

## Current MVP Milestone
Extension shell and wallet crypto are done and tested. The next vertical slice is: creator scrape -> gift button -> composer -> backend creator resolution -> testnet transfer. Onboarding UI and the composer's signing path are the two remaining client-side pieces; both are unblocked. The transfer itself is blocked on the chain probe.
