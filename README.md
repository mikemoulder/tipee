# tipee

**Tip any YouTube creator in USDC from the video page, in one click. No seed phrase to start, no XLM ever, and the creator doesn't need to have heard of Tipee.**

A Chrome extension adds a gift button beside Like. The tip goes into a Soroban escrow contract on Stellar, held under the creator's YouTube **channel ID** until they prove the channel is theirs and claim it. Gifters hold USDC in a Soroban **smart wallet**: no trustline, no XLM reserve, and Tipee's relayer pays every network fee.

> Stellar **testnet**. Built for *Find Your Way* (General Track). Started on Circle's Arc in September and ported to Stellar for this hackathon: the contracts, the smart-wallet onboarding, the relayer and the claim flow are new. See [What was built when](#what-was-built-when).

| | |
| --- | --- |
| Escrow contract | [`CB7OEDRT…KGUV`](https://stellar.expert/explorer/testnet/contract/CB7OEDRTDDPLG37HWY76OQQYOO56P3R3CAAWX5IUSJXIAC3IDZ7OKGUV) |
| A real tip from the extension | [`ced71633…`](https://stellar.expert/explorer/testnet/tx/ced71633597cba185edd52f58fd017331b137c788ea44ed0d02603fcf57fd5a1): 1.50 USDC from a smart wallet, fee paid by the relayer |
| A real claim | [`6f4d0362…`](https://stellar.expert/explorer/testnet/tx/6f4d036218e600fdc6cfd14f2e5a766e8ccd1296046ed8e58b3f7ae3c780fa09): 2.00 in escrow → 1.92 to the creator, 0.08 fee |
| USDC | Circle testnet `USDC:GBBD…LFLA5` via its Stellar Asset Contract `CBIELTK6…DAMA` |
| Extension | [Download 0.2.0](https://github.com/mikemoulder/tipee/releases/latest), built against the live API |
| API | [`tipee-api.duckdns.org/health`](https://tipee-api.duckdns.org/health) |

## The problem

A small creator can't take Super Thanks until they qualify for YouTube's Partner Program, and when they can, the platform keeps up to 30%. Crypto tipping should fix that, but it asks both sides to do too much first: the viewer has to fund a wallet with a second token for fees, and the creator has to have a wallet before anyone can pay them.

## What happens

1. **Install and set up (≈10 s).** The extension makes a 12-word phrase (SEP-5, so it restores in any Stellar wallet), encrypts it with your PIN, and computes your wallet's contract address offline. Tipee's relayer deploys the wallet and the faucet sends 10 testnet USDC. You never hold XLM.
2. **Tip.** On any video, click the gift, pick an amount, add a note, confirm. The extension simulates `escrow.tip(...)`, signs only your wallet's authorisation, and hands it to the relayer, which submits it and pays the fee. Confirmed in about 5 seconds.
3. **Claim.** The creator opens `/claim`, finds their channel, pastes a one-hour code into their channel description, and claims the balance to any Stellar address. The escrow contract pays them 96% and the treasury 4% in one transaction.

## How Stellar is used

| Piece | What it does | Remove it and… |
| --- | --- | --- |
| **Soroban escrow** (`contracts/escrow`) | `tip(from, channel_id, amount, note)` moves USDC in and emits the note in the same event. `claim(channel_id, to)` pays out, verifier only, fee floored exactly like `packages/shared/src/fees.ts`. Channel IDs are validated on chain. | Creators would need a wallet before they could be tipped, or Tipee would hold their money. |
| **Soroban smart wallet** (`contracts/wallet`) | A custom account (`__check_auth`) owned by the extension's ed25519 key. An optional *session key* may only call `escrow.tip` under a daily cap, enforced on chain. | Gifters would need XLM, a trustline and a reserve before their first tip. |
| **Stellar Asset Contract for USDC** | A contract address holds USDC with no trustline or reserve. | Same as above. |
| **Relayer as transaction source** | The gifter signs auth entries only; the relayer builds, pays for and submits. The signature covers the invocation, network and expiry, so the relayer can't alter it. | The gifter pays fees in XLM. |
| **Protocol 27 address-bound credentials** | Testnet simulation returns `sorobanCredentialsAddressV2` auth entries; `@stellar/stellar-sdk` 17.1 signs the address-bound payload. | Older SDKs sign the wrong payload and the wallet rejects it. |

Why Stellar and not another chain: USDC is native, and five-second finality makes a tip feel like a like. Contract accounts plus a fee-paying relayer let the wallet hold exactly one asset, and the network fee is small enough for Tipee to absorb.

## What is real, and what is trusted

- **Real, on testnet:** contracts, wallets, every tip and claim, the faucet (real Circle testnet USDC bought on the testnet DEX), YouTube channel resolution, ownership verification against the live channel page.
- **Trusted:** the verifier key. The escrow only pays out with its signature, and the API gives it only after the code is found in the channel description. The relayer pays fees but can't move a gifter's money; `/api/relay` refuses source-account credentials and anything that names the relayer ([`checkRelayable`](packages/api/src/stellar.ts), with tests).
- **Not built:** mainnet, Chrome Web Store listing, cash-out to local currency (a Stellar anchor would do this; it's in the pitch, not the code).

## Try it (about two minutes)

1. Download `tipee-extension-0.2.0-stellar-testnet.zip` from the [latest release](https://github.com/mikemoulder/tipee/releases/latest) and unzip it.
2. Open `chrome://extensions`, switch on **Developer mode**, click **Load unpacked**, and pick the unzipped folder.
3. Open the Tipee popup, set a PIN, and confirm three words of the phrase. Tipee deploys your wallet and sends 10 test USDC, which takes about 10 seconds.
4. Open any YouTube video, click the gift beside Like, and tip. It confirms in about 5 seconds and the composer links to the transaction.

To build it yourself instead:

```sh
git clone https://github.com/mikemoulder/tipee.git && cd tipee
npm install
VITE_TIPEE_API=https://tipee-api.duckdns.org npm run build -w @tipee/extension   # → packages/extension/dist
```

Run the API yourself (needs a funded testnet relayer; see [`packages/api/README.md`](packages/api/README.md)):

```sh
RELAYER_SECRET=S… VERIFIER_SECRET=S… npm start -w @tipee/api
API=http://localhost:3000 node scripts/verify-chain.mjs @fireship   # resolve → wallet → faucet → tip → verify, ~19 s
```

## Repository

| Path | |
| --- | --- |
| `contracts/escrow`, `contracts/wallet` | Soroban contracts (Rust, `soroban-sdk` 28). `cargo test` (17 tests), `stellar contract build`. |
| `packages/extension` | Manifest V3 extension: content script, composer, wallet popup, SEP-5 keystore, Stellar chain layer. |
| `packages/api` | Fastify: resolution, relay, wallets, faucet, verification, claims. |
| `packages/shared` | Money math, limits, YouTube parsing, testnet contract IDs. No runtime dependencies. |
| `packages/web` | Next.js site with the live balance lookup and `/claim`. |
| `scripts/verify-chain.mjs` | End-to-end against a running API on testnet. |
| `scripts/e2e-extension.mjs` | Drives the built extension in real Chrome: onboarding, a tip, the activity list. |
| `scripts/spike-wallet.mjs` | The first proof that a smart wallet could tip through the escrow with someone else paying. |

`npm test` runs 333 tests across the TypeScript packages; `cargo test` in `contracts/` runs 17.

## What was built when

Before this hackathon (September, on Arc): the extension shell, YouTube detection and gift button, composer, PIN-encrypted keystore, popup wallet, the API's channel resolution and tip records, and the marketing site.

For this hackathon (October, on Stellar): both Soroban contracts, the smart-wallet model and SEP-5 keys, the relayer, faucet and relay security rules, Stellar tip verification, activity from contract events, channel verification and claims, the `/claim` page, and the live balance lookup. The full history is in `git log`.
