# Assets — what to send, and where it goes

The site is **finished without any of these**. Every claim it makes is carried by
the three live demos in `components/demo/`, which are real markup rather than
recordings — they cost nothing to ship, stay sharp at any pixel density, and
cannot go stale when a button changes.

What these add is *evidence*: proof the thing exists outside its own marketing.
So nothing below blocks a deploy. Send them in the order listed and each one
makes the site better the moment it lands.

## How to add one

1. Drop the file in `packages/web/public/shots/` (or `public/clips/` for video).
2. Pass its path to the slot — one prop, no other change:

```tsx
<Shot src="/shots/gift-button.png" alt="…" width={1600} height={900} spec="…" />
```

Leave `src` off and a designed placeholder states what belongs there, so a
half-supplied page reads as work in progress rather than as broken.

---

## Priority 1 — the ones that change how the site is believed

### `shots/gift-button.png` — 1600 × 900

The Tipee button on a **real** YouTube watch page, beside Like. This is the
single most valuable asset on the list: the demo shows where the button goes,
but a photograph of it actually there is the difference between a claim and a
receipt.

- Load the extension unpacked (see `/install`), open any video, screenshot the
  player and action bar.
- 2× DPI if you can. Light YouTube theme.
- Use a channel you control or one that will not mind appearing.

### `brand/logo.svg` + `brand/mark.svg`

There is still no commissioned logo. `components/ui.tsx` draws a `GiftMark` —
a parcel with a butter-yellow ribbon, built from the same glyph the extension's
button uses. It is deliberately plain so a real mark can replace it without
anything around it moving.

Send: a wordmark SVG, a square mark for favicon and social, and the gift glyph
on its own if it differs from the wordmark's.

### Extension icons — 16, 32, 48, 128 px PNG

**Not a website asset, but the most visible gap in the product.**
`packages/extension/manifest.json` declares no `icons` field at all, so Chrome
shows the default puzzle piece today — in the toolbar, on the extensions page,
and in every install screenshot anyone takes, including asset 1 above. Worth
fixing before the gift-button shot is captured.

---

## Priority 2 — proof and polish

### `shots/wallet-home.png` · `wallet-activity.png` · `wallet-deposit.png` — 720 × 900 each

The three real popup screens. The `WalletDemo` reproduces these faithfully, so
these are a straight upgrade rather than a gap — send them when convenient.

### `shots/about-verified.png` — 1600 × 1000

A real YouTube About page with a `tipee.xyz/v/…` link visible in its links
section. Needs a channel you control. This is the one step of the product a
creator has to take on trust, so a real screenshot of it is worth more than the
diagram.

### `og.png` — 1200 × 630

The social card. I can compose this from the wordmark and the palette once the
logo lands; it is currently unset, so links to the site unfurl with text only.

### Sponsor marks — `brand/arc.svg`, `brand/circle.svg`, `brand/usdc.svg`

`arc_logo.png` exists at the repo root. Circle's and USDC's official SVGs are
needed, plus a check that our usage fits their brand guidelines — a sponsor mark
used wrongly reads worse than no mark at all. The "Built on" section currently
sets both names as type, which is a legitimate finished answer if the marks
never arrive.

---

## Priority 3 — real footage

### `clips/tip.mp4` (+ `clips/tip-poster.png`)

A screen recording of one tip, end to end, on a real watch page. 1600 × 900,
H.264, **under 8 seconds and under 3 MB**, no audio.

`components/media.tsx` exports a `Clip` slot that takes it: muted, looping,
`playsInline`, with a poster frame — because autoplay is routinely blocked and a
black rectangle is worse than no video at all. It has the same footprint as
`TipDemo`, so swapping one for the other is a one-line change.

Send a poster frame with it. Without one, the blocked-autoplay case shows
nothing.

---

## Deliberately not on this list

- **Creator showcase faces.** Buy Me a Coffee's row of real creators is its
  strongest proof and we cannot copy it: showing real YouTubers' avatars implies
  an endorsement nobody gave. The honest version is aggregate and faceless, and
  the site has no traction to aggregate yet — so it is left out rather than
  faked.
- **Testimonials.** Same reason. Nobody has used this yet.
- **Stock photography of people at desks.** It would not survive contact with
  the rest of the page.
