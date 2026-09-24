use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, MintTo, Token},
    token_2022::Token2022,
    associated_token::AssociatedToken,
};

use crate::{errors::StockSplitError, state::Vault};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"vault",
            vault.xstock_mint.as_ref(),
            &vault.maturity_timestamp.to_le_bytes(),
        ],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, Vault>>,

    /// xStock Token-2022 mint — needed to read current multiplier
    /// CHECK: validated via vault.xstock_mint check
    #[account(address = vault.xstock_mint)]
    pub xstock_mint: UncheckedAccount<'info>,

    /// Depositor's xStock token account (Token-2022)
    /// CHECK: Validated by transfer CPI
    #[account(mut)]
    pub depositor_xstock_account: UncheckedAccount<'info>,

    /// Vault's xStock token account
    /// CHECK: validated by vault.vault_xstock_account
    #[account(
        mut,
        address = vault.vault_xstock_account,
    )]
    pub vault_xstock_account: UncheckedAccount<'info>,

    /// Protocol fee account for SPYx (Token-2022).
    /// Must be owned by vault.authority and have mint == vault.xstock_mint.
    /// CHECK: We manually validate owner and mint below using spl_token_2022 account data.
    #[account(mut)]
    pub protocol_fee_account: UncheckedAccount<'info>,

    /// PT mint — vault is authority
    #[account(
        mut,
        address = vault.pt_mint,
    )]
    pub pt_mint: Box<Account<'info, anchor_spl::token::Mint>>,

    /// YT mint — vault is authority
    #[account(
        mut,
        address = vault.yt_mint,
    )]
    pub yt_mint: Box<Account<'info, anchor_spl::token::Mint>>,

    /// Depositor's PT token account (created if needed)
    #[account(
        init_if_needed,
        payer = depositor,
        associated_token::mint = pt_mint,
        associated_token::authority = depositor,
    )]
    pub depositor_pt_account: Box<Account<'info, anchor_spl::token::TokenAccount>>,

    /// Depositor's YT token account (created if needed)
    #[account(
        init_if_needed,
        payer = depositor,
        associated_token::mint = yt_mint,
        associated_token::authority = depositor,
    )]
    pub depositor_yt_account: Box<Account<'info, anchor_spl::token::TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Deposit>, amount_raw: u64) -> Result<()> {
    require!(amount_raw > 0, StockSplitError::ZeroAmount);

    let clock = Clock::get()?;

    // Vault must not be past maturity for deposits
    require!(
        clock.unix_timestamp < ctx.accounts.vault.maturity_timestamp,
        StockSplitError::AlreadyMatured
    );

    // ── Validate protocol_fee_account ─────────────────────────────────────────
    // Parse as a Token-2022 account to check owner and mint.
    {
        let fee_acct_info = ctx.accounts.protocol_fee_account.to_account_info();
        let fee_acct_data = fee_acct_info.try_borrow_data()?;

        // spl_token_2022 BaseStateWithExtensions unpacking — the first 165 bytes
        // of a Token-2022 account mirror the classic SPL layout: mint(32) then owner(32)
        // starting at byte 0.  We only need mint and owner so we read them directly.
        require!(
            fee_acct_data.len() >= 165,
            StockSplitError::InvalidFeeAccount
        );

        // Bytes [0..32]   = mint pubkey
        // Bytes [32..64]  = owner pubkey
        let fee_mint = Pubkey::try_from(&fee_acct_data[0..32])
            .map_err(|_| StockSplitError::InvalidFeeAccount)?;
        let fee_owner = Pubkey::try_from(&fee_acct_data[32..64])
            .map_err(|_| StockSplitError::InvalidFeeAccount)?;

        require!(
            fee_mint == ctx.accounts.vault.xstock_mint,
            StockSplitError::InvalidFeeAccount
        );
        require!(
            fee_owner == ctx.accounts.vault.authority,
            StockSplitError::InvalidFeeAccount
        );
    }

    // ── Fee calculation ────────────────────────────────────────────────────────
    // fee_raw = amount_raw × 10 / 10_000  (10 bps = 0.10%)
    let fee_raw = amount_raw
        .checked_mul(10)
        .ok_or(StockSplitError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(StockSplitError::MathOverflow)?;

    require!(fee_raw < amount_raw, StockSplitError::FeeTooLarge);

    let effective_amount = amount_raw
        .checked_sub(fee_raw)
        .ok_or(StockSplitError::MathOverflow)?;

    // Extract vault AccountInfo BEFORE taking mutable borrow (borrow checker requirement)
    let vault_account_info = ctx.accounts.vault.to_account_info();

    // ── Step 1: Transfer fee_raw SPYx → protocol_fee_account ─────────────────
    if fee_raw > 0 {
        let fee_transfer_ix = spl_token_2022::instruction::transfer_checked(
            &spl_token_2022::id(),
            ctx.accounts.depositor_xstock_account.key,
            ctx.accounts.xstock_mint.key,
            ctx.accounts.protocol_fee_account.key,
            ctx.accounts.depositor.key,
            &[],
            fee_raw,
            6, // SPYx decimals
        )?;

        anchor_lang::solana_program::program::invoke(
            &fee_transfer_ix,
            &[
                ctx.accounts.depositor_xstock_account.to_account_info(),
                ctx.accounts.xstock_mint.to_account_info(),
                ctx.accounts.protocol_fee_account.to_account_info(),
                ctx.accounts.depositor.to_account_info(),
                ctx.accounts.token_2022_program.to_account_info(),
            ],
        )?;
    }

    // ── Step 2: Transfer effective_amount SPYx → vault ───────────────────────
    let transfer_ix = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::id(),
        ctx.accounts.depositor_xstock_account.key,
        ctx.accounts.xstock_mint.key,
        ctx.accounts.vault_xstock_account.key,
        ctx.accounts.depositor.key,
        &[],
        effective_amount,
        6, // SPYx decimals
    )?;

    anchor_lang::solana_program::program::invoke(
        &transfer_ix,
        &[
            ctx.accounts.depositor_xstock_account.to_account_info(),
            ctx.accounts.xstock_mint.to_account_info(),
            ctx.accounts.vault_xstock_account.to_account_info(),
            ctx.accounts.depositor.to_account_info(),
            ctx.accounts.token_2022_program.to_account_info(),
        ],
    )?;

    // Build vault signer seeds for CPI mint
    let vault = &mut ctx.accounts.vault;
    let xstock_mint_key = vault.xstock_mint;
    let maturity_bytes = vault.maturity_timestamp.to_le_bytes();
    let bump_bytes = [vault.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"vault",
        xstock_mint_key.as_ref(),
        &maturity_bytes,
        &bump_bytes,
    ]];

    // ── Step 3: Mint effective_amount PT tokens to depositor ──────────────────
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.pt_mint.to_account_info(),
                to: ctx.accounts.depositor_pt_account.to_account_info(),
                authority: vault_account_info.clone(),
            },
            signer_seeds,
        ),
        effective_amount,
    )?;

    // ── Step 4: Mint effective_amount YT tokens to depositor ──────────────────
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.yt_mint.to_account_info(),
                to: ctx.accounts.depositor_yt_account.to_account_info(),
                authority: vault_account_info,
            },
            signer_seeds,
        ),
        effective_amount,
    )?;

    // ── Step 5: Update vault accounting with effective_amount ─────────────────
    vault.total_deposited_raw = vault
        .total_deposited_raw
        .checked_add(effective_amount)
        .ok_or(StockSplitError::MathOverflow)?;
    vault.total_pt_outstanding = vault
        .total_pt_outstanding
        .checked_add(effective_amount)
        .ok_or(StockSplitError::MathOverflow)?;
    vault.total_yt_outstanding = vault
        .total_yt_outstanding
        .checked_add(effective_amount)
        .ok_or(StockSplitError::MathOverflow)?;

    msg!(
        "Deposit: {} raw xStock in, fee_raw={}, effective_amount={}, PT minted={}, YT minted={}",
        amount_raw,
        fee_raw,
        effective_amount,
        effective_amount,
        effective_amount,
    );

    Ok(())
}
