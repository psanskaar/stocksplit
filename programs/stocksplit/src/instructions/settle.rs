use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Token, Transfer},
    token_2022::Token2022,
};

use crate::{errors::StockSplitError, state::Vault};

/// settle() is called once after maturity.
///
/// It:
/// 1. Reads the current multiplier from the xStock mint
/// 2. Computes excess raw xStock = dividend accumulation
/// 3. Transfers the excess to a temporary account
/// 4. Calls Jupiter swap via remaining_accounts (route passed as instruction data)
/// 5. Deducts 1% clearinghouse fee from USDC balance → sends to protocol_usdc_fee_account
/// 6. Records usdc_per_yt using distributable USDC (99%) for subsequent claim_yt() calls
///
/// For the hackathon demo, the Jupiter swap is executed as a separate transaction
/// submitted alongside this instruction (the caller computes the route off-chain and
/// passes the resulting USDC into vault_usdc_account before or atomically with settle).
/// In production this would be a full Jupiter CPI.
///
/// Simplified settle for demo: caller pre-executes the swap externally and passes
/// the resulting USDC amount. The program verifies vault_usdc_account balance
/// to compute usdc_per_yt.
#[derive(Accounts)]
pub struct Settle<'info> {
    /// Anyone can call settle after maturity
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"vault",
            vault.xstock_mint.as_ref(),
            &vault.maturity_timestamp.to_le_bytes(),
        ],
        bump = vault.bump,
        constraint = !vault.settled @ StockSplitError::AlreadySettled,
    )]
    pub vault: Box<Account<'info, Vault>>,

    /// xStock Token-2022 mint — to read current multiplier
    /// CHECK: validated via vault.xstock_mint
    #[account(address = vault.xstock_mint)]
    pub xstock_mint: UncheckedAccount<'info>,

    /// Vault's xStock account — we transfer excess out of here
    /// CHECK: validated via vault.vault_xstock_account
    #[account(
        mut,
        address = vault.vault_xstock_account,
    )]
    pub vault_xstock_account: UncheckedAccount<'info>,

    /// Vault's USDC account — will receive Jupiter swap proceeds
    /// The caller is responsible for ensuring USDC lands here
    /// (via a separate Jupiter swap transaction submitted in the same bundle or before)
    #[account(
        mut,
        address = vault.vault_usdc_account,
    )]
    pub vault_usdc_account: Box<Account<'info, anchor_spl::token::TokenAccount>>,

    /// Protocol USDC fee account — receives 1% clearinghouse fee.
    /// Must be owned by vault.authority and have mint == vault.usdc_mint.
    /// CHECK: We manually validate owner and mint below using spl_token account data.
    #[account(mut)]
    pub protocol_usdc_fee_account: UncheckedAccount<'info>,

    /// CHECK: Verified by the Token-2022 transfer_checked CPI during settle —
    /// must be a valid xStock token account owned by the caller (settler).
    #[account(mut)]
    pub caller_xstock_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Settle>, _jupiter_route_data: Vec<u8>) -> Result<()> {
    let clock = Clock::get()?;

    // Must be past maturity
    require!(
        clock.unix_timestamp >= ctx.accounts.vault.maturity_timestamp,
        StockSplitError::NotMatured
    );

    // Read current multiplier from vault state (set by update_multiplier() oracle instruction)
    let current_multiplier = ctx.accounts.vault.current_multiplier();

    let vault = &ctx.accounts.vault;

    // Compute excess raw xStock (dividend accumulation)
    let excess_raw = vault.excess_raw_xstock(current_multiplier);

    require!(excess_raw > 0, StockSplitError::ZeroExcess);

    msg!(
        "Settlement: multiplier_at_deposit={}, current_multiplier={}, excess_raw={}",
        vault.multiplier_at_deposit(),
        current_multiplier,
        excess_raw
    );

    // ── Validate protocol_usdc_fee_account ────────────────────────────────────
    // Parse as a standard SPL token account (USDC is Token program, not Token-2022).
    {
        let fee_acct_info = ctx.accounts.protocol_usdc_fee_account.to_account_info();
        let fee_acct_data = fee_acct_info.try_borrow_data()?;

        // Standard SPL token account layout (165 bytes):
        // Bytes [0..32]  = mint pubkey
        // Bytes [32..64] = owner pubkey
        require!(
            fee_acct_data.len() >= 165,
            StockSplitError::InvalidFeeAccount
        );

        let fee_mint = Pubkey::try_from(&fee_acct_data[0..32])
            .map_err(|_| StockSplitError::InvalidFeeAccount)?;
        let fee_owner = Pubkey::try_from(&fee_acct_data[32..64])
            .map_err(|_| StockSplitError::InvalidFeeAccount)?;

        require!(
            fee_mint == ctx.accounts.vault.usdc_mint,
            StockSplitError::InvalidFeeAccount
        );
        require!(
            fee_owner == ctx.accounts.vault.authority,
            StockSplitError::InvalidFeeAccount
        );
    }

    // Build vault signer seeds (needed for both xStock transfer and USDC fee transfer)
    let xstock_mint_key = vault.xstock_mint;
    let maturity_bytes = vault.maturity_timestamp.to_le_bytes();
    let bump_bytes = [vault.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"vault",
        xstock_mint_key.as_ref(),
        &maturity_bytes,
        &bump_bytes,
    ]];

    // Transfer excess xStock from vault to caller for swapping
    let transfer_excess_ix = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::id(),
        ctx.accounts.vault_xstock_account.key,
        ctx.accounts.xstock_mint.key,
        ctx.accounts.caller_xstock_account.key,
        ctx.accounts.vault.to_account_info().key,
        &[],
        excess_raw,
        6,
    )?;

    anchor_lang::solana_program::program::invoke_signed(
        &transfer_excess_ix,
        &[
            ctx.accounts.vault_xstock_account.to_account_info(),
            ctx.accounts.xstock_mint.to_account_info(),
            ctx.accounts.caller_xstock_account.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.token_2022_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    // At this point, the caller is expected to have already deposited USDC into
    // vault_usdc_account (via Jupiter swap in the same Jito bundle or prior tx).
    // We read the current USDC balance to compute usdc_per_yt.
    let total_usdc = ctx.accounts.vault_usdc_account.amount;

    require!(total_usdc > 0, StockSplitError::ZeroUsdcPerYt);

    // ── Clearinghouse fee: 100 bps = 1.0% ─────────────────────────────────────
    // fee_usdc = total_usdc × 100 / 10_000
    let fee_usdc = total_usdc
        .checked_mul(100)
        .ok_or(StockSplitError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(StockSplitError::MathOverflow)?;

    require!(fee_usdc < total_usdc, StockSplitError::FeeTooLarge);

    let distributable_usdc = total_usdc
        .checked_sub(fee_usdc)
        .ok_or(StockSplitError::MathOverflow)?;

    // Transfer fee_usdc → protocol_usdc_fee_account (vault PDA is signer)
    if fee_usdc > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_usdc_account.to_account_info(),
                    to: ctx.accounts.protocol_usdc_fee_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
            fee_usdc,
        )?;
    }

    let total_yt = ctx.accounts.vault.total_yt_outstanding;
    require!(total_yt > 0, StockSplitError::ZeroAmount);

    // usdc_per_yt = distributable_usdc / total_yt_outstanding (both as f64)
    let usdc_per_yt = (distributable_usdc as f64) / (total_yt as f64);

    let vault = &mut ctx.accounts.vault;
    vault.usdc_per_yt_bits = usdc_per_yt.to_bits();
    vault.settled = true;

    msg!(
        "Settled: total_usdc={}, fee_usdc={}, distributable_usdc={}, total_yt={}, usdc_per_yt={}",
        total_usdc,
        fee_usdc,
        distributable_usdc,
        total_yt,
        usdc_per_yt
    );

    Ok(())
}
