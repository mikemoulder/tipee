-- Tipee, first schema. Follows idea.md §7.
--
-- Money is `numeric(20, 6)`: USDC's own precision, exact, and never a float.
-- Every amount also crosses the wire as a string for the same reason.

-- `gen_random_uuid()` is core since Postgres 13, so no extension is needed and
-- no elevated privilege is asked for. Managed providers differ on which
-- extensions a project role may create; none of them differ on this.

-- Creators, provisioned the first time anyone tries to tip one.
--
-- `youtube_channel_id` is the identity, not the handle: a handle can be changed
-- or re-registered by somebody else, and an escrow that followed the handle
-- would follow it to the wrong person.
CREATE TABLE creators (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_channel_id text NOT NULL UNIQUE,
  youtube_handle     text NOT NULL,
  display_name       text NOT NULL,
  avatar_url         text,
  circle_wallet_id   text NOT NULL,
  wallet_address     text NOT NULL,
  is_verified        boolean NOT NULL DEFAULT false,
  verified_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX creators_handle_idx ON creators (lower(youtube_handle));

-- Single-use, time-bound proof that somebody controls a channel.
CREATE TYPE verification_method AS ENUM ('about_link', 'description');

CREATE TABLE verifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creators (id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  method     verification_method NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Gifters, by public address only. Keys never leave the browser, so there is
-- nothing else about them to hold.
CREATE TABLE gifters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE tip_status AS ENUM ('pending', 'confirmed', 'failed');

-- Tips.
--
-- `tx_hash` is UNIQUE, which is what makes recording one idempotent: a client
-- that retries — or two tabs that both report the same tip — cannot credit a
-- creator twice. The amount stored is the one read back from the chain, not
-- the one claimed in the request body.
CREATE TABLE tips (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gifter_id  uuid REFERENCES gifters (id) ON DELETE SET NULL,
  creator_id uuid NOT NULL REFERENCES creators (id) ON DELETE CASCADE,
  amount     numeric(20, 6) NOT NULL CHECK (amount > 0),
  tx_hash    text NOT NULL UNIQUE,
  status     tip_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tips_creator_idx ON tips (creator_id, created_at DESC);

CREATE TYPE withdrawal_status AS ENUM ('pending', 'completed', 'failed');

CREATE TABLE withdrawals (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id           uuid NOT NULL REFERENCES creators (id) ON DELETE CASCADE,
  amount_gross         numeric(20, 6) NOT NULL,
  platform_fee         numeric(20, 6) NOT NULL,
  amount_net           numeric(20, 6) NOT NULL,
  destination_address  text NOT NULL,
  platform_fee_address text NOT NULL,
  circle_tx_hash       text,
  status               withdrawal_status NOT NULL DEFAULT 'pending',
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX withdrawals_creator_idx ON withdrawals (creator_id, created_at DESC);
