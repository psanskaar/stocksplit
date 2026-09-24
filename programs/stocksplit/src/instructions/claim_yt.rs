use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Token, Transfer};

use crate::{errors::StockSplitError, state::Vault};

#[derive(Accounts)]
pub struct ClaimYt<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

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

    /// Vault's USDC account — source of YT claim payout
    #[account(
        mut,
        address = vault.vault_usdc_account,
    )]
    pub vault_usdc_account: Box<Account<'info, anchor_spl::token::TokenAccount>>,

    /// Claimer's USDC account — receives USDC payout
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = claimer,
    )]
    pub claimer_usdc_account: Box<Account<'info, anchor_spl::token::TokenAccount>>,

    /// Claimer's YT token account — YT gets burned here
    #[account(
        mut,
        associated_token::mint = yt_mint,
        associated_token::authority = claimer,
    )]
    pub claimer_yt_account: Box<Account<'info, anchor_spl::token::TokenAccount>>,

    /// YT mint — burned here
    #[account(
        mut,
        address = vault.yt_mint,
    )]
    pub yt_mint: Box<Account<'info, anchor_spl::token::Mint>>,

    /// USDC mint
    #[account(address = vault.usdc_mint)]
    pub usdc_mint: Box<Account<'info, anchor_spl::token::Mint>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimYt>, amount_raw: u64) -> Result<()> {
    require!(amount_raw > 0, StockSplitError::ZeroAmount);

    require!(
        ctx.accounts.claimer_yt_account.amount >= amount_raw,
        StockSplitError::InsufficientYtBalance
    );

    let usdc_per_yt = ctx.accounts.vault.usdc_per_yt();
    require!(usdc_per_yt > 0.0, StockSplitError::ZeroUsdcPerYt);

    // USDC to send = amount_raw × usdc_per_yt (floored to avoid rounding dust issues)
    let usdc_to_send = ((amount_raw as f64) * usdc_per_yt).floor() as u64;
    require!(usdc_to_send > 0, StockSplitError::ZeroAmount);

    msg!(
        "ClaimYT: burning {} YT, sending {} USDC raw (usdc_per_yt={})",
        amount_raw,
        usdc_to_send,
        usdc_per_yt
    );

    // Burn the YT tokens from claimer
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.yt_mint.to_account_info(),
                from: ctx.accounts.claimer_yt_account.to_account_info(),
                authority: ctx.accounts.claimer.to_account_info(),
            },
        ),
        amount_raw,
    )?;

    // Transfer USDC from vault to claimer
    let xstock_mint_key = ctx.accounts.vault.xstock_mint;
    let maturity_bytes = ctx.accounts.vault.maturity_timestamp.to_le_bytes();
    let bump_bytes = [ctx.accounts.vault.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"vault",
        xstock_mint_key.as_ref(),
        &maturity_bytes,
        &bump_bytes,
    ]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_usdc_account.to_account_info(),
                to: ctx.accounts.claimer_usdc_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        usdc_to_send,
    )?;

    // Update vault state
    let vault = &mut ctx.accounts.vault;
    vault.total_yt_outstanding = vault
        .total_yt_outstanding
        .saturating_sub(amount_raw);

    Ok(())
}
