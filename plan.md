# Tipee Implementation Plan

## Goal
Build a Manifest V3 browser extension that lets viewers tip YouTube creators in Arc testnet USDC while keeping gifter keys non-custodial in the browser. Creators receive tips in Circle-managed escrow until they verify channel ownership and withdraw, less a 4% platform fee.

## Delivery Order

### 1. Foundation
- [x] Fix extension Web Crypto TypeScript errors.
- [x] Include all workspaces in root typechecking.
- [x] Add MV3 and Vite build configuration.
- [x] Add automated test, typecheck, and build checks.
- [ ] Document Arc and environment configuration.

### 2. Extension Shell
- [x] Add manifest, service worker, content script, and extension popup entrypoints.
- [x] Add composer popup-window entrypoint.
- [x] Produce a loadable `dist/` package.

### 3. Gifter Wallet
- [ ] Generate a wallet on first run.
- [ ] Show and confirm the 12-word seed phrase.
- [ ] Encrypt private key material with PBKDF2 and AES-256-GCM.
- [ ] Store only encrypted material in `chrome.storage.local`.
- [ ] Add PIN unlock, session expiry, backup, backoff, and optional wipe protection.

### 4. YouTube Tip Experience
- [x] Extract channel metadata from `ytInitialData`.
- [x] Inject an accessible gift button into the action bar.
- [x] Handle SPA navigation and duplicate prevention.
- [x] Open the dedicated composer popup.
- [ ] Add amount presets, minimum validation, balance plus gas validation, PIN confirmation, signing, broadcast, and result states.

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
- [ ] Add wallet, YouTube parsing, API, verification, and withdrawal tests.
- [ ] Configure Arc testnet and Circle credentials.
- [ ] Run an end-to-end testnet demo.
- [ ] Package and document the Chrome Web Store release.

## Current MVP Milestone
A buildable extension shell with tested wallet crypto is the first milestone. The next vertical slice is: YouTube metadata -> gift button -> composer -> backend creator resolution -> testnet transfer.
