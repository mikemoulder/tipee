# @tipee/api

Creator resolution, escrow provisioning, and tip records. The only side that
holds credentials, and the only side that talks to Circle.

## Why these endpoints exist

Both of them exist because the client cannot be trusted with the answer.

- **`GET /api/creators/resolve?handle=@creator`** turns a handle into a channel
  ID here, by fetching the channel page from YouTube. A handle is re-assignable
  — YouTube releases abandoned ones — and a client-supplied channel ID could
  simply name somebody else's escrow. The escrow wallet belongs to the channel
  ID and never moves when a creator renames.

- **`POST /api/tips`** re-reads the transaction from Arc and records the amount
  that actually reached that creator's escrow. The body is a claim; believing
  its `amount` would let anyone inflate a creator's balance to any figure they
  liked. `tx_hash` is unique, so reporting one tip twice credits nobody twice.

## Running it

```sh
cp .env.example .env      # at the repo root
npm run migrate -w @tipee/api
npm run dev -w @tipee/api
```

Migrations also run at boot, so a deployment cannot drift from its schema.

Without Circle credentials the service still starts and resolution answers
`503 escrow_unavailable` — a laptop with no credentials should be able to run
everything else, and the failure should be legible rather than a crash.

Postgres 13 or newer. Nothing here needs an extension or a superuser, so it
runs on a managed provider's default role — Neon, Supabase, Railway, or a local
install.

## Circle setup, once

1. Copy your API key from [Circle console](https://console.circle.com/) into `.env` as `CIRCLE_API_KEY`.
2. Generate an entity secret and the ciphertext the console asks to register:

   ```sh
   npm run circle:entity-secret -w @tipee/api
   ```

   It prints `CIRCLE_ENTITY_SECRET=…` for `.env` and a base64 ciphertext for the console's **Entity Secret Ciphertext** box. The console registers a ciphertext rather than the secret, and a ciphertext can only be built from the public key Circle serves to an authenticated caller — hence the API key first. Set `CIRCLE_ENTITY_SECRET` beforehand to re-encrypt a secret you already hold.

3. **Download the recovery file** on the screen after Register. It is offered once; without it, a lost entity secret means permanently lost wallets and the funds in them.

4. Create the wallet set every escrow derives from, and paste the ID it prints:

   ```sh
   npm run circle:wallet-set -w @tipee/api
   ```

One wallet set holds every creator's escrow, told apart by a `refId` of the
YouTube channel ID. That is Circle's own guidance — a set is an organisational
boundary, not a security one, and an account is capped at a thousand of them, so
a set per creator would exhaust the account and buy nothing.

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. |
| `PORT` | no | Defaults to 3000. |
| `CIRCLE_API_KEY` | for escrow | All three Circle values or none. |
| `CIRCLE_ENTITY_SECRET` | for escrow | 32 bytes of hex. Encrypted per request, never sent as-is. |
| `CIRCLE_WALLET_SET_ID` | for escrow | Created once, reused for every creator. |
| `CIRCLE_BLOCKCHAIN` | no | Defaults to `ARC-TESTNET`, Circle's code for Arc. Arc has no mainnet there yet. |
| `TREASURY_ADDRESS` | for withdrawals | Destination for the 4% fee. Unused until §6. |

## Status codes, and what they mean for a gifter

| Code | When | Retry? |
| --- | --- | --- |
| 400 | The request is malformed, or the tip is under 0.50 USDC | No |
| 404 | No such channel, or a channel with no escrow here | No |
| 422 | The transaction is real but paid this creator nothing | No |
| 502 | YouTube could not be reached | Yes |
| 503 | Circle unconfigured or down; or Arc would not answer | Yes |

The 503 on a tip is deliberate: a transaction that is not yet mined and one that
never existed look identical from here, so that case is never treated as a
verdict on the tip.

## Connecting the extension

Settings → **Tipee service** → the base URL (`http://localhost:3000` locally).
Until that is set, the extension refuses to send tips rather than guessing at a
recipient.

## Not done yet

Verification (`/api/creators/verify/*`) and withdrawals (`/api/creators/withdraw`)
are plan.md §6. Their tables exist in the first migration; the routes do not.
