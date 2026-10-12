# Tipee Handoff

## Status
- Date: 2026-10-12
- Current milestone: **Porting from Arc to Stellar** on branch `stellar-port`, for the Find Your Way hackathon (General Track, deadline 2026-10-12 23:59). The port plan lives at `../port-plan.md` beside this repo.
- Done: escrow contract (deployed, 8 Rust tests), `@tipee/shared`, `@tipee/api` and `@tipee/extension` are all on Stellar. `npm test` passes **339**; `tsc --build` is clean; the extension builds.
- **2026-10-12: wallets moved to OpenZeppelin smart accounts** (branch `oz-smart-accounts`), at the owner's request to use Stellar's official stack rather than our own wallet contract. See *Wallets: OpenZeppelin smart accounts* below.
- Proven live on testnet: `scripts/verify-chain.mjs` (API path, ~19 s) and `scripts/e2e-extension.mjs` (the built extension in real Chrome: onboarding → wallet deployed + 10 USDC faucet in ~11 s → tip 1.50 USDC via the composer, confirmed ~8 s after signing → activity shows "Tipped @fireship"). A live claim paid 1.92 net / 0.08 fee.
- **2026-10-12 afternoon: the website was deleted and rebuilt from scratch** (owner's call: the old one read as generic). Design decisions live in `packages/web/DESIGN.md`; read it before touching the UI. Routes: `/` (hero with the animated tip-to-escrow stage, how it works, the live channel lookup on a dark band, Super Thanks vs Tipee, Stellar parts + real receipts, close), `/claim` (same API calls as before, rebuilt), `/install`; `/viewers` redirects to `/`. The API client moved to `packages/web/lib/api.ts`, links/receipts to `lib/site.ts`. The old hero clip, `ASSETS.md` and every old component are gone (in git history). `next build` is clean; checked at 1440 and 390 with 0 console errors and no overflow; the live lookup returns @fireship's 16.50 USDC from the contract.
- **Extension 0.3.1 (2026-10-12 evening): restyled to match the site** (sans words, mono only for money/addresses/labels, pill buttons, ink actions, forest only on the composer's send, the site's gift mark on the wordmark) and its copy made plain (no "contract", "simulate", "XLM", scan windows; the API URL moved under Settings > Advanced). Behaviour and element ids unchanged; 339 tests pass; the e2e script passes on the new build. The site was also stripped of technical copy: the Stellar section is now three plain points plus links to a real tip and the README; contract IDs, SEP-5, the build-from-source block and the API health link are gone. `lib/site.ts` holds `EXTENSION_VERSION`, which must match the release asset name.
- `scripts/e2e-extension.mjs` can type "1.1.5000" into the amount: its triple-click does not always select the field. Clearing the value with `$eval` before typing makes it reliable.
- **Creator accounts (2026-10-12 evening).** Verify a channel once with the description code, then save a passkey and payout address; `/dashboard` signs in with the passkey alone, shows balance, lifetime, paid out and recent tips from chain, and pays out to the saved address only. API: `src/accounts.ts` (file store, HMAC sessions, SimpleWebAuthn behind a `Passkeys` interface), `src/accounts-routes.ts`, `escrowLifetime` and `channelActivity` in `stellar.ts`; 15 tests in `accounts.test.ts`. It is **off unless `SITE_ORIGINS`** lists the site's exact origin(s), because passkeys are bound to that domain. Accounts persist in `ACCOUNTS_FILE` (default `~/.local/share/tipee/accounts.json`, mode 600, holds the session secret). Checked end to end in Chrome with a virtual authenticator against a local harness (real Stellar reads, stub YouTube, stub payout).
- Vercel builds from `packages/web`, where `npm install` skips the root's devDependencies. `typescript` is therefore a devDependency of `@tipee/web` itself (commit 7e9b0a4); without it Next cannot read `tsconfig.json` and every `@/` import fails with Module not found.
- `packages/web/.next-stale-root/` is a root-owned leftover build that could not be deleted without sudo (gitignored). Owner: `sudo rm -rf packages/web/.next-stale-root`.
- Next: owner imports the site on Vercel (root `packages/web`, `NEXT_PUBLIC_TIPEE_API=https://tipee-api.duckdns.org`), og:image, demo video, submission.
- Overall status: In progress. Everything below *Stellar Facts* describes the Arc build and is history until the port lands.

## Stellar Facts (testnet, 2026-10-11)
| What | Value |
|---|---|
| Network | testnet, protocol 29, `Test SDF Network ; September 2015`, RPC `https://soroban-testnet.stellar.org` |
| USDC | Circle testnet `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`, 7 decimals |
| Escrow | `CB7OEDRTDDPLG37HWY76OQQYOO56P3R3CAAWX5IUSJXIAC3IDZ7OKGUV` (fee 400 bps) |
| Wallet wasm hash | `611b9ad888839007cdc9726151475bf79f6a7e4e780fad739c87dd6fce1ce9a2` |
| Admin | `GC7LXNESZMEBAHT3DTBTQWXIEOLPF5QWVGWLP575MNDAL4PESXGSBVDV` (CLI identity `tipee-admin`) |
| Verifier | `GBDL2NKQD74ZEKDSQF4F3LRVMOP3TQNBASR6ZJES7E6PNR4EYNPCDMCJ` (`tipee-verifier`) |
| Treasury | `GCQRAKJ5P35HP7Q4ME24JSVZCOCN4IDNLUZML7BI6HVEATHDH5SI5YZP` (`tipee-treasury`, has a USDC trustline) |
| Relayer | `GCBOETCF6JUQIVT46TOINOEESGRK536Q3DNS57BNNKDQJ24A4RAEA27L` (`tipee-relayer`). Pays every fee, deploys wallets, funds the faucet. Bought ~2,790 testnet USDC on the testnet DEX. |

Secrets live only in the Stellar CLI's key store on the dev machine (`stellar keys show <name>`), never in the repo.

**Wallets: OpenZeppelin smart accounts** (2026-10-12)
- The contracts `stellar/smart-account-kit` deployed to testnet (docs/deployments-protocol-27-2026-07-09.md in that repo): account wasm `1b5f4534…785a`, Ed25519 verifier `CAAVTMCB…HKN4`, WebAuthn verifier `CC7EKIHQ…OM3F`, spending-limit policy `CABXBYJN…TIP5G`. Constants in `shared/src/stellar.ts`.
- Deployed by the relayer with `salt = sha256(owner)` (so `walletAddressFor` is unchanged) and constructor `(signers: [External(ed25519 verifier, owner key)], policies: {})`, which makes context rule 0.
- Signing (`extension/src/chain/account.ts`): `authorizeEntry` with a callback returning `AuthPayload { context_rule_ids, signers: { signer: sig } }`, where `sig = ed25519(sha256(signature_payload ‖ xdr(scvVec(ids))))` and there is one rule id per authorised call (a tip is 2: `tip` + the USDC transfer). Same formula as the kit's `computeEntryAuthDigest`.
- The kit package itself is not a dependency: it pins `@stellar/stellar-sdk` 16 and its wallet creation is passkey/browser-page oriented, while our signing runs in an MV3 service worker on SDK 17. We use its deployed contracts and its documented format.
- `/api/relay` now allows the account's own admin functions (`WALLET_ADMIN_FUNCTIONS`: context rules, signers, policies), never `execute` or `upgrade`.
- `contracts/wallet` (our custom account) is removed; it is in git history (commit 6266515).
- Proven: `scripts/spike-oz-account.mjs` (tip `21acf15a…`), `verify-chain.mjs` against the branch API, and `e2e-extension.mjs` in Chrome: onboarding, tip `8834873…`, and a popup withdrawal `d4126d77…`.
- Wallets made by v0.2.0 (our old contract) are not relayed any more. Testnet only, so they are abandoned, not migrated.

**Earlier spike (superseded).** `scripts/spike-wallet.mjs` (removed) deployed a wallet for a fresh ed25519 key, funds it with 5 USDC (no trustline, no XLM), and tips 2 USDC through the escrow. The owner key signs only the auth entry, and the relayer is the transaction source and pays the fee. Each step takes about 5 s. Proof: tip tx `9ee6ea9d868ac14e3ee82562b773a59c16bbc48f0ffeb21b8ad839308d0699f6`.

**Decisions made during the port**
- Accounting stays at **6 decimals**; only the chain layer works in Stellar's 7 (`toStroops` / `fromStroops` in `shared/src/stellar.ts`). Going up is exact, so fees, limits, DB columns and most tests did not move. Balances truncate the 7th decimal for display.
- The gifter's key is SEP-5 (`m/44'/148'/0'`), so Tipee's 12 words restore in any Stellar wallet. Checked against SEP-5's own test vector.
- The wallet address is computed offline from the owner key (deployer = relayer, salt = sha256(owner)), and the extension refuses a `/api/wallets` answer that differs.
- The extension refuses any escrow other than `ESCROW_CONTRACT_ID`, whatever the API says.
- The relayer is the source of every gifter transaction; the gifter signs only auth entries. `/api/relay` accepts `escrow.tip`, `usdc.transfer` out of a wallet, and a wallet's own session calls, and rejects source-account credentials and anything naming the relayer (tests in `api/src/stellar.test.ts`).
- Claims are submitted *by the verifier account*: its `require_auth` is only met by a source-account signature when it is the transaction source.
- Activity reads the USDC contract's `transfer` events in 4,000-ledger windows (≤6 of them, ~33 h). Wider windows hit the public RPC's processing limit on that busy contract.
- The service worker is bundled as one file with `modulePreload: false`: Vite's preload helper touches `document`, which a worker does not have.
- The API runs on the in-memory store when `DATABASE_URL` is unset. The chain is the record of every tip and balance, so a restart loses bookkeeping only. Migration `002_stellar.sql` covers Postgres.
- Verification: `/api/creators/verify/init` issues `tipee-<16 hex>`; the creator puts it in their channel description; `/verify/confirm` finds it on `youtube.com/channel/<id>/about`; `/claim` spends it once.

Things the spike settled:
- Testnet simulation returns `sorobanCredentialsAddressV2` auth entries (CAP-71, address-bound payloads). `authorizeEntry` in `@stellar/stellar-sdk` 17.1.0 builds the right preimage for it. Older SDKs that only know `sorobanCredentialsAddress` would sign the wrong payload.
- The wallet's `__check_auth` takes `Vec<{ public_key, signature }>`, which is exactly what `authorizeEntry(entry, keypair, …)` emits, so no custom signing code is needed.
- SDK 17 exposes XDR fields as properties (`entry.credentials.type`), not methods.
- Wallets are deployed with `salt = sha256(owner public key)` from the relayer, so one owner key maps to one wallet address.

**Deployed** (2026-10-12)
- API: `https://tipee-api.duckdns.org`, the systemd unit `tipee-api` (from `ops/tipee-api.service`) on `127.0.0.1:3477` behind the VPS's Caddy. Secrets in `~/.config/tipee/api.env` (mode 600). Logs: `journalctl -u tipee-api`. The VPS's Caddy also fronts the owner's other services, so it is never edited from here. The owner pasted the snippet twice once, which made the file invalid until the duplicate was removed. Validate with `caddy validate --config /etc/caddy/Caddyfile` after any edit.
- Repo public; `main` = `stellar-port`. Release `v0.2.0` carries the extension zip built with `VITE_TIPEE_API=https://tipee-api.duckdns.org`; the downloaded zip passed `scripts/e2e-extension.mjs` in Chrome.
- `ops/run-api.sh` remains as the no-root fallback.
- Not yet: the Vercel site (owner imports with root `packages/web`, `NEXT_PUBLIC_TIPEE_API=https://tipee-api.duckdns.org`), a claim on a channel the owner controls, the demo video, and the in-platform submission.

**Running it locally**
```sh
export RELAYER_SECRET=$(stellar keys show tipee-relayer) VERIFIER_SECRET=$(stellar keys show tipee-verifier)
PORT=3477 npm start -w @tipee/api                      # port 3111 is taken on this machine
API=http://localhost:3477 node scripts/verify-chain.mjs @fireship
VITE_TIPEE_API=http://localhost:3477 npm run build -w @tipee/extension
```
Kill the API with `kill <pid>`; `pkill -f src/server.ts` also matches the shell running it.

**Contracts** live in `contracts/` (Cargo workspace, `soroban-sdk = 28.0.0`). Build: `stellar contract build`. Test: `cargo test`.
- `escrow`: `tip(from, channel_id, amount, note)`, `claim(channel_id, to)` (verifier only, floors the 4% fee like `fees.ts`), `balance`, `lifetime`, `config`, `set_verifier`, `set_treasury`, `upgrade`. Channel IDs are validated on chain (`UC` + 22 base64url chars). Notes are capped at 120 bytes.
- `wallet`: owner ed25519 key can do anything; an optional session key may only call `escrow.tip` (plus the USDC transfer into the escrow it makes) under a daily cap until it expires.

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
- `website-plan.md` holds the plan for `tipee.xyz`. `plan.md` covers the extension and API; `idea.md` is the original product spec; this file is the running state.
- `@tipee/web`: the Next.js site. Builds through `npm run build` at the root along with everything else, but is not part of the root `tsc --build` graph — see the website slice below for why.
- This workspace **is** a git repository, on `main`.

## Latest Validation
Re-run 2026-09-15 after the white/Anton/overlaid-video rebuild — `npx tsc --build` exits
0, `npm test` passes **359 in 21 files**, and `npm run build` compiles all four
workspaces. The site's four routes still prerender static, and `/` served
locally returns 200 along with `/clips/hero.mp4` (2,559,857 bytes) and
`/clips/hero-poster.jpg`. Hero, `/viewers` and phone width (390px, via the
iframe trick below) were photographed and checked, not just built, and hero text
contrast was measured against every frame of the clip rather than eyeballed.

Earlier the same day, before that rebuild:
- `npm test` — **359 passed**, 21 files.
- `npx tsc --build` — clean.
- `npm run build` — extension output written to `packages/extension/dist/`; `dist/content.js` verified as a single file with no module syntax.
- `npm run build` also builds `@tipee/web` now. Four routes prerender static: `/`, `/viewers`, `/install`, `/_not-found`. Served locally and checked — every route 200s, every internal link resolves, and the Talise tokens reach the emitted CSS (`#2f6a1f`, `#ecefe8`, `.bracket`, and the generated `bg-forest` / `text-muted` / `text-hero` utilities).
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

## Built This Slice: white, black, grey, green, and a clip behind the type (2026-09-15, later)

The owner's verdict on the warm rebuild from earlier the same day: *"tipee
current website is just like all the other ai slop website"*. Fair. Cream
ground, rounded everything, a butter-yellow highlighter under the headline and
a soft aurora behind it is the house style of every generated landing page.

Decisions, all the owner's:

1. **A supplied clip carries the hero** - free-for-commercial-use footage at
   `Free Videos/Hero.mp4`. Black and white, POV motorcycle, 10s.
2. **The background stays white.** Not cream.
3. **The wordmark is `tipee`, lowercase, black, in a fast face** -> Anton.
4. **White majority, with black, grey and the extension's green.** Butter yellow
   retired from the marketing surface.
5. **The type is overlaid on the clip**, with frosted blur for readability.
6. **The wordmark lives in the nav and nowhere else.**

### Two things were built wrong first, and both are worth recording

**A nameplate nobody asked for.** The first pass set "tipee" at poster size at
the top of the hero body. The brief said "the hero logo text" and that was read
as licence to invent a masthead. It was wrong on its own terms too: the wordmark
already sits in the nav a few pixels above, and a hero whose largest element is
the brand name spends its fold saying what the product is called instead of what
it does. There is now exactly one wordmark on the page and it is in the nav.

**The clip under the type instead of behind it.** The first pass put the footage
in a full-bleed band *below* the hero text. Overlaying was the actual request.

Both were avoidable by reading the brief as written rather than as a prompt.

### The frost, and where its numbers come from

Black type over black-and-white footage is the hard case: a single frame runs
from blown-out sky to near-black road, so a flat opacity fade leaves dark
patches dark and any word that lands on one fails.

**The blur is what fixes that, not the white.** Blurring the backdrop destroys
the local contrast that makes patches, so what sits behind the text becomes near
enough a single mid-tone that a white veil lifts predictably.

The first frosted build applied one flat sheet across the whole hero and it was
mush - strong enough to carry type on the left, it also made the right two
thirds unidentifiable, and a backdrop nobody can tell is a motorcycle is worse
than no backdrop. So the blur is **masked**: full strength under the type
column, gone by 84% across, leaving the bike sharp where nothing is written.
`mask-image` clips an element and its `backdrop-filter` together, so this costs
one div and no JavaScript.

The veil stops are set by a **measured contrast floor**, not by eye. Every frame
of the shipped loop was extracted, Gaussian-blurred at the CSS radius, and
composited under the authored gradient; the darkest result anywhere in the type
column is the number the stops are chosen against:

| text | worst case | needs | |
|---|---|---|---|
| ink, headline, large | 14.37:1 | 3.0 | pass |
| forest green, large | 3.98:1 | 3.0 | pass |
| muted, body 18px | 4.87:1 | 4.5 | pass |
| muted, eyebrow 11.5px | 4.87:1 | 4.5 | pass |

86% white measures 4.87:1 against the darkest frame and 80% measures 4.1:1,
which is why the veil holds >=86% across the whole column before falling away.

Two findings from doing this:

- **The eyebrow failed at `text-faint`** - 3.43:1, against a 4.5 bar at 11.5px.
  `Eyebrow` now takes a `tone` prop. It is a **prop and not a className**
  because both candidates are `color` utilities and Tailwind settles that
  conflict by stylesheet order, not by the order the classes are written - a
  `text-muted` passed in from outside can silently lose. Same trap the nav's
  Add-to-Chrome button already documents.
- **Screenshotting the page to measure this does not work.** Under
  `--virtual-time-budget` the video does not advance, so every frame sampled is
  identical, and text glyphs contaminate any band you sample. Measure the clip
  and the CSS, not the screenshot.

### The mobile veil bug, which shipped for one build

The left-to-right grading is correct wide and **wrong narrow**, and it went out
that way before a phone screenshot caught it. On a phone the type column *is*
the full width, so the thin right-hand end of the veil sat under the tail of
every wrapped line - "worth nothing anywhere else" ran straight across the bike.

Narrow, the veil is now near-flat at 90-93% and the blur is unmasked: there is
no text-free region to protect, so there is nothing to grade toward. Measured
the same way, worst case 5.39:1 for body copy.

The general lesson: **a gradient that protects text is a function of where the
text is**, and where the text is changes at every breakpoint.

### 117 MB in, 2.4 MB out

Straight 1080p transcode of that master: **16 MB**. Black-and-white foliage under
motion blur is close to worst-case H.264 input. What fixed it, in order of
effect: crop to the band's real 21:9 first (stop encoding pixels the layout
hides), `hqdn3d` before the scaler (grain was eating the bitrate), 24fps, then
CRF. Full command in `packages/web/ASSETS.md`; the master is gitignored.

- **VP9 came out bigger than x264 here** - 6.8 MB against 2.4 MB at matched
  quality, the opposite of the usual result, because the input is denoised
  greyscale. Dropped; there is no `<source>` fork.
- **The loop is an `xfade` of the clip into itself.** `loop` on a hard cut jumps
  the road sideways every six seconds.

### The clip is decoration, and the docs say so out loud

It is a motorcycle. It proves nothing about tipping anybody. That is acceptable
for a hero - it sets a tempo - but it is **not** an asset in the `ASSETS.md`
sense and must never stand in for one. `shots/gift-button.png`, the Tipee button
on a real watch page, is still the most important thing missing from this site,
and is now easier to forget because the hero looks finished.

It is `aria-hidden`, and `hero-clip.tsx` renders the **poster as a still** for
`prefers-reduced-motion`. That is a JavaScript branch and not a CSS rule on
purpose: there is no way to stop `autoPlay` from a stylesheet, and the first
render is always the still, so a reader who asked for no motion never gets one
frame of it.

### Also changed

- `TestnetNotice` went from `tone="butter"` to `tone="outline"`. It is a caveat,
  not a highlight, and in yellow it pulled harder than the headline.
- The headline's underline is forest green. Green now means "actionable"
  without exception.
- The aurora is gone from `/` entirely - it was standing in for exactly the
  depth the clip now supplies, and running both put two light sources behind one
  headline. It survives on other routes.
- `Wordmark` is Anton and carries **no weight class**: the face has one weight,
  already black, and `font-extrabold` on top asks the browser to synthesise a
  bold that smears the stems at nav size.
- `/viewers` is untouched apart from the palette. It has its own hero.

## A trap that cost a build: node_modules was renamed to `Videos`

Mid-session, `node_modules/` at the repo root was renamed to `Videos/` — almost
certainly a mis-click while making a folder for the hero footage. The symptom is
`'next' is not recognized as an internal or external command` and nothing else;
nothing says a directory moved. `git status` stays clean because `node_modules/`
is ignored, so the usual instinct of checking git tells you nothing.

If a build suddenly cannot find a binary it found ten minutes ago, check that
`node_modules/` still exists under that name before reinstalling anything.
Renaming it back is instant; a reinstall is not.

## Built This Slice: the website, rebuilt warm (2026-09-15)

The owner rejected the first pass as "not good enough", re-pointed at
buymeacoffee.com, and asked for the videos that had been requested verbally in
an earlier session and never written down. **That request was not in this file,
`website-plan.md`, or git** - it existed only in a conversation nobody recorded.
Write requests down here when they are made.

Three answers were chosen by the owner before any code was written:

1. **The "videos" are self-playing demos built as markup, not recordings.**
2. **The visual direction is warmer and closer to BMC** - explicitly accepting
   that the site stops matching the extension's sage/monospace look.
3. **The lookup hero stays.** It is the one thing no competitor can say.

### The demos - `components/demo/`

Three looping sequences replace what would otherwise be screen recordings:
`TipDemo` (watch page -> composer -> PIN -> sent), `VerifyDemo` (About-page
token -> check -> verified -> withdrawable) and `WalletDemo` (balance, activity,
deposit).

They are markup rather than video on purpose. A recording would be megabytes,
soft on a retina display, stale the moment a button changed, and impossible to
produce at all until somebody sat down and recorded one - which had already
blocked this once. Markup costs nothing to ship, stays sharp, and is authored
from the same tokens as the product.

What a recording still buys is *proof that this runs*. That is what the slots in
`components/media.tsx` are for, and why the demos sit behind a component
boundary a real clip can replace without a layout change. `ASSETS.md` is the
manifest.

`use-demo-timeline.ts` enforces three rules: nothing animates off-screen
(`IntersectionObserver`), nothing animates in a background tab
(`visibilitychange`), and nothing animates under `prefers-reduced-motion` -
which pins each demo to its most informative frame instead of its opening one.

### Design system - what changed and why

The palette moved from sage/white to **cream `#fffbf4` with warm-tinted shadows
and rounded corners**. Body type moved from JetBrains Mono to **Plus Jakarta
Sans**; mono is kept for amounts, addresses, handles and code, where tabular
figures earn it. Monospace at paragraph length reads as a terminal, which is
right for a tool and wrong for a page someone has to warm to.

Two things carry over unchanged so the site and the extension still read as one
product: **the forest green** and **the corner-tick motif**. The extension was
not touched.

`GiftMark` in `ui.tsx` draws a parcel with a butter ribbon - the wordmark had no
mark at all before, which read as unfinished at page scale. It is deliberately
plain so a real logo replaces it without anything moving.

### Bugs found by rendering the page rather than trusting the code

Screenshots were taken with the installed Chrome in headless mode. Four real
faults surfaced that reading the source did not:

- **`.aurora` used `z-index: -1`** and was therefore invisible. A negative-z
  child of a section that creates no stacking context paints behind the *root*
  background, not behind its own parent's content. It is `z-index: 0` now, with
  hero content on `relative z-10`.
- **The nav's "Add to Chrome" showed on phones** despite `hidden sm:inline-flex`.
  `ButtonLink`'s base classes already set `inline-flex`, and Tailwind settles a
  display conflict by **stylesheet order, not class order** - so `hidden` lost.
  The responsive display now lives on a wrapper. Worth remembering: never pass a
  `display` utility into a component whose base string already sets one.
- **Scroll-reveal shipped `opacity: 0` in the HTML itself.** Any reader whose
  JavaScript did not run got the hero followed by an entire invisible page. The
  hidden state is now gated behind a `.js` class set by an inline script in the
  head, so the no-JavaScript rendering is the finished page without animation.
- **The 404 was Next's default black-on-white**, which on a cream site reads as
  a crash. `app/not-found.tsx` now exists.

### A correctness fix worth calling out

`channel-lookup.tsx` keyed its sample balances to **`@fireship` and
`@veritasium` - real channels**. Typing a real handle returned "$127.00
waiting", a false statement about a stranger's money made by a site whose whole
pitch is that it can be trusted with money. Samples are now fictional
(`@pixelforge`, `@northbound`), are labelled "Sample channel" in the result, and
every real handle falls through to the zero state, which is simply true.

### Verifying visual work in this repo

There is no Playwright or Puppeteer, but Chrome is installed and headless
screenshots work:

```text
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new \
  --disable-gpu --hide-scrollbars --virtual-time-budget=7000 \
  --window-size=1440,2400 --screenshot=out.png http://localhost:3000/
```

Three things to know before trusting what comes back:

- **`--window-size` below ~640px does not produce a narrow layout viewport** on
  Windows; Chrome enforces a minimum. To check phone width, point the screenshot
  at a local HTML file holding a 390px-wide `<iframe>` of the page.
- **Anchor scrolling (`/#verify`) does not work** under `--virtual-time-budget`.
  To see a section further down, offset an iframe with a negative `top`, or
  render the component alone on a scratch route.
- **CSS transitions often photograph mid-flight**, so a screenshot can show a
  stale frame while the markup is already correct. Confirm with `--dump-dom`
  before "fixing" a transition that is not broken.

### What renders
- **`/`** - creator spine: lookup hero, full-width tip demo, proof strip, three
  steps, the verification demo, 96/4 split, built-on, custody, FAQ, closing
  lookup.
- **`/viewers`** - viewer spine: split hero with the tip demo, three steps, the
  wallet demo, what a tip costs.
- **`/install`** - honest that there is no Web Store listing; real unpacked
  steps.
- **`/404`** - themed.

### Decisions worth not re-litigating
- **The toggle is two real routes**, not two client states behind one URL.
  `SiteNav` marks the active one from `usePathname` and swaps with `Link`, so it
  feels instant while both halves stay linkable and indexable. Nav and footer
  live in the layout and never unmount.
- **The lookup uses `@tipee/shared`’s `parseChannelRef`**, the same function the
  extension and API use, so what the site accepts cannot drift from what the
  backend accepts. Only the balance is mocked; when `POST /api/creators/claim`
  lands, one function in `channel-lookup.tsx` changes and the three result
  states stay as they are.
- **The split section and both demos compute their numbers with
  `splitWithdrawal` and `formatUsdc`**, not hard-coded copy - a fee quoted on the
  landing page and a fee taken at withdrawal drifting apart is exactly what
  nobody notices until a creator does.
- **The demos abstract YouTube rather than reproducing it.** A stylised player, a
  generic action bar, a fictional channel. Reproducing YouTube's marks would be
  both a trademark problem and a claim about what is running; what is true is the
  *position* of the button, and that is what is drawn. Each demo is captioned "a
  live re-creation of the extension - not a recording".
- **Fonts are self-hosted via `next/font`**, unlike the extension which imports
  them from Google at runtime.
- **`transpilePackages: ['@tipee/shared']`** is required - that package’s
  `exports` point straight at `./src/index.ts` with no build step.
- **`packages/web` is deliberately NOT in the root `tsconfig.json` references.**
  Next needs `jsx: preserve` and bundler resolution, which fight the
  project-reference build. It typechecks through `next build` instead.

### A trap for whoever builds next
On Windows, `next build` can fail with
`Cannot find module '../lightningcss.win32-x64-msvc.node'`. That is npm failing
to install an optional platform binary that Tailwind v4 needs, not a code fault.
Fix:

```text
npm install lightningcss-win32-x64-msvc --no-save
```

It is intentionally not in `package.json` - pinning a win32 binary there would
break every other platform.

### Known gaps in what was built
- **No real screenshots or footage.** The demos carry every claim; `ASSETS.md`
  lists exactly what to send and where it plugs in, in priority order. Nothing
  there blocks a deploy.
- **No logo.** `GiftMark` is a drawn stand-in.
- **No terms or privacy pages**, and the footer’s Legal column is still absent
  rather than pointing at 404s. Restore the column with the pages.
- **`/claim`, `/v/[token]` and `/c/[handle]` do not exist.** They need §6’s API
  routes.
- **Dark mode is not implemented.** The palette is a warm, specific thing and a
  rushed inversion would look worse than its absence.
- **`website-plan.md` §5 is now out of date** - it specifies the sage/monospace
  expression, which the owner replaced on 2026-09-15. The rest of that plan
  still holds.

## The Website Plan (written 2026-09-14)

Direction set by the owner: build `tipee.xyz` before finishing §6's creator dashboard. Two audiences behind a toggle, creators default. References given: buymeacoffee.com for structure, talise.io for the visual language — the same one the extension already speaks.

Full plan in **`website-plan.md`**, with a visual version published as an artifact (link in that file’s header comment is not stored; ask the owner or re-publish). Read the plan before writing any website code — it settles several things that are easy to get wrong:

- **The hero is a lookup, not a signup.** Tipee’s escrow is provisioned by the *gifter*, so a creator arrives to money that already exists. The landing page therefore opens with "You might already have money waiting" and a channel-URL field that is literally step one of `/claim`. Every competitor opens with "start your page"; we cannot, and should not.
- **The toggle swaps the spine, not the site.** Creator at `/`, viewers at `/viewers` — both real routes, so both are linkable and indexable. Nav, footer, security, built-on and FAQ are written once and never move. Two thin landing pages sharing one URL is the failure mode being avoided.
- **Stack: Next.js App Router + Tailwind v4 in `packages/web`**, tokens mapped through `@theme`. No shadcn/ui — its defaults fight the established design language. The site talks to the existing Fastify API, not to Next API routes.
- **`/v/[token]` must be server-rendered and crawlable.** YouTube fetches and displays About-page links, and the whole verification method depends on that URL resolving properly. This is the reason a framework is justified here when the extension deliberately avoids one.

### The dependency worth knowing
The marketing spines (phases 0–4 in the plan) are unblocked and need no API work. Only `/claim` and `/v/[token]` need §6’s four endpoints, which still do not exist. So the website can start immediately and §6 can land underneath it.

### Waiting on the owner — none of it blocking
Superseded by `packages/web/ASSETS.md`, which lists filenames, dimensions and
the slot each one plugs into. Nothing there stops a deploy: the demos carry
every claim the site makes, and each asset is a straight upgrade when it lands.

The two items that are genuinely gaps rather than polish:

1. **There is no Tipee logo anywhere in the repo** — only `arc_logo.png`.
   `GiftMark` is a drawn stand-in. Need an SVG wordmark and a square mark.
2. **`manifest.json` declares no `icons` field**, so Chrome shows the default
   puzzle piece — in the toolbar, on the extensions page, and in any install
   screenshot anyone takes. Need 16/32/48/128px PNGs. This is a real gap
   independent of the website, and it degrades asset 1 in `ASSETS.md`.

Six open decisions are listed at the end of `website-plan.md` and should be answered before phase 2.

### Asset 1: which channel the gift-button shot is taken on (asked 2026-09-15)

The owner proposed capturing `shots/gift-button.png` on a **MrBeast** watch page.
Answered: the *frame* is right — dark-theme watch page, full action bar, real
view count — but the channel is not, and the shot as proposed is a "before"
anyway (no Tipee button in it, since the extension was not loaded).

Rejected for the same reason creator faces are excluded from `ASSETS.md`: a
hero showing a named creator's avatar, handle, verified badge and subscriber
count beside a "tip this creator" button reads as an endorsement nobody gave,
and to a judge it reads as fabricated traction. MrBeast is the strongest
possible version of that mistake, not an exception to it.

Recommended instead, in order:
1. **A channel the owner controls.** Needed regardless — `shots/about-verified.png`
   requires a channel whose About page we can edit, so both assets come from one
   session.
2. A small channel that has explicitly agreed to appear.
3. A tight crop of the action-bar row alone — Tipee beside Like, no avatar, no
   handle, no title. Legible on mobile, and it is the only thing the image is
   there to prove. Weakest on "this is a real page", strongest on permission.

Capture notes for whichever is chosen: load the extension unpacked first (the
button does not exist otherwise), fix the extension icons before shooting
anything with the toolbar in frame, crop to 1600 x 900, and take light theme as
well as dark — `website-plan.md` asks for both.

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
1. Load unpacked in Chrome and confirm the gift button appears on a watch page and opens the composer. This was blocked by the bundle bug and is not any more. It no longer blocks the website — the demos stand on their own — but it is what makes the real screenshots in `packages/web/ASSETS.md` capturable.
2. Deploy `packages/web` to Vercel. It builds clean and has nothing left blocking it.
3. Build §6’s four API routes, then wire `/claim` to them. `memoryStore()` and `fakeEscrow()` cover development, so this needs no Postgres and no Circle call.
4. Install a Postgres and point `DATABASE_URL` at it — Docker Desktop, a native Windows install, or a hosted one. The last would change the URL away from `localhost`. Then run the first migration and fix what it finds.
5. Provision one escrow through Circle and check the address it returns. The credentials and the wallet set are ready; this is the first call that has never been made.
6. Creator dashboard: `/claim` lookup, About-page verification token, authenticated withdrawal with the 96/4 split. Their tables already exist in migration 001.
7. Walk a real watch page end to end, through a tip that lands on testnet.

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
