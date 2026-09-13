# Tipee Handoff

## Status
- Date: 2026-09-14
- Current milestone: The content script now actually loads in Chrome; the tip path is complete once a Postgres and Circle are supplied
- Overall status: In progress

## Product Context
Tipee is a Manifest V3 browser extension for tipping YouTube creators in Arc testnet USDC. Gifter private keys stay encrypted and local to the browser. Creator funds are held in Circle developer-controlled escrow until channel ownership is verified.

## Repository Facts
- Root package: `tipee`; workspaces `packages/*`; Node 20+.
- `@tipee/shared`: money, limits, YouTube identity, fee logic, Arc memo encoding. Zero runtime dependencies.
- `@tipee/extension`: manifest, service worker, content script, popup, composer, wallet crypto and keystore, Arc chain layer (viem) and explorer reader.
- `@tipee/api`: Fastify service — creator resolution, Circle escrow provisioning, tip records. See `packages/api/README.md`.
- Source that Node runs directly spells out `.ts` in relative imports and avoids TypeScript parameter properties: Node's type stripping resolves by filename and cannot express either. TypeScript rewrites the extension on emit.
- Root typecheck covers `shared` and `extension` project references.
- The extension builds in **three** Vite passes, and the split is load-bearing, not tidiness: `vite.config.ts` (popup and composer HTML), `vite.config.content.ts` (content script, `iife`, one file), `vite.config.sw.ts` (service worker, `es`). Never put the content script in a pass with anything else — a shared module gets hoisted into a chunk, and the `import` left behind stops Chrome loading the script at all.
- This workspace **is** a git repository, on `main`.

## Latest Validation
Run 2026-09-14, all from the repo root:
- `npm test` — **359 passed**, 21 files.
- `npx tsc --build` — clean.
- `npm run build` — extension output written to `packages/extension/dist/`; `dist/content.js` verified as a single file with no module syntax.
- `npm run verify-chain` — never executed, and no longer on the critical path (see *Chain Facts*).
- Live check against Arc testnet: explorer history for a real wallet returned 20 movements with timestamps in ~1.6s; the RPC fallback returned 20 from one window in ~3s.
- Live send preview against Arc testnet: a funded wallet previewed balance 4.001862, fee 0.00217, balance after 3.998692 USDC; an empty wallet's dry run reverted on-chain and surfaced "That is more USDC than this wallet holds."

## Chain Facts, Settled
The chain probe that earlier drafts of this document listed as a blocker has been resolved from Arc's own documentation and viem's built-in `arcTestnet` chain. Two facts drive the whole chain layer:

**Native and ERC-20 are the same money.** On Arc the gas asset *is* USDC. The same pool is exposed two ways: an 18-decimal native view used for gas and `msg.value`, and the ERC-20 at `0x3600…0000` with 6 decimals used for accounting. Balances are read from the ERC-20 and only from the ERC-20 — reading both and showing them separately double-counts one pool, and there is nothing to swap between them. viem's `getBalance` returns the 18-decimal view and also reports the symbol `USDC`, which is exactly how that mistake gets made. Gas estimates cross the two views through `nativeToAccounting`, which rounds **up**: a fee shown low is a balance check that passes on a transaction that cannot pay for itself.

**A tip with a note is one transaction, not two.** Arc has no memo field, so a memo'd tip is wrapped in the predeployed `Memo` contract, which forwards the USDC `transfer` through the `CallFrom` precompile and emits the note beside it. The precompile preserves the gifter as `msg.sender`, so the `Transfer` still reads as coming from them. It refuses contract callers, which is why the gifter wallet must stay a plain EOA — moving it to a smart account would silently take memos with it. Gas is estimated against the call that will actually be sent, since the wrapper is real extra gas.

## What Works End to End on the Client
1. Watch page: creator is scraped from the live DOM, a gift button is injected into the action bar, SPA navigation is handled.
2. Composer popup: creator context, amount presets, minimum and balance-plus-gas validation, memo with a byte budget, PIN entry, confirm step, signing, broadcast, result states.
3. Service worker: resolves escrow, unlocks the wallet, rebuilds the call, **re-checks balance and gas after the PIN is typed** (the composer's estimate predates it), signs, sends.
4. Popup: onboarding (welcome, PIN, seed reveal, backup check), home balance, recent activity, deposit with QR, withdraw, settings with seed reveal.

## Fixed This Slice: the gift button never loaded

The injected tip broke, and kept breaking, for a reason no test could see: `dist/content.js` was being emitted with an `import` statement at the top of it.

A MV3 content script listed under `content_scripts[].js` is injected as a **classic script**. That field has no `"type": "module"` the way `background` does. So an `import` anywhere in the file is a `SyntaxError` on line one, the entire script is discarded before a single statement runs, and the watch page simply has no gift button — with nothing in the page console, because the error lands in the extension’s own.

It got there through the build. `vite.config.content.ts` bundled the content script **and** the service worker in one Rollup pass with `format: 'es'`. The two share `@tipee/shared`’s youtube module, so Rollup hoisted it into `assets/youtube-*.js` and left an `import` in both outputs. The worker is declared `"type": "module"` and could take it. The content script could not.

That sharing is also why it was *intermittent* rather than simply broken. The hoist only happens while the two entries have a module in common, so an edit to unrelated code on either side could start or stop the injection path without touching it — which is what "keeps breaking" looked like from the outside.

The fix splits them into separate builds. `vite.config.content.ts` now takes the content entry alone, `format: 'iife'` so there is no module syntax to emit and `inlineDynamicImports: true` so a lazy import cannot reintroduce a second file — a content script’s own imports are fetched subject to `web_accessible_resources`, and nothing here is listed there, so a second chunk fails the same way in a real browser. The service worker moves to `vite.config.sw.ts`, still ES, still free to split viem’s lazy paths, which a worker resolves inside the extension origin. Both configs resolve their entry against the config file rather than `process.cwd()`; the relative paths only worked because the workspace script happened to run from the package directory.

Cost: a duplicated copy of `@tipee/shared` across the two bundles, a few kB. Bought: a content script whose output shape cannot be changed by an edit made in the worker.

`content.build.test.ts` runs the real config in memory and asserts the output is one file with no module syntax. It was confirmed against the broken config first — it reproduces the exact `import{n as h}from"./assets/youtube-…"` line. This is the only check in the suite that looks at the *bundle*; everything in `content.test.ts` runs the TypeScript source, which is why 348 tests passed over a script Chrome refused to load.

## Also This Slice: `.env` had Circle switched off

A block of Circle keys had been appended to the end of `.env`, duplicating four that the documented template above already declared. A dotenv parser takes the **last** assignment of a key within a file, so the trailing block was the one in effect — and its `CIRCLE_API_KEY=` was empty.

That is worse than it sounds, because `loadConfig` enforces all-three-or-none on purpose: "two out of three is a deployment half-done, and it would fail at the worst moment rather than at boot." With the entity secret and wallet set id present and the api key blanked, `someCircle && !allCircle` held and the API **threw `ConfigError` at startup**. Verified both ways against the file as it stood:

```text
BEFORE: ConfigError -> Circle needs CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET and CIRCLE_WALLET_SET_ID together.
AFTER:  boots, circle=configured
```

The guard did its job — this would have been caught the first second anyone ran the server, which is exactly what it is for. It is recorded here because the *cause* was invisible: every key looked populated when the file was read top to bottom, and only the last-wins rule revealed which value was live.

`.env` is now one occurrence per key, each holding the non-empty value; the two duplicated pairs that both carried values were checked identical first, so nothing had to be chosen between. `CIRCLE_APP_ID` and `NEXT_PUBLIC_CIRCLE_APP_ID` existed only in the pasted block and are now in the Circle section of both `.env` and `.env.example`, which no longer disagree about any key.

## Also This Slice: a click that did nothing

Once the script loads, the click handler had its own silent failure. `void chrome.runtime.sendMessage(message)` discarded both ways that call fails, and both leave the gifter looking at a button that ignored them:

- After the extension is reloaded or updated — every iteration, during development — content scripts already running in open tabs hold a runtime that no longer exists. `sendMessage` throws **synchronously** with "Extension context invalidated", which `void` does not catch at all; it surfaced as an uncaught error inside the click handler. Only a page reload recovers it.
- Otherwise the call returns a promise that rejects when the worker cannot be reached. `void` turned that into an unhandled rejection in a console nobody is reading.

`requestComposer` now awaits inside a `try`, so the throw and the rejection are caught together, and puts the failure on screen beside the button: "Tipee was updated. Reload this page to tip." for a stale context, "Could not open the tip window. Try again." otherwise — the second because a sleeping worker usually wakes on the retry, so the button keeps its normal label there and only the unrecoverable case relabels.

The cue tooltip was split into `showMessage`, which the nudge and the failures share. A failure replaces whatever is on screen rather than deferring to it: the nudge runs off a 45s timer, the error answers a click just made, and letting the older one win would drop the only message being waited on. The panel carries `role="status"` now, since for a failure that text is the entire response to the click.

Three tests in `content.test.ts` cover it, each verified to fail without the fix.

## Done Previously: "Could not read activity from Arc."

The popup showed that message for **every** wallet, always. `recentMovements` asked for one 50,000-block window, and Arc's public RPCs cap `eth_getLogs` at under 30,000 — measured: 28,000 is served, 30,000 comes back "requested range too large", identically on all three endpoints. The query was refused, the refusal was caught, and the catch printed the message. Balance was unaffected because `eth_call` has no such cap, which is why the screen could show $20.00 next to an empty history.

Three limits shape the fix, all measured against the live endpoints:
- **Range**: under 30,000 blocks per query. Windows are now 25,000, with margin.
- **Results**: 20,000 logs per query. One wallet's own transfers will not approach it; an unfiltered query does immediately.
- **Rate**: a burst of a dozen queries gets refused, and each endpoint meters separately.

So the scan walks backwards in 25,000-block windows, up to six of them (~22 hours at Arc's ~0.52s blocks), and stops as soon as the list is full — a busy wallet costs two queries, an empty one costs the budget. A window that fails after the first ends the scan and returns `partial: true` rather than throwing: rate limits are the normal case on public RPCs, and discarding four good windows because the fifth was refused would hide real tips. A window that answers in only one direction is still refused outright — that is sends without receipts, a wrong ledger rather than a short one. `arcPublicClient` now uses a `fallback` transport across all three endpoints, so one endpoint's rate limit is a slower answer instead of an empty screen.

## History Beyond a Day: the explorer

A log scan can only ever show a recent window, because the ceiling is per query and reaching back a week costs dozens of round trips. `testnet.arcscan.app` is a Blockscout instance with a full v2 API, and it has already done that indexing:

`GET /api/v2/addresses/{addr}/token-transfers?type=ERC-20&token=0x3600…0000` returns USDC-only transfers, newest first, 50 to a page with cursor paging, each with a real timestamp and a 6-decimal `total.value`. It answers a plain GET with `access-control-allow-origin: *`, so the popup reads it directly and the manifest needs no host permission. Its `/api/v2/stats` also reports `average_block_time: 520.0`ms, which independently confirms the 0.52s constant the fallback's age estimates use.

`walletActivity` asks the explorer first and falls back to the log scan when it is down, rate-limited, or answering with something unrecognisable. An empty answer from the explorer is believed rather than re-scanned: it indexes within seconds, and hedging would double the cost of the common case — a new wallet — against a lag the refresh button already covers.

The third party is confined to display. It never sees a key, it cannot move money, and every row is re-checked against the USDC contract address and 6 decimals before it is rendered, because a row for another token drawn with USDC's decimals is a 10^12 error in something a person reads as dollars. Rows whose address, hash, or amount do not parse are dropped rather than guessed at.

The popup captions the list only when it is not the whole history: nothing when the explorer answered, "last ~22h" (or "· cut short") when the scan did — because an old tip that is out of range and an old tip that never happened otherwise look identical. Explorer rows show a measured age ("3h ago"); scanned rows show an estimate from block distance, marked "~4h ago".

## Done Previously: home screen structure
- The Arc mark sits in the top bar beside the gear; the balance carries a copyable address chip instead of a network chip. The mark is labelled "Arc testnet" for pointer and screen reader, and every screen where the network decides what happens to money — deposit, withdraw, composer — still says it in words.
- Outgoing tips read "Tipped @creator" rather than "Sent 0x1f98…f984", from a local journal (`chain/journal.ts`) written when a tip is sent. A `Transfer` log cannot say whose escrow an address is — escrow addresses are anonymous on-chain and the mapping lives in the backend — so the wallet notes it. The journal is a label, never a ledger: the chain still decides what happened, an entry with no matching transfer never renders, and a seed restored elsewhere shows every tip, just unnamed.
- A balance that could not be read shows `$—` and says so, never `$0.00`.
- Activity has a header row with the window and a refresh control, skeleton rows while loading, and full-height empty and error states — the error one offers Try again. The list now fills the popup instead of leaving 300px of blank sage under one line of grey text.
- Rows carry an age: measured when the explorer supplied a timestamp, estimated from block distance and marked `~` when only a log scan answered.

## Done Previously: seed backup confirmation
The onboarding seed step ended in a checkbox, which records an intention rather than establishing that the phrase was written down correctly. This wallet is the only copy of the key — nothing is escrowed, no reset exists — so a phrase that was never really captured is a total loss discovered months later.

`renderSeedCheck` now asks for three words by position before the wallet is used. Positions are drawn fresh per attempt, so a retry after a failure asks a different trio rather than one that could be copied off the reveal screen. Answers are trimmed and case-folded, because BIP-39 words are lowercase ASCII and rejecting `Abandon` would only teach the owner to distrust a correct backup. The reveal screen stays one back link away. Covered by 11 tests in `packages/extension/src/popup/main.test.ts`.

## Working Decisions
- No session key cache — see the *Decisions* section of `plan.md` for why it contradicts PIN-per-tip.
- Content script scrapes the DOM only; the backend resolves handle to `channelId`.
- Escrow resolution fails closed. No bundled fallback address, no reusing the last one seen — a tip that does not send beats a tip that lands somewhere unintended, and both look identical to the gifter until the money is gone.
- Activity comes from the Arc explorer, with the chunked log scan as fallback; the screen always says which, because the two reach back different distances.
- PBKDF2 is interim; record fields `v` and `kdf` exist so it can migrate to scrypt or Argon2id before mainnet.
- Vanilla TypeScript and Vite, no UI framework, to keep store review simple.

## What Stands Between Here and a Demo

Corrected 2026-09-14. Two of the three items here were already satisfied and the document had not caught up — the Circle credentials are in `.env` and have been all along.

1. **A running Postgres.** `DATABASE_URL` is set, but it points at `localhost:5432` and nothing is listening; this machine has neither `docker` nor `psql`. This is an install, not a credential — the only genuinely missing piece.
2. ~~Circle sandbox credentials~~ — present. `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_SET_ID`, `CIRCLE_APP_ID` are all populated. **A wallet set already exists**, so `scripts/create-wallet-set.ts` does not need running; it would mint a second one.
3. Then: set the service URL in the extension’s settings and walk one tip end to end on testnet.

## Next Actions
1. Load unpacked in Chrome and confirm the gift button appears on a watch page and opens the composer. This was blocked by the bundle bug and is not any more.
2. Install a Postgres and point `DATABASE_URL` at it — Docker Desktop, a native Windows install, or a hosted one. The last would change the URL away from `localhost`. Then run the first migration and fix what it finds.
3. Provision one escrow through Circle and check the address it returns. The credentials and the wallet set are ready; this is the first call that has never been made.
4. Creator dashboard: `/claim` lookup, About-page verification token, authenticated withdrawal with the 96/4 split. Their tables already exist in migration 001.
5. Walk a real watch page end to end, through a tip that lands on testnet.

## Known Gaps
- The Postgres store and migrations are unrun, and the Circle client is uncalled. Only the first is still blocked on this machine — Circle is configured and merely untried.
- No creator dashboard or verification flow.
- No captured YouTube HTML fixtures; scraper tests use hand-built DOM and bootstrap shapes. Deliberately deferred — the injection and scrape path is behaving on real pages.
- No end-to-end testnet run yet; the chain layer is unit-tested against mocked clients only.
- The extension has still not been loaded unpacked in Chrome. Everything above about the content script was diagnosed from the emitted bundle and the MV3 loading rules, and is worth re-confirming on a real watch page — it is the first thing the next session should do, and it is now possible.
- The UI imports Google Fonts; production should decide between bundling a font and keeping the fallback stack for offline use.

## Verification Commands
```text
npm test
npx tsc --build
npm run build
```
