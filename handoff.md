# Tipee Handoff

## Status
- Date: 2026-09-04
- Current milestone: Client is feature-complete for a tip; nothing can send until a backend exists
- Overall status: In progress

## Product Context
Tipee is a Manifest V3 browser extension for tipping YouTube creators in Arc testnet USDC. Gifter private keys stay encrypted and local to the browser. Creator funds are held in Circle developer-controlled escrow until channel ownership is verified.

## Repository Facts
- Root package: `tipee`; workspaces `packages/*`; Node 20+.
- `@tipee/shared`: money, limits, YouTube identity, fee logic, Arc memo encoding. Zero runtime dependencies.
- `@tipee/extension`: manifest, service worker, content script, popup, composer, wallet crypto and keystore, Arc chain layer (viem) and explorer reader.
- No backend package exists yet.
- Root typecheck covers `shared` and `extension` project references.
- This workspace **is** a git repository, on `main`.

## Latest Validation
Run 2026-09-04, all from the repo root:
- `npm test` — **282 passed**, 15 files.
- `npx tsc --build` — clean.
- `npm run build` — extension output written to `packages/extension/dist/`.
- `npm run verify-chain` — never executed, and no longer on the critical path (see *Chain Facts*).
- Live check against Arc testnet: explorer history for a real wallet returned 20 movements with timestamps in ~1.6s; the RPC fallback returned 20 from one window in ~3s.

## Chain Facts, Settled
The chain probe that earlier drafts of this document listed as a blocker has been resolved from Arc's own documentation and viem's built-in `arcTestnet` chain. Two facts drive the whole chain layer:

**Native and ERC-20 are the same money.** On Arc the gas asset *is* USDC. The same pool is exposed two ways: an 18-decimal native view used for gas and `msg.value`, and the ERC-20 at `0x3600…0000` with 6 decimals used for accounting. Balances are read from the ERC-20 and only from the ERC-20 — reading both and showing them separately double-counts one pool, and there is nothing to swap between them. viem's `getBalance` returns the 18-decimal view and also reports the symbol `USDC`, which is exactly how that mistake gets made. Gas estimates cross the two views through `nativeToAccounting`, which rounds **up**: a fee shown low is a balance check that passes on a transaction that cannot pay for itself.

**A tip with a note is one transaction, not two.** Arc has no memo field, so a memo'd tip is wrapped in the predeployed `Memo` contract, which forwards the USDC `transfer` through the `CallFrom` precompile and emits the note beside it. The precompile preserves the gifter as `msg.sender`, so the `Transfer` still reads as coming from them. It refuses contract callers, which is why the gifter wallet must stay a plain EOA — moving it to a smart account would silently take memos with it. Gas is estimated against the call that will actually be sent, since the wrapper is real extra gas.

## What Works End to End on the Client
1. Watch page: creator is scraped from the live DOM, a gift button is injected into the action bar, SPA navigation is handled.
2. Composer popup: creator context, amount presets, minimum and balance-plus-gas validation, memo with a byte budget, PIN entry, confirm step, signing, broadcast, result states.
3. Service worker: resolves escrow, unlocks the wallet, rebuilds the call, **re-checks balance and gas after the PIN is typed** (the composer's estimate predates it), signs, sends.
4. Popup: onboarding (welcome, PIN, seed reveal, backup check), home balance, recent activity, deposit with QR, withdraw, settings with seed reveal.

## Fixed This Slice: "Could not read activity from Arc."

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

The popup says which source answered — "all time" for the explorer, "last ~22h" (or "· cut short") for the scan — because an old tip that is out of range and an old tip that never happened otherwise look identical. Explorer rows show a measured age ("3h ago"); scanned rows show an estimate from block distance, marked "~4h ago".

## Also This Slice: home screen structure
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

## The One Blocker
`resolveEscrowAddress` reads an API base from `chrome.storage.local` and throws `EscrowUnavailableError` when it is absent — which it always is, because no backend exists. Every tip stops there with "Tipee is not connected to a backend yet." The client is otherwise ready.

## Next Actions
1. Backend MVP: `GET /api/creators/resolve?handle=`, channel ID resolved server-side, Circle escrow provisioning, tip records with idempotency. `.env.example` already lists the Circle, Postgres, and treasury keys it needs.
2. Point the extension at it (`tipee.apiBase.v1` in `chrome.storage.local`) and walk one tip end to end on testnet.
3. Creator dashboard: `/claim` lookup, About-page verification token, authenticated withdrawal with the 96/4 split.
4. Load unpacked in Chrome and walk a real watch page end to end.

## Known Gaps
- No backend, so no creator resolution, no escrow, no tip records — see above.
- No creator dashboard or verification flow.
- No captured YouTube HTML fixtures; scraper tests use hand-built DOM and bootstrap shapes. Deliberately deferred — the injection and scrape path is behaving on real pages.
- No end-to-end testnet run yet; the chain layer is unit-tested against mocked clients only.
- The UI imports Google Fonts; production should decide between bundling a font and keeping the fallback stack for offline use.

## Verification Commands
```text
npm test
npx tsc --build
npm run build
```
