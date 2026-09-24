use anchor_lang::prelude::*;

use crate::{errors::StockSplitError, state::Vault};

/// update_multiplier() is called by the vault authority to update the
/// current ScaledUiAmount multiplier stored in the vault.
///
/// In production, this would be replaced by direct on-chain reading of the
/// SPYx mint's ScaledUiAmount TLV extension. For the hackathon demo, we use
/// an authorized oracle instruction to avoid spl-token-2022 version conflicts.
///
/// The multiplier is passed as f64 bits (u64) to avoid float in instruction data.
#[derive(Accounts)]
pub struct UpdateMultiplier<'info> {
    /// Only the vault authority can update the multiplier
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"vault",
            vault.xstock_mint.as_ref(),
            &vault.maturity_timestamp.to_le_bytes(),
        ],
        bump = vault.bump,
        constraint = vault.authority == authority.key() @ StockSplitError::Unauthorized,
        constraint = !vault.settled @ StockSplitError::AlreadySettled,
    )]
    pub vault: Box<Account<'info, Vault>>,
}

pub fn handler(ctx: Context<UpdateMultiplier>, new_multiplier_bits: u64) -> Result<()> {
    let new_multiplier = f64::from_bits(new_multiplier_bits);

    require!(
        new_multiplier.is_finite() && new_multiplier > 0.0,
        StockSplitError::MissingScaledUiAmountExtension
    );

    let old_multiplier = ctx.accounts.vault.current_multiplier();

    ctx.accounts.vault.current_multiplier_bits = new_multiplier_bits;

    msg!(
        "Multiplier updated: {} -> {}",
        old_multiplier,
        new_multiplier
    );

    Ok(())
}
