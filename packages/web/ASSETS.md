# Assets — what to send, and where it goes

## Already landed: the hero clip

`public/clips/hero.mp4` + `hero-poster.jpg` — a black-and-white POV motorcycle
ride, looping full-bleed **behind** the hero on `/`, under a frosted white pane
that the headline, lookup and body copy sit on top of. Licensed for commercial
use and supplied by the owner. Rendered by `components/hero-clip.tsx`, which
carries the reasoning for how the frost is built and where its numbers come
from.

It carries **no claim about the product** and that is the condition of it being
there at all: nobody in it is using Tipee, no screen in it is ours, and it is
not standing in for a screenshot nobody has taken yet. It sets a tempo. That is
why it is `aria-hidden`, why a reader who asks for reduced motion gets the
poster frame as a still instead, and why every asset below is still worth
sending.

### Re-cutting it

The 4K master lives in `Free Videos/Hero.mp4` at the repo root and is
**gitignored** — 117 MB for ten seconds. The shipped encode is 2.4 MB, and the
gap between those two numbers is the whole job: black-and-white foliage under
motion blur is about as hostile as H.264 input gets, and a straight 1080p
transcode of this clip lands at 16 MB. Four things brought it down, in order of
how much they mattered: cropping to the band's real 21:9 (throws away 40% of the
pixels rather than encoding pixels the layout then hides), `hqdn3d` before the
scaler (the grain is what was eating the bitrate), 24fps, and only then CRF.

```bash
# ffmpeg is not a dependency of this repo; npx it or install it however.
CH="crop=iw:iw*9/21,scale=1600:-2:flags=lanczos,hqdn3d=4:3:6:6,fps=24,hue=s=0"
ffmpeg -i "Free Videos/Hero.mp4" -i "Free Videos/Hero.mp4" -filter_complex   "[0:v]$CH,trim=0:6.4,setpts=PTS-STARTPTS[v0];    [1:v]$CH,trim=0:0.7,setpts=PTS-STARTPTS[v1];    [v0][v1]xfade=transition=fade:duration=0.7:offset=5.7[v]"   -map "[v]" -an -c:v libx264 -profile:v high -preset veryslow -crf 33   -pix_fmt yuv420p -g 48 -movflags +faststart -y packages/web/public/clips/hero.mp4

ffmpeg -i packages/web/public/clips/hero.mp4 -frames:v 1 -q:v 6   -y packages/web/public/clips/hero-poster.jpg
```

The clip is fed to itself through `xfade` so the last 0.7s dissolves into the
first frame: `loop` on a hard cut would jump the road sideways every 6 seconds.
The poster **must** be regenerated from the encode, not the master — it is the
first frame of what actually plays, and a poster that does not match frame one
shows as a flash on load.

VP9 was tried and dropped. At matched quality it came out **larger** than x264
here (6.8 MB against 2.4 MB), which is the opposite of the usual result and is
down to the denoised greyscale input; it bought nothing for a second 2 MB
download and a `<source>` fork.

---

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

Note that the hero clip does **not** do this job and was never going to — it is
a motorcycle. This is still the most important thing missing from the site.

- Load the extension unpacked (see `/install`), open any video, screenshot the
  player and action bar.
- 2× DPI if you can. Light YouTube theme.
- Use a channel you control or one that will not mind appearing. Not a large
  creator: their avatar and subscriber count beside a "tip this creator" button
  reads as an endorsement they never gave. A channel you control is also the one
  `shots/about-verified.png` needs, so both come out of one sitting.

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
