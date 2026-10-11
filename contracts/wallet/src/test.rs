#![cfg(test)]

extern crate std;

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    auth::ContractContext,
    testutils::{Address as _, BytesN as _, Ledger},
    vec, Address, BytesN, Env, IntoVal, String, Symbol, Vec,
};

const ONE_USDC: i128 = 10_000_000;
const NOW: u64 = 1_760_000_000;

struct Setup {
    env: Env,
    wallet: Address,
    owner: SigningKey,
    escrow: Address,
    token: Address,
}

fn key() -> SigningKey {
    SigningKey::generate(&mut rand::thread_rng())
}

fn pk(env: &Env, k: &SigningKey) -> BytesN<32> {
    BytesN::from_array(env, &k.verifying_key().to_bytes())
}

fn setup() -> Setup {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);
    let owner = key();
    let wallet = env.register(Wallet, (pk(&env, &owner),));
    Setup {
        wallet,
        owner,
        escrow: Address::generate(&env),
        token: Address::generate(&env),
        env,
    }
}

fn sign(env: &Env, k: &SigningKey, payload: &BytesN<32>) -> Val {
    let sig = k.sign(&payload.to_array()).to_bytes();
    let sigs: Vec<Signature> = vec![
        env,
        Signature { public_key: pk(env, k), signature: BytesN::from_array(env, &sig) },
    ];
    sigs.into_val(env)
}

fn tip_ctx(t: &Setup, from: &Address, amount: i128) -> Context {
    Context::Contract(ContractContext {
        contract: t.escrow.clone(),
        fn_name: Symbol::new(&t.env, "tip"),
        args: vec![
            &t.env,
            from.into_val(&t.env),
            String::from_str(&t.env, "UC_x5XG1OV2P6uZZ5FSM9Ttw").into_val(&t.env),
            amount.into_val(&t.env),
            String::from_str(&t.env, "").into_val(&t.env),
        ],
    })
}

fn transfer_ctx(t: &Setup, from: &Address, to: &Address, amount: i128) -> Context {
    Context::Contract(ContractContext {
        contract: t.token.clone(),
        fn_name: Symbol::new(&t.env, "transfer"),
        args: vec![&t.env, from.into_val(&t.env), to.into_val(&t.env), amount.into_val(&t.env)],
    })
}

fn tip_contexts(t: &Setup, amount: i128) -> Vec<Context> {
    vec![
        &t.env,
        tip_ctx(t, &t.wallet, amount),
        transfer_ctx(t, &t.wallet, &t.escrow, amount),
    ]
}

fn check(t: &Setup, k: &SigningKey, contexts: Vec<Context>) -> Result<(), Error> {
    let payload = BytesN::<32>::random(&t.env);
    let sig = sign(&t.env, k, &payload);
    t.env
        .try_invoke_contract_check_auth::<Error>(&t.wallet, &payload, sig, &contexts)
        .map_err(|e| match e {
            Ok(e) => e,
            Err(_) => panic!("check_auth failed without a contract error"),
        })
}

fn add_session(t: &Setup, session_key: &SigningKey, cap: i128) {
    t.env.mock_all_auths();
    WalletClient::new(&t.env, &t.wallet).set_session(&Session {
        key: pk(&t.env, session_key),
        escrow: t.escrow.clone(),
        token: t.token.clone(),
        daily_cap: cap,
        expires_at: NOW + 7 * 86_400,
    });
    t.env.set_auths(&[]);
}

#[test]
fn owner_can_authorise_anything() {
    let t = setup();
    let elsewhere = Address::generate(&t.env);
    assert_eq!(check(&t, &t.owner, tip_contexts(&t, 50 * ONE_USDC)), Ok(()));
    assert_eq!(
        check(&t, &t.owner, vec![&t.env, transfer_ctx(&t, &t.wallet, &elsewhere, ONE_USDC)]),
        Ok(())
    );
}

#[test]
fn a_bad_owner_signature_fails() {
    let t = setup();
    let payload = BytesN::<32>::random(&t.env);
    let other = BytesN::<32>::random(&t.env);
    // Signed over a different payload than the one being checked.
    let sig = sign(&t.env, &t.owner, &other);
    let r = t
        .env
        .try_invoke_contract_check_auth::<Error>(&t.wallet, &payload, sig, &tip_contexts(&t, ONE_USDC));
    assert!(r.is_err());
}

#[test]
fn a_stranger_is_rejected() {
    let t = setup();
    assert_eq!(check(&t, &key(), tip_contexts(&t, ONE_USDC)), Err(Error::UnknownSigner));
}

#[test]
fn session_key_tips_under_the_cap() {
    let t = setup();
    let sk = key();
    add_session(&t, &sk, 5 * ONE_USDC);

    assert_eq!(check(&t, &sk, tip_contexts(&t, 2 * ONE_USDC)), Ok(()));
    assert_eq!(check(&t, &sk, tip_contexts(&t, 2 * ONE_USDC)), Ok(()));
    assert_eq!(WalletClient::new(&t.env, &t.wallet).spent_today(), 4 * ONE_USDC);
    // 4 + 2 > 5
    assert_eq!(check(&t, &sk, tip_contexts(&t, 2 * ONE_USDC)), Err(Error::OverCap));
    // 4 + 1 == 5 is still fine
    assert_eq!(check(&t, &sk, tip_contexts(&t, ONE_USDC)), Ok(()));
}

#[test]
fn the_cap_resets_the_next_day() {
    let t = setup();
    let sk = key();
    add_session(&t, &sk, 5 * ONE_USDC);
    assert_eq!(check(&t, &sk, tip_contexts(&t, 5 * ONE_USDC)), Ok(()));
    assert_eq!(check(&t, &sk, tip_contexts(&t, ONE_USDC)), Err(Error::OverCap));

    t.env.ledger().set_timestamp(NOW + 86_400);
    assert_eq!(check(&t, &sk, tip_contexts(&t, ONE_USDC)), Ok(()));
}

#[test]
fn session_key_cannot_move_money_anywhere_else() {
    let t = setup();
    let sk = key();
    add_session(&t, &sk, 5 * ONE_USDC);
    let thief = Address::generate(&t.env);

    // A plain transfer out.
    assert_eq!(
        check(&t, &sk, vec![&t.env, transfer_ctx(&t, &t.wallet, &thief, ONE_USDC)]),
        Err(Error::NotAllowed)
    );
    // A tip whose USDC goes somewhere other than the escrow.
    assert_eq!(
        check(
            &t,
            &sk,
            vec![&t.env, tip_ctx(&t, &t.wallet, ONE_USDC), transfer_ctx(&t, &t.wallet, &thief, ONE_USDC)]
        ),
        Err(Error::NotAllowed)
    );
    // A transfer into the escrow with no tip to credit it.
    assert_eq!(
        check(&t, &sk, vec![&t.env, transfer_ctx(&t, &t.wallet, &t.escrow, ONE_USDC)]),
        Err(Error::NotAllowed)
    );
    // Changing its own session.
    let set_session = Context::Contract(ContractContext {
        contract: t.wallet.clone(),
        fn_name: Symbol::new(&t.env, "set_session"),
        args: vec![&t.env],
    });
    assert_eq!(check(&t, &sk, vec![&t.env, set_session]), Err(Error::NotAllowed));
}

#[test]
fn session_expires() {
    let t = setup();
    let sk = key();
    add_session(&t, &sk, 5 * ONE_USDC);
    t.env.ledger().set_timestamp(NOW + 7 * 86_400);
    assert_eq!(check(&t, &sk, tip_contexts(&t, ONE_USDC)), Err(Error::SessionExpired));
}

#[test]
fn revoked_session_is_unknown() {
    let t = setup();
    let sk = key();
    add_session(&t, &sk, 5 * ONE_USDC);
    t.env.mock_all_auths();
    WalletClient::new(&t.env, &t.wallet).revoke_session();
    assert_eq!(check(&t, &sk, tip_contexts(&t, ONE_USDC)), Err(Error::UnknownSigner));
}

#[test]
fn wallet_tips_through_the_real_escrow() {
    use soroban_sdk::token::{StellarAssetClient, TokenClient};
    use tipee_escrow::{Escrow, EscrowClient};

    let env = Env::default();
    env.mock_all_auths();
    let owner = key();
    let wallet = env.register(Wallet, (pk(&env, &owner),));
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    StellarAssetClient::new(&env, &sac.address()).mint(&wallet, &(10 * ONE_USDC));
    let a = Address::generate(&env);
    let escrow = env.register(Escrow, (a.clone(), a.clone(), sac.address(), a, 400u32));

    let ch = String::from_str(&env, "UC_x5XG1OV2P6uZZ5FSM9Ttw");
    EscrowClient::new(&env, &escrow).tip(&wallet, &ch, &(3 * ONE_USDC), &String::from_str(&env, "hi"));

    assert_eq!(TokenClient::new(&env, &sac.address()).balance(&wallet), 7 * ONE_USDC);
    assert_eq!(EscrowClient::new(&env, &escrow).balance(&ch), 3 * ONE_USDC);
}
