//! Tipee wallet: a Soroban contract account for one gifter.
//!
//! Why a contract account and not a plain Stellar account: a contract address
//! holds USDC through the Stellar Asset Contract with no trustline and no XLM
//! reserve, and the transaction that moves it can be submitted (and paid for)
//! by anyone. So a gifter holds USDC and nothing else, and never sees XLM.
//!
//! ## Signers
//!
//! - **Owner.** The ed25519 key the extension derives from the gifter's seed
//!   and keeps PIN-encrypted. It can authorise anything this wallet does.
//! - **Session key (optional).** A second ed25519 key the owner registers for
//!   quick tips. It may authorise `tip` on one escrow contract, plus the USDC
//!   transfer into that escrow that `tip` makes, and nothing else, up to a
//!   daily cap and until it expires. The cap is enforced here, on chain, so a
//!   compromised extension holding the session key can lose at most the cap.
//!
//! ## Signature format
//!
//! `signatures` is `Vec<{ public_key: BytesN<32>, signature: BytesN<64> }>`,
//! the same shape the Stellar SDKs' `authorizeEntry` produces for a keypair, so
//! the extension signs with the stock SDK helper and no custom encoding.

#![no_std]

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl, contracttype,
    crypto::Hash,
    symbol_short, Address, BytesN, Env, Symbol, TryFromVal, Val, Vec,
};

#[cfg(test)]
mod test;

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP: u32 = 120 * DAY_IN_LEDGERS;
const INSTANCE_THRESHOLD: u32 = INSTANCE_BUMP - 7 * DAY_IN_LEDGERS;
const SECONDS_PER_DAY: u64 = 86_400;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Exactly one signature is accepted.
    BadSignatureCount = 1,
    /// The signing key is neither the owner nor a live session key.
    UnknownSigner = 2,
    /// The session key tried to authorise something other than a tip.
    NotAllowed = 3,
    /// The session key's daily cap would be exceeded.
    OverCap = 4,
    SessionExpired = 5,
    InvalidSession = 6,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Signature {
    pub public_key: BytesN<32>,
    pub signature: BytesN<64>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub key: BytesN<32>,
    /// The only contract the session may call.
    pub escrow: Address,
    /// The USDC contract `tip` pulls from this wallet.
    pub token: Address,
    /// Most USDC the session may tip per UTC day, in stroops (7 decimals).
    pub daily_cap: i128,
    /// Unix seconds.
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Spent {
    pub day: u64,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Owner,
    Session,
    Spent,
}

#[contract]
pub struct Wallet;

#[contractimpl]
impl Wallet {
    pub fn __constructor(env: Env, owner: BytesN<32>) {
        env.storage().instance().set(&DataKey::Owner, &owner);
    }

    pub fn owner(env: Env) -> BytesN<32> {
        env.storage().instance().get(&DataKey::Owner).unwrap()
    }

    pub fn session(env: Env) -> Option<Session> {
        env.storage().instance().get(&DataKey::Session)
    }

    /// Spent so far today by the session key.
    pub fn spent_today(env: Env) -> i128 {
        let today = env.ledger().timestamp() / SECONDS_PER_DAY;
        match env.storage().instance().get::<_, Spent>(&DataKey::Spent) {
            Some(s) if s.day == today => s.amount,
            _ => 0,
        }
    }

    /// Registers (or replaces) the quick-tip session key. Owner only: a session
    /// key cannot authorise this call, because it is not a `tip`.
    pub fn set_session(env: Env, session: Session) -> Result<(), Error> {
        env.current_contract_address().require_auth();
        if session.daily_cap <= 0 || session.expires_at <= env.ledger().timestamp() {
            return Err(Error::InvalidSession);
        }
        let s = env.storage().instance();
        s.set(&DataKey::Session, &session);
        s.remove(&DataKey::Spent);
        bump(&env);
        Ok(())
    }

    pub fn revoke_session(env: Env) {
        env.current_contract_address().require_auth();
        env.storage().instance().remove(&DataKey::Session);
        env.storage().instance().remove(&DataKey::Spent);
    }
}

#[contractimpl]
impl CustomAccountInterface for Wallet {
    type Signature = Vec<Signature>;
    type Error = Error;

    #[allow(non_snake_case)]
    fn __check_auth(
        env: Env,
        payload: Hash<32>,
        signatures: Vec<Signature>,
        contexts: Vec<Context>,
    ) -> Result<(), Error> {
        if signatures.len() != 1 {
            return Err(Error::BadSignatureCount);
        }
        let sig = signatures.get_unchecked(0);
        let owner: BytesN<32> = env.storage().instance().get(&DataKey::Owner).unwrap();

        if sig.public_key == owner {
            env.crypto()
                .ed25519_verify(&sig.public_key, &payload.into(), &sig.signature);
            bump(&env);
            return Ok(());
        }

        let session: Session = env
            .storage()
            .instance()
            .get(&DataKey::Session)
            .ok_or(Error::UnknownSigner)?;
        if sig.public_key != session.key {
            return Err(Error::UnknownSigner);
        }
        env.crypto()
            .ed25519_verify(&sig.public_key, &payload.into(), &sig.signature);
        if env.ledger().timestamp() >= session.expires_at {
            return Err(Error::SessionExpired);
        }

        let tipped = check_session_contexts(&env, &session, &contexts)?;

        let today = env.ledger().timestamp() / SECONDS_PER_DAY;
        let spent = match env.storage().instance().get::<_, Spent>(&DataKey::Spent) {
            Some(s) if s.day == today => s.amount,
            _ => 0,
        };
        let total = spent.checked_add(tipped).ok_or(Error::OverCap)?;
        if total > session.daily_cap {
            return Err(Error::OverCap);
        }
        env.storage().instance().set(
            &DataKey::Spent,
            &Spent { day: today, amount: total },
        );
        bump(&env);
        Ok(())
    }
}

/// Every context must be either `escrow.tip(this wallet, …)` or the USDC
/// `transfer(this wallet → escrow)` that a tip makes. Returns the total tipped.
fn check_session_contexts(env: &Env, session: &Session, contexts: &Vec<Context>) -> Result<i128, Error> {
    let me = env.current_contract_address();
    let tip = Symbol::new(env, "tip");
    let transfer = symbol_short!("transfer");
    let mut tipped: i128 = 0;

    for ctx in contexts.iter() {
        let c = match ctx {
            Context::Contract(c) => c,
            _ => return Err(Error::NotAllowed),
        };
        if c.contract == session.escrow && c.fn_name == tip {
            // tip(from, channel_id, amount, note)
            if arg::<Address>(env, &c.args, 0)? != me {
                return Err(Error::NotAllowed);
            }
            let amount = arg::<i128>(env, &c.args, 2)?;
            if amount <= 0 {
                return Err(Error::NotAllowed);
            }
            tipped = tipped.checked_add(amount).ok_or(Error::OverCap)?;
        } else if c.contract == session.token && c.fn_name == transfer {
            // transfer(from, to, amount): only ever into the escrow, and only as
            // part of a tip, which is what gets counted against the cap.
            if arg::<Address>(env, &c.args, 0)? != me || arg::<Address>(env, &c.args, 1)? != session.escrow {
                return Err(Error::NotAllowed);
            }
        } else {
            return Err(Error::NotAllowed);
        }
    }
    if tipped == 0 {
        // A transfer into the escrow without a tip would move money without
        // crediting any channel; never let the session key do that.
        return Err(Error::NotAllowed);
    }
    Ok(tipped)
}

fn arg<T: TryFromVal<Env, Val>>(env: &Env, args: &Vec<Val>, i: u32) -> Result<T, Error> {
    let v = args.get(i).ok_or(Error::NotAllowed)?;
    T::try_from_val(env, &v).map_err(|_| Error::NotAllowed)
}

fn bump(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
}
