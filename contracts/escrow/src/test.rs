#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction},
    token::{StellarAssetClient, TokenClient},
    Env, String,
};

const CHANNEL: &str = "UC_x5XG1OV2P6uZZ5FSM9Ttw";
const ONE_USDC: i128 = 10_000_000;

struct Setup<'a> {
    env: Env,
    escrow: EscrowClient<'a>,
    usdc: TokenClient<'a>,
    verifier: Address,
    treasury: Address,
    gifter: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let usdc = TokenClient::new(&env, &sac.address());

    let admin = Address::generate(&env);
    let verifier = Address::generate(&env);
    let treasury = Address::generate(&env);
    let gifter = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&gifter, &(100 * ONE_USDC));

    let id = env.register(
        Escrow,
        (admin, verifier.clone(), sac.address(), treasury.clone(), 400u32),
    );
    let escrow = EscrowClient::new(&env, &id);
    Setup { env, escrow, usdc, verifier, treasury, gifter }
}

fn s(env: &Env, v: &str) -> String {
    String::from_str(env, v)
}

#[test]
fn tip_moves_usdc_into_escrow_for_the_channel() {
    let t = setup();
    let ch = s(&t.env, CHANNEL);
    t.escrow.tip(&t.gifter, &ch, &(2 * ONE_USDC), &s(&t.env, "great video"));

    assert_eq!(t.usdc.balance(&t.gifter), 98 * ONE_USDC);
    assert_eq!(t.usdc.balance(&t.escrow.address), 2 * ONE_USDC);
    assert_eq!(t.escrow.balance(&ch), 2 * ONE_USDC);
    assert_eq!(t.escrow.lifetime(&ch), 2 * ONE_USDC);
}

#[test]
fn tip_requires_the_gifters_auth() {
    let t = setup();
    let ch = s(&t.env, CHANNEL);
    t.escrow.tip(&t.gifter, &ch, &ONE_USDC, &s(&t.env, ""));

    let auths = t.env.auths();
    assert_eq!(auths[0].0, t.gifter);
    match &auths[0].1.function {
        AuthorizedFunction::Contract((addr, name, _)) => {
            assert_eq!(addr, &t.escrow.address);
            assert_eq!(name, &soroban_sdk::Symbol::new(&t.env, "tip"));
        }
        _ => panic!("expected a contract auth"),
    }
}

#[test]
fn claim_pays_96_percent_to_creator_and_4_to_treasury() {
    let t = setup();
    let ch = s(&t.env, CHANNEL);
    t.escrow.tip(&t.gifter, &ch, &(10 * ONE_USDC), &s(&t.env, ""));

    let creator = Address::generate(&t.env);
    let (net, fee) = t.escrow.claim(&ch, &creator);
    assert_eq!(t.env.auths()[0].0, t.verifier);

    assert_eq!(net, 9_6000000);
    assert_eq!(fee, 4000000);
    assert_eq!(t.usdc.balance(&creator), net);
    assert_eq!(t.usdc.balance(&t.treasury), fee);
    assert_eq!(t.escrow.balance(&ch), 0);
    assert_eq!(t.escrow.lifetime(&ch), 10 * ONE_USDC);
}

#[test]
fn fee_floors_and_parts_sum_to_the_whole() {
    let t = setup();
    let ch = s(&t.env, CHANNEL);
    // 4% of 1_234_567 is 49_382.68, floored to 49_382.
    t.escrow.tip(&t.gifter, &ch, &1_234_567, &s(&t.env, ""));
    let (net, fee) = t.escrow.claim(&ch, &Address::generate(&t.env));
    assert_eq!(fee, 49_382);
    assert_eq!(net + fee, 1_234_567);
}

#[test]
fn second_claim_has_nothing_to_claim() {
    let t = setup();
    let ch = s(&t.env, CHANNEL);
    t.escrow.tip(&t.gifter, &ch, &ONE_USDC, &s(&t.env, ""));
    let creator = Address::generate(&t.env);
    t.escrow.claim(&ch, &creator);
    assert_eq!(t.escrow.try_claim(&ch, &creator), Err(Ok(Error::NothingToClaim.into())));
}

#[test]
fn rejects_bad_input() {
    let t = setup();
    let ch = s(&t.env, CHANNEL);
    let empty = s(&t.env, "");

    assert_eq!(t.escrow.try_tip(&t.gifter, &ch, &0, &empty), Err(Ok(Error::InvalidAmount.into())));
    assert_eq!(t.escrow.try_tip(&t.gifter, &ch, &-5, &empty), Err(Ok(Error::InvalidAmount.into())));

    for bad in ["@mkbhd", "UC_x5XG1OV2P6uZZ5FSM9Tt", "XX_x5XG1OV2P6uZZ5FSM9Ttw", "UC_x5XG1OV2P6uZZ5FSM9Tt!"] {
        assert_eq!(
            t.escrow.try_tip(&t.gifter, &s(&t.env, bad), &ONE_USDC, &empty),
            Err(Ok(Error::InvalidChannel.into())),
            "{bad}"
        );
    }

    let long = "x".repeat(121);
    assert_eq!(
        t.escrow.try_tip(&t.gifter, &ch, &ONE_USDC, &s(&t.env, &long)),
        Err(Ok(Error::NoteTooLong.into()))
    );
    let max = "x".repeat(120);
    t.escrow.tip(&t.gifter, &ch, &ONE_USDC, &s(&t.env, &max));
}

#[test]
fn channels_are_kept_apart() {
    let t = setup();
    let a = s(&t.env, CHANNEL);
    let b = s(&t.env, "UCBJycsmduvYEL83R_U4JriQ");
    t.escrow.tip(&t.gifter, &a, &ONE_USDC, &s(&t.env, ""));
    t.escrow.tip(&t.gifter, &b, &(3 * ONE_USDC), &s(&t.env, ""));
    assert_eq!(t.escrow.balance(&a), ONE_USDC);
    assert_eq!(t.escrow.balance(&b), 3 * ONE_USDC);
}

#[test]
fn constructor_rejects_fee_over_100_percent() {
    let env = Env::default();
    let a = Address::generate(&env);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        env.register(Escrow, (a.clone(), a.clone(), a.clone(), a.clone(), 10_001u32));
    }));
    assert!(r.is_err());
}
