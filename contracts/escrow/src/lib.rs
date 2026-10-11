//! Tipee escrow.
//!
//! Tips for a YouTube creator are held here, keyed by the creator's immutable
//! channel ID (`UC…`, 24 characters), until the creator proves they own the
//! channel and claims. The handle is never a key: a handle can be changed or
//! re-registered by someone else, and an escrow that followed it would follow it
//! to the wrong person.
//!
//! A tip is one call: `tip` moves the USDC from the gifter into this contract and
//! emits the gifter's note beside it, so a failed transfer cannot leave a note
//! behind claiming it happened. The note rides in the event, not in the
//! transaction memo, because a Stellar text memo holds 28 bytes and Tipee notes
//! are allowed 120.
//!
//! ## Trust
//!
//! The gifter side is trustless: only the gifter can authorise their tip, and
//! nobody can take money out of a channel's balance except through `claim`.
//! `claim` is authorised by the verifier, the backend key that checks channel
//! ownership. That is the one trusted party, and it is named in the README.
//!
//! ## The fee
//!
//! Tipping is free. Claiming takes `fee_bps` (400 = 4%) for the treasury. The fee
//! is floored and the creator's net is derived by subtraction, exactly as
//! `packages/shared/src/fees.ts` does it, so `net + fee == gross` for every
//! amount and any rounding remainder goes to the creator.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, Env, String,
};

#[cfg(test)]
mod test;

const DAY_IN_LEDGERS: u32 = 17_280;
/// A channel balance stays live for 90 days after its last tip or claim, so a
/// creator who has never heard of Tipee does not find their tips archived.
const BALANCE_BUMP: u32 = 90 * DAY_IN_LEDGERS;
const BALANCE_THRESHOLD: u32 = BALANCE_BUMP - DAY_IN_LEDGERS;
const INSTANCE_BUMP: u32 = 90 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - DAY_IN_LEDGERS;

/// Matches `MEMO_MAX_BYTES` in `packages/shared/src/limits.ts`.
pub const NOTE_MAX_BYTES: u32 = 120;
pub const CHANNEL_ID_LEN: u32 = 24;
pub const BPS_DENOMINATOR: i128 = 10_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    InvalidChannel = 2,
    NoteTooLong = 3,
    NothingToClaim = 4,
    InvalidFee = 5,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Verifier,
    Token,
    Treasury,
    FeeBps,
    /// Unclaimed USDC held for a channel.
    Balance(String),
    /// Everything ever tipped to a channel, claimed or not. Display only.
    Lifetime(String),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub verifier: Address,
    pub token: Address,
    pub treasury: Address,
    pub fee_bps: u32,
}

/// Topics: `["tip", channel_id, from]`. Data: `{ amount, note }`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tip {
    #[topic]
    pub channel_id: String,
    #[topic]
    pub from: Address,
    pub amount: i128,
    pub note: String,
}

/// Topics: `["claim", channel_id]`. Data: `{ to, net, fee }`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claim {
    #[topic]
    pub channel_id: String,
    pub to: Address,
    pub net: i128,
    pub fee: i128,
}

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    pub fn __constructor(
        env: Env,
        admin: Address,
        verifier: Address,
        token: Address,
        treasury: Address,
        fee_bps: u32,
    ) {
        check_fee(&env, fee_bps);
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Verifier, &verifier);
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::Treasury, &treasury);
        s.set(&DataKey::FeeBps, &fee_bps);
    }

    /// Moves `amount` of USDC from `from` into escrow for `channel_id`.
    pub fn tip(env: Env, from: Address, channel_id: String, amount: i128, note: String) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        check_channel(&env, &channel_id);
        if note.len() > NOTE_MAX_BYTES {
            panic_with_error!(&env, Error::NoteTooLong);
        }

        token::Client::new(&env, &token(&env)).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );

        add(&env, DataKey::Balance(channel_id.clone()), amount);
        add(&env, DataKey::Lifetime(channel_id.clone()), amount);
        bump_instance(&env);

        Tip { channel_id, from, amount, note }.publish(&env);
    }

    /// Pays a channel's whole balance out to `to`, less the fee. Verifier only.
    /// Returns `(net, fee)`.
    pub fn claim(env: Env, channel_id: String, to: Address) -> (i128, i128) {
        verifier(&env).require_auth();
        check_channel(&env, &channel_id);

        let key = DataKey::Balance(channel_id.clone());
        let gross: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if gross <= 0 {
            panic_with_error!(&env, Error::NothingToClaim);
        }

        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap();
        let fee = gross * fee_bps as i128 / BPS_DENOMINATOR;
        let net = gross - fee;

        // Zero the balance before paying out, so nothing can be claimed twice.
        env.storage().persistent().set(&key, &0i128);
        bump(&env, &key);

        let usdc = token::Client::new(&env, &token(&env));
        let me = env.current_contract_address();
        usdc.transfer(&me, &to, &net);
        if fee > 0 {
            let treasury: Address = env.storage().instance().get(&DataKey::Treasury).unwrap();
            usdc.transfer(&me, &treasury, &fee);
        }
        bump_instance(&env);

        Claim { channel_id, to, net, fee }.publish(&env);
        (net, fee)
    }

    /// Unclaimed USDC held for a channel.
    pub fn balance(env: Env, channel_id: String) -> i128 {
        env.storage().persistent().get(&DataKey::Balance(channel_id)).unwrap_or(0)
    }

    /// Everything ever tipped to a channel.
    pub fn lifetime(env: Env, channel_id: String) -> i128 {
        env.storage().persistent().get(&DataKey::Lifetime(channel_id)).unwrap_or(0)
    }

    pub fn config(env: Env) -> Config {
        let s = env.storage().instance();
        Config {
            admin: s.get(&DataKey::Admin).unwrap(),
            verifier: s.get(&DataKey::Verifier).unwrap(),
            token: s.get(&DataKey::Token).unwrap(),
            treasury: s.get(&DataKey::Treasury).unwrap(),
            fee_bps: s.get(&DataKey::FeeBps).unwrap(),
        }
    }

    pub fn set_verifier(env: Env, verifier: Address) {
        admin(&env).require_auth();
        env.storage().instance().set(&DataKey::Verifier, &verifier);
    }

    pub fn set_treasury(env: Env, treasury: Address) {
        admin(&env).require_auth();
        env.storage().instance().set(&DataKey::Treasury, &treasury);
    }

    /// Replaces this contract's code, keeping its address and balances.
    pub fn upgrade(env: Env, wasm_hash: BytesN<32>) {
        admin(&env).require_auth();
        #[allow(deprecated)]
        env.deployer().update_current_contract_wasm(wasm_hash);
    }
}

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn verifier(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Verifier).unwrap()
}

fn token(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Token).unwrap()
}

fn check_fee(env: &Env, fee_bps: u32) {
    if fee_bps as i128 > BPS_DENOMINATOR {
        panic_with_error!(env, Error::InvalidFee);
    }
}

/// A YouTube channel ID: `UC` followed by 22 characters of base64url. Checked on
/// chain because USDC sent to a malformed key could never be claimed.
fn check_channel(env: &Env, channel_id: &String) {
    if channel_id.len() != CHANNEL_ID_LEN {
        panic_with_error!(env, Error::InvalidChannel);
    }
    let mut buf = [0u8; CHANNEL_ID_LEN as usize];
    channel_id.copy_into_slice(&mut buf);
    if &buf[..2] != b"UC" {
        panic_with_error!(env, Error::InvalidChannel);
    }
    for c in &buf[2..] {
        if !(c.is_ascii_alphanumeric() || *c == b'-' || *c == b'_') {
            panic_with_error!(env, Error::InvalidChannel);
        }
    }
}

fn add(env: &Env, key: DataKey, amount: i128) {
    let s = env.storage().persistent();
    let current: i128 = s.get(&key).unwrap_or(0);
    s.set(&key, &(current + amount));
    bump(env, &key);
}

fn bump(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, BALANCE_THRESHOLD, BALANCE_BUMP);
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
}
