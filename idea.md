# Tipee — Product Specification

## 1. Overview

**Tipee** is a browser extension that lets fans send testnet USDC tips directly to YouTube creators from the video page. No creator onboarding required — tips accumulate in a dev-controlled escrow wallet until the creator verifies channel ownership and withdraws.

**Core mechanic:** A gift-icon button injected into YouTube's action bar (like, share, subscribe row). One click opens the tip composer, one PIN entry sends the tip.

**Custody:** Non-custodial on the gifter side — keys are generated, encrypted, stored, and used entirely inside the gifter's browser. Tipee never holds them. Creator-side escrow is custodial only until the creator verifies and withdraws.

**Domain:** `tipee.xyz`

---

## 2. Problem & Solution

| Problem | Tipee Fix |
|--------|-----------|
| YouTube's native monetization (Super Thanks, memberships) takes 30-50% cuts | 0% fee on tips; only 4% platform fee when creator withdraws |
| Small creators can't monetize until they hit Partner Program thresholds | Any channel can receive tips immediately, even with 0 subs |
| Crypto-native fans have no seamless way to tip in USDC on YouTube | Extension auto-resolves creator handle → wallet; gifter never leaves the video |
| Creators don't want to manage seed phrases for small tips | Dev-controlled escrow; creator claims via channel verification |

---

## 3. Product Architecture

### 3.1 Gifter Side (Extension)

#### 3.1.1 Wallet & PIN — Non-Custodial

> **Tipee never has custody of a gifter's funds.** The private key is generated in the browser, encrypted in the browser, stored in the browser, and used to sign in the browser. No key material, seed phrase, or PIN is ever transmitted to Tipee's servers or to any third party. Tipee cannot move, freeze, or recover a gifter's funds — including on the gifter's own request. This is architectural, not a policy.

- **Key material**: Extension generates a keypair on first run. The private key is encrypted client-side with a key derived from the gifter's PIN (`scrypt`, or PBKDF2-SHA256 at ≥600k iterations, per-install random salt) and stored **only** in `chrome.storage.local` as AES-256-GCM ciphertext.
- **What the backend stores**: the public address, and nothing else. There is no server-side keystore, no encrypted-seed column, no escrow of gifter funds.
- **PIN**: 6 digits, set during onboarding. Required to sign every tip.
- **Unlock window**: on correct PIN, the *derived* AES key (never the PIN, never the private key) is cached in `chrome.storage.session` with an expiry timestamp — memory-only, never written to disk, cleared on browser close, unreadable by page scripts. This is required rather than plain in-memory state because MV3 service workers are terminated after ~30s idle, so a variable would not survive the unlock window.
- **Backup**: Gifter is shown the 12-word seed phrase once at setup and must confirm it before the wallet is usable. PIN is *not* recoverable — losing it means restoring from seed. There is no other path, and this is the tradeoff of non-custody.
- **Brute-force protection**: exponential backoff after 3 failed PIN attempts; wipe-after-10 is opt-in during setup.
- **Network**: Arc testnet only.
- **Asset**: USDC (Arc testnet contract).

> **Scope note:** non-custody applies to the *gifter*. The *creator* side is deliberately custodial pre-verification — tips land in a Circle dev-controlled escrow wallet because the creator hasn't onboarded yet and has no key. Custody there ends the moment they verify and withdraw. See [§3.3](#33-backend).

#### 3.1.2 The Gift Button
Injected into the action bar alongside Like / Share / Save.

- **Visual**: white gift icon (🎁 glyph replaced with a clean inline SVG), matching YouTube's pill-button geometry — same height, radius, and hover state as neighbouring buttons so it reads as native.
- **Idle attention loop**: every ~45s, while the action bar is in the viewport, the button plays one short cue — a gentle scale-wiggle plus a light sweep across the icon (~600ms). Never more than 3 cues per video.
- **Hint tooltip**: on the first cue of a session, a small tooltip appears for 4s: *"Enjoying the video? Tip the creator — it goes straight to them."* Dismissible; suppressed permanently once the user has sent their first tip.
- **Accessibility**: all motion is skipped under `prefers-reduced-motion`. Button is a real `<button>` with `aria-label="Tip this creator"` and keyboard focus.
- **SPA handling**: YouTube is a single-page app — re-inject on `yt-navigate-finish` and guard with a `MutationObserver`, keyed to the current `videoId` so the button never duplicates.

#### 3.1.3 The Tip Composer (MetaMask-style popup window)
Clicking the gift button opens a **dedicated extension popup window** — the same mechanism MetaMask, Rabby, Phantom, and Coinbase Wallet use for transaction confirmation. The content script messages the service worker, which calls `chrome.windows.create({ url: 'composer.html', type: 'popup', width: 380, height: 620 })`, positioned near the click. It is a real `chrome-extension://` page, not injected HTML. (Rationale in §5.1.)

Composer contents, top to bottom:

1. **Creator card** — channel avatar (from `ytInitialData`, with an initials fallback if the image fails), display name, `@handle`, and a verification chip: `✓ Verified` or `Unverified — funds held in escrow`.
2. **Amount input** — numeric field, USDC-denominated. **Minimum 0.50 USDC.** Live-validated against wallet balance **plus estimated gas** (see §3.1.5); submit disabled with an inline reason when invalid.
3. **Quick presets** — `$1` `$5` `$10` `$25` chips below the input. Tapping one fills the field.
4. **Send button** — shows the resolved total, the estimated gas, and the destination in short form (`0x1a2b…9f0e`).
5. **PIN prompt** — pressing Send swaps the footer for a 6-digit PIN entry. A normal masked input is safe here: the popup is an extension-origin document, so no YouTube script can reach it, observe its keystrokes, or read its DOM. Correct PIN → derive key → decrypt → sign → broadcast, all inside extension contexts.
6. **Result state** — pending spinner → confirmed check with a link to the Arc testnet explorer, or a failure state with the revert reason and a retry.

**Window lifecycle.** The service worker tracks the popup's `windowId`. A second gift-button click focuses the existing window (`chrome.windows.update({ focused: true })`) rather than opening a duplicate. Closing the window without confirming is treated as an explicit rejection — no pending state left behind. The popup is positioned relative to the current browser window so it lands near the video, not on a stray monitor.

**No extra permissions.** `chrome.windows.create` requires no permission declaration, so the minimal-permission story in §10 is unaffected.

The browser-action popup (toolbar icon) remains, with a separate job: wallet management only — balance, deposit/withdraw, tip history, seed backup, PIN change.

#### 3.1.5 Gas
**Arc uses USDC as its native gas token.** There is no second asset to acquire — a gifter funds one balance and it covers both the tip and the fee. This removes the classic dead-end where a user holds the token they want to send but can't afford to send it.

Two implementation consequences:

- **Balance checks must include headroom.** Validate `amount + estimatedGas ≤ balance`, never `amount ≤ balance`. A gifter with exactly 5.00 USDC cannot send a 5.00 tip.
- **A "Max" preset must subtract gas**, not fill the full balance, or every max-tip reverts.

Gas is estimated at composer-open and re-checked immediately before signing, with the estimate shown next to the Send total so the debit is never a surprise.

#### 3.1.4 Flow
1. User watches a YouTube video.
2. Extension scrapes `channelId`, `@handle`, `displayName`, and avatar URL from `ytInitialData`.
3. Extension queries backend: *"What's the wallet address for this channel?"*
4. If none exists, backend auto-provisions a Circle dev-controlled wallet.
5. User clicks the gift button → composer opens → enters amount → enters PIN → signs USDC transfer → tx broadcast → tip recorded.

### 3.2 Creator Side (Web Dashboard)
- **Discovery**: Creator visits `tipee.xyz/claim`, enters their channel URL.
- **Balance Check**: Backend shows unclaimed tips across all their videos.
- **Verification**: About-page token method (see §6).
- **Withdrawal**: Creator enters personal wallet address. Backend signs 2 transactions via Circle API:
  1. 96% to creator's personal wallet.
  2. 4% platform fee to Tipee treasury.

### 3.3 Backend
- **Wallet Provider**: Circle Programmable Wallets API (Developer Controlled).
- **One wallet per `channelId`**: Immutable. Handle changes don't affect mapping.
- **Custody**: Platform holds keys pre-verification. Post-verification, creator initiates withdrawals; backend signs via Circle API.

---

## 4. User Flows

### 4.1 First Tip to Unseen Creator
```
Gifter opens youtube.com/watch?v=xxx
    ↓
Extension extracts @handle + channelId + avatar from ytInitialData
    ↓
GET /api/creators/resolve?handle=@techlead
    ↓
Backend: No record found
    ↓
Circle API: createWallet() → walletId + address
    ↓
INSERT creators (channel_id, handle, circle_wallet_id, address, is_verified=false)
    ↓
Return address to extension
    ↓
Extension renders gift button in action bar (with periodic attention cue)
    ↓
Gifter clicks → service worker opens Tipee popup window
    ↓
Composer shows creator name + avatar + balance + est. gas (USDC)
    ↓
Gifter enters amount (min 0.50 USDC) or taps a preset → Send → enters PIN
    ↓
Popup derives key from PIN, decrypts, signs USDC transfer (extension context only)
    ↓
Tx confirmed on Arc testnet
    ↓
POST /api/tips {gifter_address, creator_channel_id, amount, tx_hash}
    ↓
Creator now has the tip unclaimed in their escrow wallet
```

### 4.2 Creator Verification & Withdrawal
```
Creator visits tipee.xyz/claim
    ↓
Enters youtube.com/@handle
    ↓
Backend: "You have $127.00 unclaimed"
    ↓
Backend generates unique token: tipee-verify-abc123
    ↓
Instructions: "Add https://tipee.xyz/v/abc123 to your YouTube About page links"
    ↓
Creator adds link in YouTube Studio → Customization → Basic info → Links
    ↓
Creator clicks "Verify" on Tipee
    ↓
Backend scrapes youtube.com/@handle/about
    ↓
Searches ytInitialData for link containing "tipee.xyz/v/abc123"
    ↓
Found? → is_verified = true, verified_at = now
    ↓
Creator enters destination wallet, clicks "Withdraw All"
    ↓
Backend calculates: $127.00 gross - $5.08 fee (4%) = $121.92 net
    ↓
Circle API: transfer 96% to creator, 4% to treasury
    ↓
Record withdrawal, show receipt
```

---

## 5. Technical Stack

| Layer | Tech |
|-------|------|
| **Extension** | Manifest V3, vanilla JS/TS, content script (button injection only), extension popup window (composer), background service worker (signing) |
| **Frontend (Claim)** | Next.js or simple React SPA at `tipee.xyz` |
| **Backend** | Node.js (Express/Fastify) or Python (FastAPI) |
| **Wallet Infra** | Circle Programmable Wallets API (Developer Controlled) |
| **Crypto (client)** | WebCrypto — PBKDF2/scrypt for PIN derivation, AES-256-GCM for keystore |
| **Database** | PostgreSQL |
| **Blockchain** | Arc testnet — USDC is the native gas token (one asset for both tip and fee) |
| **Scraper** | Node `fetch` + regex extraction of `ytInitialData` (no headless browser) |
| **Hosting** | Vercel (frontend) + Railway/Render (backend) |

### 5.1 Why a Popup Window (the MetaMask Pattern)
There are three ways to surface UI when a user clicks an injected button. Only one is both reliable and a real security boundary.

| Approach | Mechanism | Verdict |
|---|---|---|
| **Browser-action popup** | `chrome.action.openPopup()` | ❌ Must be relayed through the service worker and can lose the user-gesture context, so the click intermittently does nothing. Firefox's equivalent is stricter still. Not what wallets use. |
| **In-page modal** | Content script injects into a shadow root | ⚠️ Opens reliably, but shares a document with YouTube. Style-isolated, not security-isolated: events bubble to `document`, and any PIN field needs keypad workarounds and `stopPropagation()` patches. |
| **Popup window** ✅ | `chrome.windows.create({ type: 'popup' })` from the service worker | ✅ What MetaMask, Rabby, Phantom, and Coinbase Wallet all do. Opens deterministically, no gesture dependency, no permission needed. |

**Why the popup window wins on security.** It loads a `chrome-extension://` document in its own window, with its own origin and process. YouTube's scripts have no handle to it, cannot read its DOM, cannot observe its keystrokes, and cannot see the PIN. That is a genuine boundary — unlike the shadow root, which only *looks* like one. Three defensive hacks the modal needed simply disappear: no click-keypad, no `stopPropagation()` at the boundary, no relaying the PIN through a content script. A plain masked input in an extension page is safe.

**Why it wins on trust.** Chrome renders a popup window with its origin visible, and users have been trained by MetaMask to expect a small wallet window on a signing action. A tip flow that borrows that shape inherits the recognition. An in-page modal is exactly what a phishing overlay looks like, and it teaches users a habit that hurts them elsewhere.

**What it costs.** A popup is a separate window: ~100–300ms to appear, it can steal focus, and it occludes the video instead of sitting over it. On multi-monitor setups it can land awkwardly, which is why we position it relative to the current browser window. Mitigations for the lifecycle edges — duplicate clicks, abandonment — are in §3.1.3.

**Where signing happens.** Key decryption and signing run inside the popup document and the service worker, both extension contexts. The content script's entire job is: scrape `channelId` / handle / avatar, draw the gift button, and message the service worker on click. It never touches key material, the PIN, or a signature.

---

## 6. Channel Ownership Verification (Primary Method)

**Method:** About Page Link Token

### Why This Method
- No Google OAuth app verification required.
- No YouTube Data API quota or keys.
- Fully automated; no manual review.
- Only channel owners (or Studio editors) can modify About page links.

### Implementation
1. **Token Generation** (Backend)
   - Format: `tipee-verify-{uuid}` (e.g., `tipee-verify-a7x9k2m3p`)
   - Store in `verifications` table with `creator_id`, `token`, `expires_at` (24h), `used_at`.

2. **Creator Action**
   - Go to YouTube Studio → Customization → Basic info → Links.
   - Add link: `https://tipee.xyz/v/tipee-verify-a7x9k2m3p`.
   - Click Publish.
   - Return to Tipee and click Verify.

3. **Scraping & Validation** (Backend)
   - `GET https://www.youtube.com/@{handle}/about` with browser-like headers.
   - Extract `var ytInitialData = {...}` from HTML via regex.
   - Navigate JSON path to `channelAboutFullMetadataRenderer.primaryLinks`.
   - Check if any link URL contains the exact token string.
   - Verify the `channelId` from the page matches the stored `channelId` (prevents handle-swap attacks).

4. **Success**
   - `creators.is_verified = true`.
   - Enable withdrawal UI.
   - Invalidate token.

### Fallback: Description Token
If About page scraping fails (layout change), fallback to:
- Creator pastes token in **latest video description**.
- Backend scrapes `youtube.com/@{handle}/videos`, gets latest video ID, fetches watch page, checks description text.

---

## 7. Database Schema

```sql
-- Creators (auto-provisioned on first tip)
creators
  id                  uuid pk
  youtube_channel_id  string unique indexed  -- UCxxxx (immutable)
  youtube_handle      string indexed         -- @handle (can change)
  display_name        string
  avatar_url          string nullable        -- cached for dashboard/composer
  circle_wallet_id    string                 -- Circle's wallet UUID
  wallet_address      string                 -- Arc testnet address
  is_verified         boolean default false
  verified_at         timestamptz nullable
  created_at          timestamptz default now()

-- Verification tokens (single-use, time-bound)
verifications
  id          uuid pk
  creator_id  uuid fk references creators.id
  token       string unique
  method      enum('about_link', 'description')
  expires_at  timestamptz
  used_at     timestamptz nullable
  created_at  timestamptz default now()

-- Gifters (public data only — keystore never leaves the browser)
gifters
  id                    uuid pk
  wallet_address        string unique indexed
  created_at            timestamptz default now()

-- Tips
tips
  id                 uuid pk
  gifter_id          uuid fk references gifters.id nullable
  creator_id         uuid fk references creators.id
  amount             decimal(20, 6)           -- USDC, min 0.500000
  tx_hash            string
  status             enum('pending', 'confirmed', 'failed')
  created_at         timestamptz default now()

-- Withdrawals
withdrawals
  id                    uuid pk
  creator_id            uuid fk references creators.id
  amount_gross          decimal(20, 6)
  platform_fee          decimal(20, 6)         -- 4%
  amount_net            decimal(20, 6)         -- 96%
  destination_address   string                 -- Creator's personal wallet
  platform_fee_address  string                 -- Tipee treasury
  circle_tx_hash        string nullable
  status                enum('pending', 'completed', 'failed')
  created_at            timestamptz default now()
```

**Client-side keystore** (not in Postgres — `chrome.storage.local` only):
```
{ address, ciphertext, iv, salt, kdf: "scrypt", version }
```

---

## 8. API Specification

### Creator Resolution
```
GET /api/creators/resolve?handle=@techlead
Response:
{
  "channel_id": "UCx...",
  "handle": "@techlead",
  "display_name": "TechLead",
  "avatar_url": "https://yt3.ggpht.com/...",
  "wallet_address": "0x...",
  "is_verified": false,
  "unclaimed_balance": "127.00"
}
```

### Verification Init
```
POST /api/creators/verify/init
Body: { "youtube_url": "https://youtube.com/@techlead" }
Response:
{
  "token": "tipee-verify-a7x9k2m3p",
  "expires_in": "24h",
  "instruction": "Add https://tipee.xyz/v/tipee-verify-a7x9k2m3p to your YouTube About page links"
}
```

### Verification Confirm
```
POST /api/creators/verify/confirm
Body: { "token": "tipee-verify-a7x9k2m3p" }
Response:
{
  "verified": true,
  "wallet_address": "0x..."
}
```

### Withdraw
```
POST /api/creators/withdraw
Headers: Authorization: Bearer <session>
Body: { "destination_address": "0x...", "amount": "127.00" }
Response:
{
  "withdrawal_id": "uuid",
  "amount_gross": "127.00",
  "platform_fee": "5.08",
  "amount_net": "121.92",
  "status": "pending"
}
```

### Record Tip
```
POST /api/tips
Body:
{
  "gifter_address": "0x...",
  "creator_channel_id": "UCx...",
  "amount": "5.00",
  "tx_hash": "0x..."
}
```
Rejected if `amount` < `0.50`.

---

## 9. Revenue Model

**Fee structure:**
- **Gifter → Creator**: 0% fee. What the gifter sends is what the creator's escrow receives.
- **Creator Withdrawal**: 4% platform fee.

**Example:**
- Creator has $500 in tips.
- Withdraws all $500.
- Platform fee: $20.00.
- Creator receives: $480.00.
- Tipee treasury receives: $20.00.

**Why fee-on-withdrawal:**
- Gifters see clean numbers ($5 tip = $5 received).
- Creators don't feel taxed on every micro-transaction.
- Aligns platform revenue with creator success (we only earn when they cash out).

**Minimum tip:** 0.50 USDC — keeps per-tip gas overhead from dominating the transfer and keeps the tips table meaningful.

---

## 10. Chrome Web Store Strategy

### Positioning for Approval
- **Single Purpose framing**: "Send testnet USDC tips to YouTube creators." The wallet is a component of the tipping flow, not a standalone product.
- **Testnet-only**: Emphasize this is an Arc testnet utility/experiment, not a live financial service.
- **Permissions**: Only `https://www.youtube.com/*` in `host_permissions`. Use `activeTab` + `scripting`. No `<all_urls>`. No remote code.
- **No impersonation**: Name is "Tipee," not "YouTube Tip" or "SuperTip." No YouTube logo in store assets. The gift icon is original artwork, not YouTube's.
- **Non-custodial, stated plainly**: the listing and privacy disclosure say the extension transmits no key material and holds no user funds. This closes the "handles user financial data" line of questioning before it opens, and the data-usage form can honestly answer *no* to collecting authentication information.

### Risk Mitigation
| Risk | Mitigation |
|------|-----------|
| Single Purpose rejection | Frame as "creator tipping tool." Wallet creation is described as "auto-generated escrow for the creator you tip." |
| Financial services flag | "Testnet USDC tipping" — not trading, investing, or lending. |
| YouTube TOS concern | Non-malicious DOM injection precedent exists (SponsorBlock, Return YouTube Dislike, VidIQ). We don't block ads or compete with YouTube's core monetization (we're testnet-only). |
| Scraper fragility | Regex on `ytInitialData` (stable JSON blob). Fallback to description method. |
| Animated injected button flagged as intrusive | Cue is short, capped at 3 per video, respects `prefers-reduced-motion`, and is switch-off-able in the popup. No overlays on the video itself. |

### Backup Distribution
If rejected:
1. **Firefox Add-ons / Edge Add-ons** (less restrictive).
2. **Self-hosted `.crx`** + Developer Mode sideloading.
3. **Split architecture**: Extension A = pure wallet (easy approval). Extension B = YouTube injector (narrower purpose).

---

## 11. Security & Edge Cases

| Risk | Mitigation |
|------|-----------|
| **Handle squatting / impersonation** | Map by immutable `channelId`, not handle. If a handle changes, the wallet follows `channelId`. Composer shows "Unverified — funds held in escrow" chip. |
| **Token leak before posting** | Token bound to specific `channelId`. Expires in 24h. Only valid if found on that exact channel's page. |
| **PIN guessing (online)** | Exponential backoff after 3 failures; optional wipe after 10. PIN never leaves the device and is never sent to the backend. |
| **PIN guessing (offline)** | A 6-digit PIN is only 10⁶ combinations, so the ciphertext must never be exfiltratable. It lives in `chrome.storage.local` — unreachable from page scripts, never uploaded — and the KDF is deliberately slow (scrypt, or PBKDF2 at ≥600k iterations) to raise the cost of any offline attempt. |
| **PIN loss** | Unrecoverable by design — Tipee holds no key material and cannot reset it. Restore from the 12-word seed shown at setup. Setup blocks until the gifter confirms they've saved it. |
| **Malicious page script reading the PIN** | The composer is a `chrome-extension://` document in its own popup window — separate origin, separate process, no shared DOM with YouTube. Page scripts cannot read it or observe its input. The content script never receives the PIN, the key, or a signature; its only job is scraping and drawing the button. |
| **Phishing / fake tip prompt** | Real flow always opens a Chrome popup window with a visible extension origin. Anything rendered *inside* the YouTube page asking for a Tipee PIN is fraudulent by definition — documented in onboarding so the rule is learnable. |
| **Extension compromise / rogue update** | Ship unminified, reproducible builds. No remote code, no `eval`, no dynamic `import()` — enforced by MV3 CSP. A malicious update is the one path to gifter funds, so build provenance matters more than any runtime control. |
| **YouTube page structure changes** | Monitor scraper health. Fallback to description method. Alert team if scraper fails >5% of requests. |
| **Circle API failure** | Queue withdrawals. Retry 3x with exponential backoff. Notify creator via email if stuck >1 hour. |
| **Creator never verifies** | Funds sit indefinitely. Consider 12-month dormancy policy: after 1 year unverified, allow gifter refund (complex; v2 consideration). |
| **Extension code review** | Ship unminified code with source maps. No obfuscation. Reviewers must read the scraper and wallet logic. |

---

## 12. Extension UI Mock

**YouTube Action Bar Injection:**
```
[Like] [Dislike] [Share] [Clip] [Save] [🎁] [Super Thanks]
                                        ↑
                          Tipee gift button (injected)
```

**Tip Composer (extension popup window, MetaMask-style):**
```
  ╔══════════════════════════════════════╗
  ║ 🔒 chrome-extension://…    Tipee   ✕ ║   ← real window, extension origin
  ╠══════════════════════════════════════╣
  ║  ( avatar )  TechLead                ║
  ║              @techlead               ║
  ║              ⚠ Unverified — escrow   ║
  ╟──────────────────────────────────────╢
  ║  Amount                              ║
  ║  ┌────────────────────────┐          ║
  ║  │ 5.00            USDC   │          ║
  ║  └────────────────────────┘          ║
  ║  min 0.50 USDC                       ║
  ║                                      ║
  ║  [ $1 ]  [ $5 ]  [ $10 ]  [ $25 ]    ║
  ╟──────────────────────────────────────╢
  ║  Balance:  45.00 USDC                ║
  ║  Est. gas:  0.01 USDC                ║
  ║  To:  0x1a2b…9f0e                    ║
  ║                                      ║
  ║       [   Send 5.00 USDC   ]         ║
  ╚══════════════════════════════════════╝

  after Send ↓

  ╔══════════════════════════════════════╗
  ║ 🔒 chrome-extension://…    Tipee   ✕ ║
  ╠══════════════════════════════════════╣
  ║  Enter your PIN to sign              ║
  ║                                      ║
  ║  ┌────────────────────────┐          ║
  ║  │ • • • • • •            │          ║
  ║  └────────────────────────┘          ║
  ║                                      ║
  ║  Forgot PIN? Restore from seed       ║
  ╚══════════════════════════════════════╝
```

**Extension Popup (Gifter — wallet management only):**
- Balance: 45.00 USDC (Arc testnet)
- Deposit / Withdraw buttons
- Recent tips sent
- Settings: change PIN, reveal seed phrase, toggle button animation

**Claim Dashboard (Creator):**
- Unclaimed balance: $127.00
- Status: Unverified → [Start Verification]
- Withdrawal history (post-verification)

---

## 13. Roadmap

| Phase | Milestone |
|-------|-----------|
| **MVP** | Extension injects gift button, resolves handle, creates Circle wallet, sends testnet USDC via PIN-signed tx. Creator claims via About-page verification. 4% withdrawal fee. |
| **v1.1** | Gifter transaction history. Creator analytics (which videos earned most). |
| **v1.2** | OAuth fallback for verification (for creators who prefer Google sign-in). |
| **v2.0** | Mainnet expansion (if Arc launches mainnet). Creator opt-in for recurring tips / memberships. |
| **v2.5** | Cross-platform: Twitch, TikTok, X (Twitter) using same wallet-per-handle architecture. |

---

## 14. Open Questions

1. **First-fund onboarding**: Arc pays gas in USDC, so there's only ever one asset to hold — but a brand-new gifter still starts at zero. Do we point them at the Arc testnet faucet, run a small drip ourselves, or sponsor the first tip? *(The old two-asset dead-end — holding USDC but no gas — no longer exists. See §3.1.5.)*
2. **Circle wallet limits**: Are there API rate limits on wallet creation? Do we need to batch-create wallets or implement a warm pool?
3. **Notification**: How does a creator discover they have tips? Email outreach? Extension detection if they install it?
4. **Handle change race condition**: If Creator A has `@handle`, tips accumulate, then Creator B claims `@handle` — our `channelId` mapping prevents misrouting, but do we need to auto-update the `youtube_handle` field in DB when we detect a change?
5. **Withdrawal session issuance**: §8 assumes `Authorization: Bearer <session>`, but nothing defines how a session is minted after verification, how long it lives, or what stops someone re-running verification later to hijack a claimed channel.
6. **Escrow-per-channel cost**: One Circle wallet per tipped channel means provisioning wallets for channels that may never claim. Is a single pooled treasury with off-chain accounting the better MVP shape?
