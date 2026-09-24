use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

pub use instructions::*;

// Bring __client_accounts_* modules to crate root so anchor's #[program] macro
// can resolve `use crate::__client_accounts_X` in its generated dispatch code.
// Must be pub(crate) because these modules are pub(crate) in their source file.
pub(crate) use instructions::initialize_vault::__client_accounts_initialize_vault;
pub(crate) use instructions::update_multiplier::__client_accounts_update_multiplier;
pub(crate) use instructions::deposit::__client_accounts_deposit;
pub(crate) use instructions::settle::__client_accounts_settle;
pub(crate) use instructions::redeem_pt::__client_accounts_redeem_pt;
pub(crate) use instructions::claim_yt::__client_accounts_claim_yt;
pub(crate) use instructions::withdraw::__client_accounts_withdraw;

declare_id!("9WRT68i9TJ1wi3fDv4offsxbNmkkstQAHY9XNN4YQnZG");

#[program]
pub mod stocksplit {
    use super::*;

    /// Initialize a new vault for a given xStock mint and maturity timestamp.
    /// Creates PT and YT mints, stores initial multiplier snapshot.
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        maturity_timestamp: i64,
        initial_multiplier_bits: u64,
    ) -> Result<()> {
        instructions::initialize_vault::handler(ctx, maturity_timestamp, initial_multiplier_bits)
    }

    /// Update the current multiplier stored in the vault (authority-controlled oracle).
    /// Call this when the SPYx ScaledUiAmount multiplier changes on-chain.
    pub fn update_multiplier(
        ctx: Context<UpdateMultiplier>,
        new_multiplier_bits: u64,
    ) -> Result<()> {
        instructions::update_multiplier::handler(ctx, new_multiplier_bits)
    }

    /// Deposit raw xStock tokens into the vault.
    /// Mints an equal amount of PT and YT tokens to the depositor.
    pub fn deposit(ctx: Context<Deposit>, amount_raw: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount_raw)
    }

    /// After maturity: compute excess raw tokens representing accrued dividends,
    /// swap them to USDC via Jupiter, store usdc_per_yt for YT claims.
    /// Can only be called once.
    pub fn settle(ctx: Context<Settle>, jupiter_route_data: Vec<u8>) -> Result<()> {
        instructions::settle::handler(ctx, jupiter_route_data)
    }

    /// After settlement: burn PT tokens and receive raw xStock at the snapshot ratio.
    pub fn redeem_pt(ctx: Context<RedeemPt>, amount_raw: u64) -> Result<()> {
        instructions::redeem_pt::handler(ctx, amount_raw)
    }

    /// After settlement: burn YT tokens and receive pro-rata USDC.
    pub fn claim_yt(ctx: Context<ClaimYt>, amount_raw: u64) -> Result<()> {
        instructions::claim_yt::handler(ctx, amount_raw)
    }

    /// Before settlement: burn equal PT + YT and receive raw xStock back.
    /// Early exit — only callable while vault is not yet settled.
    pub fn withdraw(ctx: Context<Withdraw>, amount_raw: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount_raw)
    }
}
