use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Token};
use anchor_spl::token_2022::Token2022;

use crate::{errors::StockSplitError, state::Vault};

#[derive(Accounts)]
pub struct RedeemPt<'info> {
    #[account(mut)]
    pub redeemer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"vault",
            vault.xstock_mint.as_ref(),
            &vault.maturity_timestamp.to_le_bytes(),
        ],
        bump = vault.bump,
        constraint = vault.settled @ StockSplitError::NotSettled,
    )]
    pub vault: Box<Account<'info, Vault>>,

    /// xStock Token-2022 mint — to read current multiplier
    /// CHECK: validated via vault.xstock_mint
    #[account(address = vault.xstock_mint)]
    pub xstock_mint: UncheckedAccount<'info>,

    /// Vault's xStock account — source of redemption
    /// CHECK: validated via vault.vault_xstock_account
    #[account(
        mut,
        address = vault.vault_xstock_account,
    )]
    pub vault_xstock_account: UncheckedAccount<'info>,

    /// CHECK: Verified by the Token-2022 transfer_checked CPI — must be a valid
    /// token account for the xStock mint owned by the redeemer.
    #[account(mut)]
    pub redeemer_xstock_account: UncheckedAccount<'info>,

    /// Redeemer's PT token account — PT gets burned here
    #[account(
        mut,
        associated_token::mint = pt_mint,
        associated_token::authority = redeemer,
    )]
    pub redeemer_pt_account: Box<Account<'info, anchor_spl::token::TokenAccount>>,

    /// PT mint — vault burns from here
    #[account(
        mut,
        address = vault.pt_mint,
    )]
    pub pt_mint: Box<Account<'info, anchor_spl::token::Mint>>,

    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<RedeemPt>, amount_raw: u64) -> Result<()> {
    require!(amount_raw > 0, StockSplitError::ZeroAmount);

    require!(
        ctx.accounts.redeemer_pt_account.amount >= amount_raw,
        StockSplitError::InsufficientPtBalance
    );

    let current_multiplier = ctx.accounts.vault.current_multiplier();

    // Compute how much raw xStock to return for this PT amount
    let xstock_to_return = ctx
        .accounts
        .vault
        .pt_to_xstock_raw(amount_raw, current_multiplier)?;

    require!(
        xstock_to_return > 0,
        StockSplitError::ZeroAmount
    );

    msg!(
        "RedeemPT: burning {} PT, returning {} raw xStock (multiplier_at_deposit={}, current={})",
        amount_raw,
        xstock_to_return,
        ctx.accounts.vault.multiplier_at_deposit(),
        current_multiplier
    );

    // Burn the PT tokens from redeemer
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.pt_mint.to_account_info(),
                from: ctx.accounts.redeemer_pt_account.to_account_info(),
                authority: ctx.accounts.redeemer.to_account_info(),
            },
        ),
        amount_raw,
    )?;

    // Transfer xStock from vault to redeemer (Token-2022)
    let xstock_mint_key = ctx.accounts.vault.xstock_mint;
    let maturity_bytes = ctx.accounts.vault.maturity_timestamp.to_le_bytes();
    let bump_bytes = [ctx.accounts.vault.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"vault",
        xstock_mint_key.as_ref(),
        &maturity_bytes,
        &bump_bytes,
    ]];

    let transfer_ix = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::id(),
        ctx.accounts.vault_xstock_account.key,
        ctx.accounts.xstock_mint.key,
        ctx.accounts.redeemer_xstock_account.key,
        ctx.accounts.vault.to_account_info().key,
        &[],
        xstock_to_return,
        6,
    )?;

    anchor_lang::solana_program::program::invoke_signed(
        &transfer_ix,
        &[
            ctx.accounts.vault_xstock_account.to_account_info(),
            ctx.accounts.xstock_mint.to_account_info(),
            ctx.accounts.redeemer_xstock_account.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.token_2022_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Update vault state
    let vault = &mut ctx.accounts.vault;
    vault.total_pt_outstanding = vault
        .total_pt_outstanding
        .saturating_sub(amount_raw);

    Ok(())
}
