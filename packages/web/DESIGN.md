# Tipee web: DESIGN.md

Fast path of the imagination engine (2026-10-12, about nine hours before the deadline).
Read this before any UI change. Anything not written here was not decided.

## 0. Thesis

```
THESIS      Tipee is a tip button beside Like whose money waits on Stellar for a creator who has never heard of it; it refuses the "start your page" signup funnel.
WORLD       sage ground, Hanken Grotesk 600/400 with JetBrains Mono for money and addresses, white tiles, ink pills; forest green means money held for or paid to a creator, nothing else.
STORY       hook with the tip landing in escrow, three steps, the live lookup on a dark band, Super Thanks versus Tipee, the contracts and receipts, the close.
FIRST VIEW  two-line claim left, one sentence, Add to Chrome + check a channel, the signature stage right.
SIGNATURE   a video's action bar, the gift is pressed, and the tip drops into a ledger card addressed to a channel ID that has not signed up.
REFUSES     crypto casino neon, a fintech dashboard of fake charts, a mascot or emoji confetti.
```

## 1. Distill

| | |
|---|---|
| What it is | Tip any YouTube creator in USDC from the video page, before they sign up |
| For whom | A viewer fourteen minutes into a tutorial that just fixed their bug; and the creator who later finds money with their channel's name on it |
| The one action | Viewers: add Tipee to Chrome. Creators: check your channel |
| Mechanism | `escrow.tip` on Soroban holds USDC under the YouTube channel ID. The gifter's wallet is an OpenZeppelin smart account; the relayer pays every fee, so no XLM. The creator proves the channel with a one-hour code in its description and the contract pays 96% to any Stellar address |
| Feels | generous, receipted, at home on YouTube |
| Never feels | casino, dashboard, cutesy |
| Proof | the lookup reads the escrow contract live (@fireship: 16.50 USDC waiting today); real tip and claim transactions on stellar.expert |
| Product noun | tip |

## 2. Signature

| Metaphor | Clarity | Specific | Build | Motion | Fit | Total |
|---|---|---|---|---|---|---|
| Action bar to escrow ledger: the gift is pressed and the tip lands in a card addressed to a channel ID | 3 | 3 | 2 | 3 | 3 | 14 |
| Live number: "16.50 USDC is waiting for @fireship" read from the contract | 3 | 3 | 3 | 1 | 3 | 13 |
| PO boxes keyed by channel ID, envelopes collecting | 2 | 2 | 2 | 2 | 2 | 10 |
| A till receipt printing tips | 2 | 1 | 3 | 2 | 2 | 10 |
| A tip jar filling | 2 | 0 | 3 | 2 | 1 | killed |

**Chosen: the action bar to ledger.** The live number becomes the creator beat (section 4).

- Still frame: a video action bar (like count, Share, the Tipee gift lit), the composer open
  with 5 USDC chosen, and a ledger card "Held for @channel, not on Tipee yet" with three rows
  and a forest total.
- Motion: a preset is chosen, the composer says "Sent 5.00 USDC", a new row slides into the
  ledger, the total counts up. One loop every ~7s, paused offscreen.
- Reduced motion: the final frame, with the new row present.
- Phone: composer hidden; the action bar sits above the ledger, the tip drops straight down.
- Proves: the creator does not need to exist on Tipee for the tip to land.

## 3. Direction

**soft-product**, not quiet-monochrome: viewers and creators are consumers, and the extension
they install already speaks a warm sage-and-forest language; the site must look like the
same product. Borrowed dial: technical-grid's mono for labels, amounts and addresses (the
extension does the same).

Dials: light sage ground; Hanken Grotesk 600 display / 400 body; balanced density; round
(tiles 24, panels 32, pills); soft elevation; one accent.

Accent: forest `#2f6a1f`, accent-soft mint `#caffb8` (the extension's own). It means
**money held for or paid to a creator**: escrow balances, the gift, claimed amounts. Never
on navigation, never decorative. The primary action is ink, not green.

Uncalibrated (fast path).

## 4. Storyboard

| # | Beat | Pattern | Tone | Align | Copy |
|---|---|---|---|---|---|
| 1 | Nav | light bar, 64 | ground | container | tipee · How it works · Claim · GitHub · [Add to Chrome] |
| 2 | Hook | H3 split proof, signature stage right | ground | left | "Tip any YouTuber. Even one who's never heard of us." / A gift button beside Like sends USDC on Stellar. It waits in an escrow contract under the channel's ID until the creator proves it's theirs. / [Add to Chrome] Check a channel → |
| 3 | Orientation | B1 ruled columns, 3 | ground | left | "Three steps, and only one of them needs the creator." Tip / Held / Claimed |
| 4 | Creator lookup | live number + input, centered | dark band | center | "Someone may have tipped you already." live lookup |
| 5 | Contrast | comparison pair | ground | left | "Super Thanks waits for the Partner Program. Tipee doesn't." |
| 6 | Under the hood | index rows + receipts | surface | left | "Every number here is checkable on Stellar." contracts, smart accounts, relayer, receipts |
| 7 | Close | CTA pair (two tiles) | ground | center | "Watching" → Add to Chrome; "Making" → Claim your tips |
| 8 | Footer | column footer on surface | surface | container | testnet notice, repo, contracts |

Routes: `/` (above), `/claim` (the real flow, page-header pattern), `/install`. `/viewers`
redirects to `/`.

## 5. Wireframe, 1440

```text
+--------------------------------------------------------------------------------+
| tipee        How it works   Claim   GitHub                     [Add to Chrome] |  64h bar
|                                                                                |
|  STELLAR TESTNET · USDC          |  +------------------------------------------+|
|                                  |  | panel surface r32                        ||
|  Tip any YouTuber.               |  |  [▶ video  ━━━━━━━━━━━━━]                ||  2. stage
|  Even one who's never            |  |  👍 12K  Share  (🎁 gift lit)            ||
|  heard of us.                    |  |        ↓                                 ||
|  1. display-xl                   |  |  [composer: $5 chosen]  [ledger: Held   ||
|  lead 19px, 46ch                 |  |                          for @mira ...]  ||
|  [Add to Chrome]  Check a channel→  3.                                         ||
+--------------------------------------------------------------------------------+
```

Anchors: container edge at the gutter; hero copy 5 of 12 columns; stage 7 columns.
Eye path: headline, the green ledger total, Add to Chrome.
Squint: the headline is the darkest mass; the stage is the largest.

## 6. System

Tokens are in `app/globals.css`, from soft-product with the extension's palette:
ground `#f3f5ef`, surface `#e9ede3`, tile white, fg `#121a0f`, fg-mute `#55634e`,
fg-faint `#7f8b78`, line `#e2e6dd`, action `#121a0f`, accent `#2f6a1f`, accent-soft
`#caffb8`, on-accent-soft `#1d4612`. Dark band: ground `#0f140d`, accent `#caffb8`.

Ratios: display-xl 68px / body 17px = 4.0. Display tracking -0.035em, lh 1.02. Labels mono
12px +0.06em uppercase. Weights 400 and 600. Radii: chip/button pill, input 14, tile 24,
panel 32, feature 40.

## 7. Pre-mortem

| Wince | Countermeasure |
|---|---|
| A fake YouTube page reads as impersonation | No YouTube logo, red or player chrome; a neutral video bar in our tokens |
| Three identical step cards | Ruled columns with real numbers in each (5 s, 0 XLM, 96%) |
| Green everywhere because it is "the brand" | Green only on money held for a creator; actions are ink |

Screenshot sentence: "A video's like bar where a little gift button drops five dollars into
a ledger for a creator who isn't even on the app yet."

## 8. Critique log

Round 1 (2026-10-12, 1440 + 390): headline wrapped to five lines in 5 columns; receipt hashes overflowed the page by 22px (`short(hash, 8, 0)` kept the whole hash); the mint closing tile pushed accent coverage far past 5%; ledger header wrapped. Fixed: 6/6 hero split, sliced hashes, white close tiles, "In escrow" label, ledger capped at three rows so the loop never changes height.

Round 2: identity 2, hierarchy 3, typography 3, color 3, layout 2, surfaces 2, signature and proof 3, copy 3, motion and states 2, responsive 3 = 26/30. slop-check clean on app, components, lib. 0 console errors, no horizontal overflow at either width.

Unverified: og:image (not generated yet), 768 and 1024 widths, a real phone.
