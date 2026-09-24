use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Token};
use anchor_spl::token_2022::Token2022;

use crate::{errors::StockSplitError, state::Vault};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub withdrawer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"vault",
            vault.xstock_mint.as_ref(),
            &vault.maturity_timestamp.to_le_bytes(),
        ],
        bump = vault.bump,
        constraint = !vault.settled @ StockSplitError::WithdrawAfterSettlement,
    )]
    pub vault: Box<Account<'info, Vault>>,

    /// xStock Token-2022 mint
    /// CHECK: validated via vault.xstock_mint
    #[account(address = vault.xstock_mint)]
    pub xstock_mint: UncheckedAccount<'info>,

    /// PT mint — burned here
    #[account(
        mut,
        address = vault.pt_mint,
    )]
    pub pt_mint: Box<Account<'info, anchor_spl::token::Mint>>,

    /// YT mint — burned here
    #[account(
        mut,
        address = vault.yt_mint,
    )]
    pub yt_mint: Box<Account<'info, anchor_spl::token::Mint>>,

    /// Withdrawer's PT token account — PT burned from here
    #[account(
        mut,
        associated_token::mint = pt_mint,
        associated_token::authority = withdrawer,
    )]
    pub withdrawer_pt_account: Box<Account<'info, anchor_spl::token::TokenAccount>>,

    /// Withdrawer's YT token account — YT burned from here
    #[account(
        mut,
        associated_token::mint = yt_mint,
        associated_token::authority = withdrawer,
    )]
    pub withdrawer_yt_account: Box<Account<'info, anchor_spl::token::TokenAccount>>,

    /// Withdrawer's xStock Token-2022 account — receives SPYx back
    /// CHECK: Verified by the Token-2022 transfer_checked CPI — must be a valid
    /// token account for the xStock mint owned by the withdrawer.
    #[account(mut)]
    pub withdrawer_xstock_account: UncheckedAccount<'info>,

    /// Vault's xStock token account — source of returned SPYx
    /// CHECK: validated via vault.vault_xstock_account
    #[account(
        mut,
        address = vault.vault_xstock_account,
    )]
    pub vault_xstock_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Withdraw>, amount_raw: u64) -> Result<()> {
    require!(amount_raw > 0, StockSplitError::ZeroAmount);

    require!(
        ctx.accounts.withdrawer_pt_account.amount >= amount_raw,
        StockSplitError::InsufficientPtBalance
    );

    require!(
        ctx.accounts.withdrawer_yt_account.amount >= amount_raw,
        StockSplitError::InsufficientYtBalance
    );

    msg!(
        "Withdraw: burning {} PT + {} YT, returning {} raw xStock",
        amount_raw,
        amount_raw,
        amount_raw,
    );

    // Burn PT tokens from withdrawer
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.pt_mint.to_account_info(),
                from: ctx.accounts.withdrawer_pt_account.to_account_info(),
                authority: ctx.accounts.withdrawer.to_account_info(),
            },
        ),
        amount_raw,
    )?;

    // Burn YT tokens from withdrawer
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.yt_mint.to_account_info(),
                from: ctx.accounts.withdrawer_yt_account.to_account_info(),
                authority: ctx.accounts.withdrawer.to_account_info(),
            },
        ),
        amount_raw,
    )?;

    // Transfer xStock from vault back to withdrawer (Token-2022)
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
        ctx.accounts.withdrawer_xstock_account.key,
        ctx.accounts.vault.to_account_info().key,
        &[],
        amount_raw,
        6, // SPYx decimals
    )?;

    anchor_lang::solana_program::program::invoke_signed(
        &transfer_ix,
        &[
            ctx.accounts.vault_xstock_account.to_account_info(),
            ctx.accounts.xstock_mint.to_account_info(),
            ctx.accounts.withdrawer_xstock_account.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.token_2022_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    // Update vault accounting
    let vault = &mut ctx.accounts.vault;
    vault.total_deposited_raw = vault
        .total_deposited_raw
        .checked_sub(amount_raw)
        .ok_or(StockSplitError::MathOverflow)?;
    vault.total_pt_outstanding = vault
        .total_pt_outstanding
        .checked_sub(amount_raw)
        .ok_or(StockSplitError::MathOverflow)?;
    vault.total_yt_outstanding = vault
        .total_yt_outstanding
        .checked_sub(amount_raw)
        .ok_or(StockSplitError::MathOverflow)?;

    msg!(
        "Withdraw complete. Vault remaining: {} raw xStock",
        vault.total_deposited_raw,
    );

    Ok(())
}
