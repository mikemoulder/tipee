-- Tipee on Stellar.
--
-- Creators no longer get a wallet each. Every channel's tips sit in one escrow
-- contract, keyed by the channel ID, so the per-creator Circle wallet columns
-- go. Withdrawals become claims paid by the escrow contract, so the Circle
-- transaction hash becomes a plain Stellar one.
--
-- Amounts stay numeric(20, 6): accounting is still 6 decimals. Only the chain
-- layer works in Stellar's 7, and it converts at the boundary.

ALTER TABLE creators DROP COLUMN circle_wallet_id;
ALTER TABLE creators DROP COLUMN wallet_address;

ALTER TABLE withdrawals RENAME COLUMN circle_tx_hash TO tx_hash;

-- A token is proven once (found on the channel page) and spent once (a claim
-- paid on it). Two timestamps, because those are two different events.
ALTER TABLE verifications ADD COLUMN verified_at timestamptz;
