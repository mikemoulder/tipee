# Tipee Handoff

## Status
- Date: 2026-08-28
- Current milestone: Visual extension shell complete; wallet flow next
- Overall status: In progress

## Product Context
Tipee is a Manifest V3 browser extension for tipping YouTube creators in Arc testnet USDC. Gifter private keys remain encrypted and local to the browser. Creator funds are held in Circle developer-controlled escrow until channel ownership is verified.

## Repository Facts
- Root package: `tipee`
- Workspaces: `packages/*`
- Shared package: money, limits, YouTube, and fee logic with 131 passing tests.
- Extension package: `@tipee/extension`, currently only wallet crypto source exists.
- Root typecheck now includes both `shared` and `extension` project references.
- Required Node version: 20+

## Known Findings
- `npm test` passes: 4 files, 131 tests.
- `npm run typecheck` passes but does not include the extension.
- Extension Web Crypto inputs now use copied `ArrayBuffer` values at the Web Crypto boundary.
- The extension now has a minimal MV3 manifest, popup entrypoint, content script, service worker, and Vite configs.
- `npm run verify-chain` requires `ARC_RPC_URL` in `.env`; `.env.example` exists.
- The workspace folder is not currently recognized as a Git repository by the terminal.

## Working Decisions
- Start with a minimal buildable MV3 extension shell before implementing the full UI.
- Keep wallet crypto behavior unchanged; fix only the type boundary by passing an `ArrayBuffer`-backed view to Web Crypto.
- Use the existing vanilla TypeScript/Vite direction from the package metadata.

## Next Actions
1. Add wallet onboarding and local encrypted keystore storage around the existing crypto module.
2. Replace the composer stub with creator resolution, amount validation, and gas-aware balance state.
3. Add focused tests for YouTube fixtures, wallet storage, and composer validation.
4. Run the extension in Chrome against a real YouTube watch page.
5. Update this handoff after each completed slice with commands and outcomes.

## Completed Slice: Foundation
- Added `plan.md` and this handoff.
- Fixed extension Web Crypto typing without changing encryption behavior.
- Added `packages/extension/index.html`.
- Added `packages/extension/public/manifest.json`.
- Added popup, content, and service-worker entrypoints.
- Added `vite.config.ts` and `vite.config.content.ts`.
- Added the extension project to root `tsconfig.json` references.
- Added defensive `ytInitialData` creator extraction in `src/youtube.ts`.
- Added video-ID keyed button injection and `yt-navigate-finish` handling.
- Added a dedicated `composer.html` page and service-worker popup lifecycle.
- Added duplicate popup focusing and cleanup on window close.
- Added preview styling for the wallet popup and composer.
- Added working composer amount presets.
- Replaced the temporary YouTube gift text with an inline gift icon and focus styling.

## Current Limitations
- The gift button uses a temporary text label; the final UI needs the specified inline gift icon and YouTube-matched styling.
- The composer displays creator context and an amount field but does not yet resolve a backend creator, estimate gas, request a PIN, or sign a transfer.
- The parser has no captured YouTube HTML fixtures yet.
- The UI imports Google Fonts for preview polish; production should decide whether to bundle a font or keep the fallback stack for offline extension use.
- YouTube extraction now checks the page global, script data, nested `videoOwnerRenderer` navigation URLs, and visible channel links.
- Button rendering no longer waits for metadata; creator details are retried at click time so delayed YouTube data cannot hide the visual control.
- Gift button styling now uses YouTube CSS variables, 36px pill geometry, Roboto metrics, scoped hover/focus states, and a lighter outlined gift icon.
- Gift button polish now matches the 40px action-row pills, uses the 10%-layer surface, and includes a capped 45-second wiggle/light-sweep cue with a dismissible 4-second tooltip.
- Attention cues are viewport-aware, limited to three per video, reset on SPA navigation, and disabled under `prefers-reduced-motion`.
- Button and tooltip colors now inherit YouTube theme variables with light-theme fallbacks, and the button is back to a compact 36px action-pill footprint.
- Fixed disappearing controls after YouTube action-bar rerenders by checking button connectivity before suppressing reinjection.
- Theme detection now handles transparent body backgrounds and watches both `html` and `body` theme attributes.
- Added subtle pill elevation with a theme-appropriate shadow.

## Latest Validation
- `npm test`: passed, 131 tests.
- `npm run typecheck`: passed, shared + extension + root project references.
- `npm run build`: passed, extension output generated in `packages/extension/dist/`.
- `npm run verify-chain`: still requires `ARC_RPC_URL` in `.env`.
- Latest parser change: `npm run typecheck` passed after adding the nested-owner fallback.

## Verification Commands
```text
npm test
npm run typecheck
npm run typecheck --workspace @tipee/extension
npm run build
npm run verify-chain
```
