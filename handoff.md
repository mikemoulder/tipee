# Tipee Handoff

## Status
- Date: 2026-08-30
- Current milestone: Extension shell and wallet crypto complete; onboarding UI and composer signing next
- Overall status: In progress

## Product Context
Tipee is a Manifest V3 browser extension for tipping YouTube creators in Arc testnet USDC. Gifter private keys remain encrypted and local to the browser. Creator funds are held in Circle developer-controlled escrow until channel ownership is verified.

## Repository Facts
- Root package: `tipee`; workspaces `packages/*`; Node 20+.
- `@tipee/shared`: money, limits, YouTube identity, fee logic. Zero runtime dependencies.
- `@tipee/extension`: manifest, service worker, content script, popup, composer, wallet crypto and keystore.
- Root typecheck covers `shared` and `extension` project references.
- This workspace **is** a git repository, on `main`.

## Latest Validation
Run 2026-08-30, all from the repo root:
- `npm test` — **158 passed**, 6 files.
- `npx tsc --build` — clean.
- `npm run build` — extension output written to `packages/extension/dist/`.
- `npm run verify-chain` — still requires `ARC_RPC_URL` in `.env`. Never yet executed.

## Fixed This Slice: creator misrouting

`scrapeCreator` preferred the inline `ytInitialData` bootstrap script over the live DOM. Three facts combined into a money bug:

1. `window.ytInitialData` is invisible to an MV3 content script (isolated world), so that branch was dead code and always fell through.
2. The fallback parsed the bootstrap `<script>` out of `document.scripts`. YouTube writes that tag once at page load and never rewrites it during SPA navigation.
3. `??` short-circuited before the DOM path, the only source that is correct after a navigation.

So after navigating from video A to video B, the tip was attributed to **creator A**. It fired on essentially every tip after the first, since SPA navigation is the normal browsing path; only a hard refresh gave the right answer.

Fixes applied:
- Live DOM is now the primary source.
- Bootstrap data is accepted only when `currentVideoEndpoint.watchEndpoint.videoId` matches the video being scraped. Unprovable is treated as wrong — failing closed just means re-scraping on click, whereas failing open pays the wrong person.
- The dead `window.ytInitialData` branch is gone.
- The DOM scraper now skips the textless avatar link and takes the channel-name link, and carries the avatar through so the composer keeps its picture.

Covered by `packages/extension/src/youtube.test.ts` (13 tests, happy-dom). Confirmed meaningful: restoring the old precedence fails 3 of them, including the misrouting case.

## Also Fixed
- **Duplicate PIN validation.** The keystore had its own `pin.length < 6` check that accepted non-digits and had no upper bound, so a PIN it allowed could be refused one call later at encryption. It now calls `assertValidPin` from `wallet/crypto.ts`.
- **Missing brute-force protection.** Added exponential backoff (3 free attempts, then doubling from 1s, capped at 5 minutes) and opt-in wipe after 10 failures, per idea.md §3.1.1. `unlockWallet` takes an injectable `now`, so the delays are tested without sleeping.
- **Build output in git.** 32 files under `packages/extension/dist-types/` were tracked; `.gitignore` had `dist/`, which does not match `dist-types`. Added the pattern and untracked them.

## Working Decisions
- No session key cache — see the *Decisions* section of `plan.md` for why it contradicts PIN-per-tip.
- Content script scrapes the DOM only; the backend resolves handle to `channelId`.
- PBKDF2 is interim; record fields `v` and `kdf` exist so it can migrate to scrypt or Argon2id before mainnet.
- Vanilla TypeScript and Vite, no UI framework, to keep store review simple.

## Next Actions
1. Onboarding UI: generate, reveal the 12-word phrase, confirm 3 random words, set PIN, offer the wipe opt-in.
2. Composer: replace the `pin: ''` stub in `src/composer/main.ts` with real PIN entry, creator resolution, gas-aware balance validation, signing, and result states.
3. Capture real YouTube watch-page HTML fixtures to guard the scraper against layout changes.
4. Obtain the `.env` values so `npm run verify-chain` can settle `NATIVE_DECIMALS` and the transfer shape.
5. Load unpacked in Chrome and walk a real watch page end to end.

## Known Gaps
- Composer shows creator context and an amount field; it does not resolve a backend creator, estimate gas, request a PIN, or sign. `SEND_TIP` currently sends `pin: ''`.
- No onboarding UI, so `createWalletRecord` returns a mnemonic nothing displays. Seed backup is unreachable by a user.
- No captured YouTube HTML fixtures; scraper tests use hand-built DOM and bootstrap shapes.
- `wallet/chain.ts` does not exist — blocked on the chain probe.
- The UI imports Google Fonts; production should decide between bundling a font and keeping the fallback stack for offline use.

## Verification Commands
```text
npm test
npx tsc --build
npm run build
npm run verify-chain
```
