use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    associated_token::AssociatedToken,
    token::Token,
};

use crate::{errors::StockSplitError, state::Vault};

#[derive(Accounts)]
#[instruction(maturity_timestamp: i64, initial_multiplier_bits: u64)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The xStock Token-2022 mint (e.g. SPYx).
    /// CHECK: We don't validate extensions here — multiplier is managed via update_multiplier().
    pub xstock_mint: UncheckedAccount<'info>,

    /// USDC mint (standard SPL token)
    pub usdc_mint: Box<Account<'info, anchor_spl::token::Mint>>,

    /// The vault PDA. Seeds: ["vault", xstock_mint, maturity_timestamp_le_bytes]
    #[account(
        init,
        payer = authority,
        space = Vault::LEN,
        seeds = [
            b"vault",
            xstock_mint.key().as_ref(),
            &maturity_timestamp.to_le_bytes(),
        ],
        bump,
    )]
    pub vault: Box<Account<'info, Vault>>,

    /// PT mint — created here, authority = vault PDA
    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = vault,
        seeds = [b"pt_mint", vault.key().as_ref()],
        bump,
    )]
    pub pt_mint: Box<Account<'info, anchor_spl::token::Mint>>,

    /// YT mint — created here, authority = vault PDA
    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = vault,
        seeds = [b"yt_mint", vault.key().as_ref()],
        bump,
    )]
    pub yt_mint: Box<Account<'info, anchor_spl::token::Mint>>,

    /// Vault's xStock token account (Token-2022)
    /// CHECK: Created via CPI in handler
    #[account(mut)]
    pub vault_xstock_account: UncheckedAccount<'info>,

    /// Vault's USDC token account (standard SPL)
    #[account(
        init,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub vault_usdc_account: Box<Account<'info, anchor_spl::token::TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeVault>,
    maturity_timestamp: i64,
    initial_multiplier_bits: u64,
) -> Result<()> {
    let clock = Clock::get()?;

    // Maturity must be in the future
    require!(
        maturity_timestamp > clock.unix_timestamp,
        StockSplitError::InvalidMaturity
    );

    // Validate initial multiplier is a valid positive finite f64
    let initial_multiplier = f64::from_bits(initial_multiplier_bits);
    require!(
        initial_multiplier.is_finite() && initial_multiplier > 0.0,
        StockSplitError::MissingScaledUiAmountExtension
    );

    // Create vault's xStock ATA via Token-2022 CPI
    anchor_spl::associated_token::create(CpiContext::new(
        ctx.accounts.associated_token_program.to_account_info(),
        anchor_spl::associated_token::Create {
            payer: ctx.accounts.authority.to_account_info(),
            associated_token: ctx.accounts.vault_xstock_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.xstock_mint.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_2022_program.to_account_info(),
        },
    ))?;

    let vault = &mut ctx.accounts.vault;
    vault.bump = ctx.bumps.vault;
    vault.xstock_mint = ctx.accounts.xstock_mint.key();
    vault.pt_mint = ctx.accounts.pt_mint.key();
    vault.yt_mint = ctx.accounts.yt_mint.key();
    vault.vault_xstock_account = ctx.accounts.vault_xstock_account.key();
    vault.vault_usdc_account = ctx.accounts.vault_usdc_account.key();
    vault.usdc_mint = ctx.accounts.usdc_mint.key();
    vault.maturity_timestamp = maturity_timestamp;
    vault.multiplier_at_deposit_bits = initial_multiplier_bits;
    vault.current_multiplier_bits = initial_multiplier_bits;
    vault.total_deposited_raw = 0;
    vault.total_pt_outstanding = 0;
    vault.total_yt_outstanding = 0;
    vault.usdc_per_yt_bits = 0.0f64.to_bits();
    vault.settled = false;
    vault.authority = ctx.accounts.authority.key();

    msg!(
        "Vault initialized: xstock={} maturity={} multiplier={}",
        vault.xstock_mint,
        maturity_timestamp,
        initial_multiplier
    );

    Ok(())
}
