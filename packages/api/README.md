# @tipee/api

Creator resolution, the Stellar relayer, and creator claims. It is the only part
of Tipee that holds keys, and it holds two:

- **The relayer** (`RELAYER_SECRET`) is the source of every gifter transaction,
  so it pays every fee and deploys every gifter's wallet. It never signs *for* a
  gifter: a wallet authorises its own calls, and the relayer only submits them.
- **The verifier** (`VERIFIER_SECRET`) is the only key the escrow contract
  accepts for `claim`. The API uses it after a creator has proved they own the
  channel, and for nothing else.

## Routes

| Route | What it does | Why it is server-side |
| --- | --- | --- |
| `GET /api/creators/resolve?handle=@x` | Handle → channel ID (read from YouTube), plus the escrow balance read from chain | A handle can be reassigned, and a client-supplied channel ID could point a tip at someone else |
| `POST /api/tips` | Records a tip after re-reading the transaction's escrow `tip` event | The body is a claim; the chain is the fact |
| `POST /api/wallets` | Deploys the wallet contract for an owner key (idempotent) | The relayer pays for the deployment |
| `POST /api/faucet` | Sends testnet USDC to a wallet holding under 1 USDC | The relayer holds the USDC |
| `POST /api/relay` | Submits a wallet-signed invocation, relayer paying | The gifter holds no XLM |
| `POST /api/creators/verify/init` | Issues a one-hour code to put in the channel description | |
| `POST /api/creators/verify/confirm` | Finds the code on `youtube.com/channel/<id>/about` | |
| `POST /api/creators/claim` | Spends the code once; the verifier calls `escrow.claim` | Only the verifier key can release escrow |

### What the relay will submit

`/api/relay` is the one route that spends the relayer's money on a stranger's
request, so it is narrow (`src/stellar.ts`, `checkRelayable`, tested in
`src/stellar.test.ts`):

- `escrow.tip(wallet, …)`, `usdc.transfer(wallet, …)`, or a wallet's own
  `set_session` / `revoke_session`, and nothing else;
- the acting wallet must be a contract running Tipee's wallet code (checked by
  its wasm hash on chain);
- every auth entry must be an address credential **for that wallet**. A
  source-account credential would authorise *as the relayer*, so it is refused,
  as is anything naming the relayer.

## Running it

```sh
export RELAYER_SECRET=S…   # funded testnet account holding some testnet USDC for the faucet
export VERIFIER_SECRET=S…  # the escrow's verifier
npm start -w @tipee/api
```

With no `DATABASE_URL` it runs on the in-memory store and says so at boot. The
chain is the record of every tip and every balance, so a restart loses
bookkeeping, not money. With one, migrations run at boot (Postgres 13+).

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `RELAYER_SECRET` | yes | Pays fees, deploys wallets, funds the faucet. Its address is `RELAYER_ADDRESS` in `@tipee/shared`, which the extension uses to derive wallet addresses. |
| `VERIFIER_SECRET` | for claims | Without it, claims answer 422 and boot logs a warning. |
| `TREASURY_ADDRESS` | no | Shown on claim records. The escrow contract itself decides where the fee goes. |
| `DATABASE_URL` | no | Postgres. In-memory when unset. |
| `STELLAR_RPC_URL` | no | Defaults to `https://soroban-testnet.stellar.org`. |
| `FAUCET_AMOUNT` | no | USDC per faucet request. Defaults to `10`. |
| `PORT` | no | Defaults to 3000. |

## Status codes

| Code | When | Retry? |
| --- | --- | --- |
| 400 | Malformed request, or the relay refused the invocation | No |
| 403 | Claim attempted on a code that was never found on the channel | No |
| 404 | No such channel | No |
| 409 | Faucet: wallet already funded. Verify: code not on the channel yet. Claim: nothing to claim, or code already used | Sometimes |
| 410 | Verification code expired | No |
| 422 | Stellar rejected the transaction, or a reported tip did not tip this creator | No |
| 502 | YouTube could not be reached | Yes |
| 503 | Stellar would not answer | Yes |
