# Tipee Website — Plan

Status: proposed, 2026-09-14. Nothing built yet.
Scope: `tipee.xyz` — the marketing site *and* the creator claim dashboard, which are the same product surface and should be built as one thing.

---

## 1. The insight this whole site is built on

Every creator-funding site on the internet opens the same way: **"Start your page."** Buy Me a Coffee leads with it, Patreon leads with it, Ko-fi leads with it. They have to, because until the creator signs up there is nothing — no page, no link, no money.

Tipee is not that shape. A gifter tips a channel that has never heard of us; the backend provisions a Circle escrow wallet keyed to `channelId` and the money sits there. **The creator's account is created by someone else, before they arrive.**

So our landing page does not ask a creator to start anything. It tells them something they don't know:

> ### You might already have money waiting.

That is the hero. Not a slogan — a lookup. The channel-URL input sits *in* the hero, and submitting it is literally step one of `/claim`. No signup wall, no "get started", no email capture before value. A creator lands, pastes their channel, and within one request either sees a balance or sees zero and understands what the product is.

Everything below follows from this. It is also our sharpest differentiator, and the only one a judge or a creator will remember.

**The risk, stated honestly:** most lookups will return $0 during a hackathon demo, and "$0.00 waiting" is a deflating first impression. The zero state therefore has to do real work — see §4.1. This is the highest-stakes single screen on the site.

---

## 2. The two-audience toggle, done without halving the page

You asked for two parts behind a toggle, creators default. The trap in that pattern is building two landing pages that share a URL: the page flickers between unrelated content, both halves get thin, and neither ranks for anything.

**The fix: the toggle swaps the spine, not the site.**

```
┌──────────────────────────────────────────────┐
│  nav · wordmark · [ For creators | For you ] │  ← persistent
├──────────────────────────────────────────────┤
│                                              │
│   S P I N E   (swaps with the toggle)        │
│   hero · how it works · proof · CTA          │
│                                              │
├──────────────────────────────────────────────┤
│  Built on Arc + Circle          (shared)     │
│  Security & custody             (shared)     │
│  FAQ  — questions filtered by audience       │
│  Footer                         (shared)     │
└──────────────────────────────────────────────┘
```

Rules that keep it honest:

- **Creator is default**, and the default renders server-side at `/`. The viewer spine is a real route at `/viewers`, not a client-only state — so it is linkable, shareable, and indexable. The toggle uses client-side navigation between them; it feels instant, but each has a URL.
- **The toggle is never the only way in.** Nav CTAs, footer links, and the install button all deep-link to the correct spine. Nobody should have to discover a toggle to find the half that's about them.
- **Shared sections never duplicate.** Security, custody, the Arc/Circle strip and the footer are written once and read correctly to both audiences.
- **The toggle animates by cross-fading content within a stable frame**, not by sliding the page. Nav and footer must not move; only the spine changes. Motion respects `prefers-reduced-motion`.
- **Remember the choice** in `localStorage` for return visits, but never override an explicit URL.

---

## 3. Information architecture

| Route | What it is | Rendering |
|---|---|---|
| `/` | Creator spine (default landing) | Static, SSR |
| `/viewers` | Viewer/gifter spine | Static, SSR |
| `/claim` | The claim dashboard — lookup, balance, verify, withdraw | Dynamic, authed after verification |
| `/c/[handle]` | Public creator page (see §3.1) | SSR, cached |
| `/v/[token]` | Verification target the creator links from YouTube About | SSR, must be crawlable |
| `/install` | Extension install landing + first-run guide | Static |
| `/legal/*` | Terms, privacy | Static (MDX) |

### 3.1 The one addition I'd argue for: public creator pages

BMC's actual growth engine is not its landing page — it's two million shareable `buymeacoffee.com/name` pages, each one an inbound link and a social card.

Tipee can have that for free, because **we already have the data before the creator arrives**. A page at `tipee.xyz/c/@handle` can show the channel, the tip count, and a "Tip this creator" button — for any channel that has ever been tipped, with no creator action.

Two things it earns:
1. **A share surface for gifters.** "I tipped this creator" is a link worth posting.
2. **The discovery path for creators.** A creator who Googles their own handle finds their page and the balance waiting on it.

It also gives the web a tipping path for people without the extension — the button falls back to `/install` with the channel remembered.

*Privacy check before building this:* it publishes that a channel has received tips, which the channel never consented to. Mitigation: show aggregate counts only, never individual gifter addresses or amounts, and honour a takedown request at `/c/[handle]`. Worth a decision, not an assumption.

---

## 4. Section-by-section

### 4.1 Creator spine — `/`

**Hero.** Wordmark, one line, one input.

> **You might already have money waiting.**
> Viewers can tip your channel in USDC straight from the video page — whether or not you've ever heard of Tipee. Paste your channel to see if anyone has.
>
> `[ youtube.com/@yourhandle          ]  [ Check ]`

No signup. The input submits to the `/claim` lookup. Behind it, softly, the hero image (§7, image 1).

**The result states are the product.** All three must be designed, not just the happy one:

| State | What it says | Why it matters |
|---|---|---|
| **Balance found** | `$127.00 waiting` — big, monospace, with tip count and "Claim this →" | The payoff. Everything aims here. |
| **Zero** | "No tips yet — but your channel is ready." Then: how to tell viewers, a link to the public page, the install link to share. | Turns the most common outcome into an action instead of a dead end. |
| **Not a channel** | Plain correction with an example URL. Never "invalid input". | Handles pasted video URLs, bare handles, and channel IDs — all of which people will try. |

**How it works — three steps, creator-framed.**
1. *A viewer tips you.* They click a gift button on your video and send USDC. No account needed on your side.
2. *It's held for you.* Tips land in a Circle escrow wallet tied to your channel ID — not your handle, so renaming doesn't break it.
3. *You verify and withdraw.* Prove the channel is yours by adding a link to your About page, then withdraw to any wallet.

**The split, stated before anyone asks.** A single honest block: **96% you / 4% Tipee**, taken at withdrawal, not at tip time. Show the arithmetic on a real number. Sites that hide this get asked about it in every comment thread; sites that lead with it get trusted.

**Verification, explained visually.** The About-page link method is unusual enough that it needs a picture, not a paragraph — see §7, image 6.

**Closing CTA.** The same lookup input as the hero. A creator who read the whole page should not have to scroll back up.

### 4.2 Viewer spine — `/viewers`

**Hero.**

> **Tip the creator, from the video.**
> A gift button, right next to Like. Pick an amount, type your PIN, done — in USDC on Arc.
>
> `[ Add to Chrome ]`  `[ See how it works ]`

The hero image is the gift button in situ on a real watch page (§7, image 1). This single screenshot does more than any copy on the page: it shows the product living inside something the viewer already knows.

**How it works — three steps, viewer-framed.** Install → click the gift → confirm with your PIN. Show the composer (§7, image 2).

**"Your keys never leave your browser."** The strongest trust claim we have, and it's true: the seed is encrypted with AES-256-GCM in `chrome.storage`, the PIN never leaves the extension, and no server can move a gifter's money. Say it plainly, then link the detail.

**What it costs.** Minimum tip, the network fee (USDC on Arc — same asset as the tip, which is unusual and worth explaining in one line), and the fact that the 4% is the creator's withdrawal fee, not a charge to the gifter.

**Closing CTA.** Install.

### 4.3 Shared sections

- **Built on** — Arc and Circle marks with one line each. Arc: USDC *is* the gas token, so a tip and its fee are the same asset. Circle: escrow wallets creators can claim. This strip is also the sponsor-legibility surface for judging.
- **Security & custody** — four short pillars: gifter keys are local and encrypted; creator funds are in Circle escrow, not our wallet; channel identity is resolved server-side from YouTube; nothing is custodial after withdrawal.
- **FAQ** — one component, entries tagged `creator` / `viewer` / `both`, filtered by the active spine. Six to eight visible.
- **Footer** — nav, legal, GitHub, the honest testnet disclaimer.

**Testnet honesty.** This runs on Arc *testnet*. That has to be visible on the landing page, not buried — a site that reads as a live money product and turns out to be testnet burns exactly the trust this section is trying to build. One clear line near the fold, and a fuller note in the FAQ.

---

## 5. Design system — inherited, not invented

> **Superseded 2026-09-15.** The owner replaced this section with a warmer
> expression closer to buymeacoffee.com: cream ground, Plus Jakarta Sans body,
> rounded corners and soft shadows, with monospace demoted to amounts and
> addresses. Only the forest green and the corner-tick motif carried over. The
> live tokens are in `packages/web/app/globals.css`; see the website slice in
> `handoff.md`. Everything else in this plan still holds.


You already have a design language shipped in the extension and you like it. The website adopts it wholesale; the extension does not change.

Tokens, lifted verbatim from `packages/extension/src/popup/styles.css`:

| Token | Value | Role |
|---|---|---|
| `--sage` | `#ecefe8` | Page ground. Never white. |
| `--card` | `#ffffff` | Raised surfaces — read as lifted *because* the ground is sage, so no shadow is needed. |
| `--tint` | `#f5f7f2` | Secondary fill, insets |
| `--rule` | `#e2e6dd` | Hairlines |
| `--forest` | `#2f6a1f` | Primary action, marks |
| `--mint` | `#caffb8` | Highlight, positive amounts |
| `--ink` | `#121a0f` | Primary text |
| `--muted` | `#55634e` | Secondary text |
| `--faint` | `#8b9784` | Tertiary, captions |
| `--on-forest` | `#f2f4f2` | Text on forest |
| `--danger` | `#9a3412` | Errors only |

**Type.** `JetBrains Mono` is the default face for the whole site — this is the distinctive move and it should not be watered down for the web. `Hanken Grotesk` is display only: hero lines, section headers, the wordmark. (Talise's own stack names `TWK Everett` first, which is licensed; Hanken Grotesk is its documented fallback and is on Google Fonts.)

**The corner tick.** Talise frames elements with four corner marks rather than a full border. The extension implements this as eight gradient layers in a single `.bracket` class — no extra elements. Port it as-is and use it on primary CTAs and the balance card. **This is the site's signature.** One motif, used sparingly, beats a dozen decorative flourishes.

**Scaling from popup to page.** The extension's system was built at 360px. Going full-bleed needs additions, not changes:
- A max content width around 1120px, with the sage ground running edge to edge.
- A display scale above anything the popup needed — hero around 56–72px, `Hanken Grotesk` 600, tight tracking (`-0.02em`).
- Generous vertical rhythm between sections (Talise's own site leans on whitespace heavily); the popup's 14–18px gaps become 96–128px section gaps.
- Monospace at body size needs more line-height than a grotesque — 1.65 or so, and slightly shorter measure (~62ch, not 75ch).

**Dark mode.** Recommend **not** shipping it initially. The palette is a light, warm, specific thing and a rushed inversion will look worse than its absence. Revisit post-launch.

**Note on the live talise.io:** it currently presents blue/white/sans — a different expression from the sage/forest/mono interpretation in your extension. I'm treating **your extension as the source of truth**, since that's the theme you said you love and it's already built. Flag it if you meant the other one; it would change the whole palette.

---

## 6. Technical plan

**Stack:** Next.js (App Router) + TypeScript + Tailwind v4, as `packages/web` in the existing npm workspace.

Reasoning, since the repo is deliberately framework-free everywhere else:
- The extension avoids a framework to keep Chrome Web Store review simple. That constraint does not apply to a website.
- `/claim`, `/v/[token]` and `/c/[handle]` are real routes with real server work. `/v/[token]` in particular **must** be server-rendered and crawlable — YouTube fetches and displays About-page links, and the verification flow depends on that URL resolving properly.
- A landing page lives or dies on SEO and social cards. SSR and metadata are the job.
- `.env` already carries `NEXT_PUBLIC_CIRCLE_APP_ID`, so Next was the prior intent.

**Tailwind v4 specifically** because its `@theme` block maps CSS custom properties to utilities directly — the tokens in §5 go in verbatim and stay the single source of truth. No shadcn/ui: its defaults would fight an established design language, and we'd spend more time overriding than writing.

**API boundary.** The website talks to the existing `@tipee/api` (Fastify), not to Next API routes. `/claim` needs three endpoints that do not exist yet:

```
POST /api/creators/claim      { channelUrl }  → { channelId, handle, balance, tipCount }
POST /api/creators/verify     { channelId }   → { token, instructions }
GET  /api/creators/verify/:t                  → checks the About page, marks verified
POST /api/creators/withdraw   { address }     → 96/4 split via Circle, authed
```

These are §6 of `plan.md` and are the real dependency. **The marketing spines can be built and shipped without them**; only `/claim`'s live behaviour is blocked. Build order in §8 reflects that.

**Shared code.** `@tipee/shared` already exports `normalizeHandle`, `parseChannelRef`, `formatUsdc` and the 96/4 `splitWithdrawal` — the website should import them rather than reimplement. That also means the fee shown on the site and the fee actually charged cannot drift.

**Hosting.** Vercel. Point `tipee.xyz` at it; the API needs its own host plus a Postgres, which is the standing blocker in `plan.md`.

---

## 7. What I need from you — asset manifest

You offered; here is the concrete list, in priority order. Items marked **blocking** gate a section.

### Screenshots — I can capture these myself once you confirm
1. **Gift button in situ** — *blocking, the single most important image on the site.* A real YouTube watch page with the Tipee button beside Like. Need: light and dark YouTube themes, 2× DPI, a real creator, a plausible view count. I can take these once you've loaded the extension unpacked.
2. **The composer** — popup open, real creator, avatar loaded, a sensible amount entered.
3. **Wallet popup** — three shots: balance home, activity list with a few rows, deposit QR.
4. **Verification step** — a YouTube About page with the `tipee.xyz/v/…` link visible in the links section. Needs a channel you control.

### Brand — I cannot make these, and they're blocking
5. **Tipee wordmark and logo.** *Blocking.* There is no logo anywhere in the repo — only `arc_logo.png`. Need: SVG wordmark (light and dark), a square mark for favicon and social, and ideally the gift glyph as a standalone SVG. If you don't have one, say so and I'll propose directions from the existing button icon.
6. **Extension icons.** *Blocking, and a real gap:* `manifest.json` declares no `icons` field at all, so Chrome is currently showing the default puzzle piece — in the toolbar, on the extensions page, and in any install screenshot we take. Need 16/32/48/128px PNGs.

### Illustration & proof
7. **Verification diagram** — I'll build this as an SVG; no asset needed unless you want it illustrated.
8. **Creator showcase faces** — BMC's row of real creators is its strongest proof. Ours has a licensing problem: we cannot show real YouTubers' avatars without permission. Options: (a) skip it, (b) use consenting friends' channels, (c) abstract it to "channels tipped this week" with no faces. **My recommendation: (c)** — it's honest, needs no permission, and still shows life.
9. **OG / social card** — 1200×630. I can compose this from the wordmark and palette once (5) lands.
10. **Arc, Circle, USDC marks.** `arc_logo.png` exists. Need Circle's and USDC's official SVGs, and a quick check that our usage fits their brand guidelines — sponsor marks used wrongly read worse than not using them.

### Copy input
11. **A real tip amount and creator name** for the demo screenshots, so nothing says "Lorem" or "$0.00".
12. **The testnet disclaimer wording** — I'll draft it; you should approve it, since it's the one line that governs whether the site overclaims.

---

## 8. Build order

Sequenced so something is deployed early and nothing waits on the standing Postgres blocker.

| Phase | What | Depends on |
|---|---|---|
| **0** | `packages/web` scaffold, tokens ported, deployed to Vercel on a placeholder. Proves the pipeline hour one. | — |
| **1** | Design system in code: type scale, corner-tick component, buttons, cards, section frame. | Tokens (have) |
| **2** | Creator spine `/` with the lookup input **mocked**. Full copy, real layout. | Logo (5) |
| **3** | Viewer spine `/viewers` + the toggle. | Screenshots (1, 2) |
| **4** | Shared sections: built-on, security, FAQ, footer, legal. | Sponsor marks (10) |
| **5** | `/claim` wired to real endpoints. | §6 API routes |
| **6** | `/v/[token]` and verification round-trip. | §6 API + a test channel (4) |
| **7** | `/c/[handle]` public pages, OG cards. | Privacy decision (§3.1) |
| **8** | Polish: motion, responsive audit, Lighthouse, metadata. | — |

Phases 0–4 are unblocked right now. Phase 5 onward needs the §6 API work, which needs no external credentials either — only Postgres for persistence, and `memoryStore()` covers development.

---

## 9. Open decisions — yours

1. **Public creator pages (§3.1)** — build them, or skip? They're the growth mechanism but they publish something the creator didn't opt into.
2. **Creator showcase (§7 item 8)** — my recommendation is the faceless version; confirm.
3. **Dark mode** — I recommend deferring. Confirm.
4. **Domain** — is `tipee.xyz` actually registered? Everything in `idea.md` assumes it.
5. **Talise expression (§5)** — extension's sage/mono, or the live site's blue/sans? I've assumed the former.
6. **Does the website need its own tipping path**, or does every path end at "install the extension"? Affects `/c/[handle]` substantially.

---

## 10. What this plan deliberately excludes

- **Creator login/accounts.** Verification is per-withdrawal via the About-page token. Adding sessions and passwords is a large surface for no hackathon value.
- **Email capture and newsletters.** Nothing to send yet.
- **Analytics beyond privacy-preserving page counts.** A wallet product that ships third-party trackers contradicts its own security section.
- **i18n.** Structure copy so it doesn't fight translation later; don't build it now.
- **A blog.** Talise has one; we have nothing to say yet and an empty blog reads worse than none.
