use anchor_lang::prelude::*;

#[account]
pub struct Vault {
    /// Bump for this vault PDA
    pub bump: u8,

    /// The xStock token mint (e.g. SPYx). Must be Token-2022 with ScaledUiAmount.
    pub xstock_mint: Pubkey,

    /// The PT (Principal Token) mint — standard SPL mint, authority = vault PDA
    pub pt_mint: Pubkey,

    /// The YT (Yield Token) mint — standard SPL mint, authority = vault PDA
    pub yt_mint: Pubkey,

    /// Vault's xStock token account
    pub vault_xstock_account: Pubkey,

    /// Vault's USDC token account (receives proceeds from Jupiter swap at settlement)
    pub vault_usdc_account: Pubkey,

    /// USDC mint (for settlement)
    pub usdc_mint: Pubkey,

    /// Unix timestamp after which settle/redeem/claim can be called
    pub maturity_timestamp: i64,

    /// ScaledUiAmount multiplier snapshotted at first deposit.
    /// Stored as f64 bits (u64) to avoid floating-point in account struct.
    /// Read with: f64::from_bits(multiplier_at_deposit)
    pub multiplier_at_deposit_bits: u64,

    /// Total raw xStock deposited into this vault (across all depositors)
    pub total_deposited_raw: u64,

    /// Total PT tokens outstanding (equals total_deposited_raw until redemptions)
    pub total_pt_outstanding: u64,

    /// Total YT tokens outstanding (equals total_deposited_raw until claims)
    pub total_yt_outstanding: u64,

    /// USDC per raw YT unit, set at settlement. Stored as f64 bits.
    /// Read with: f64::from_bits(usdc_per_yt_bits)
    pub usdc_per_yt_bits: u64,

    /// Current ScaledUiAmount multiplier, updated by update_multiplier() instruction.
    /// In production this would be read directly from SPYx TLV data;
    /// for the hackathon this is authority-controlled to avoid spl-token-2022 version conflicts.
    pub current_multiplier_bits: u64,

    /// Whether settle() has been called
    pub settled: bool,

    /// Creator / admin of this vault
    pub authority: Pubkey,
}

impl Vault {
    /// Account discriminator (8) + all fields
    pub const LEN: usize = 8   // discriminator
        + 1   // bump
        + 32  // xstock_mint
        + 32  // pt_mint
        + 32  // yt_mint
        + 32  // vault_xstock_account
        + 32  // vault_usdc_account
        + 32  // usdc_mint
        + 8   // maturity_timestamp
        + 8   // multiplier_at_deposit_bits
        + 8   // total_deposited_raw
        + 8   // total_pt_outstanding
        + 8   // total_yt_outstanding
        + 8   // usdc_per_yt_bits
        + 8   // current_multiplier_bits
        + 1   // settled
        + 32  // authority
        + 56; // padding for future fields

    pub fn multiplier_at_deposit(&self) -> f64 {
        f64::from_bits(self.multiplier_at_deposit_bits)
    }

    pub fn current_multiplier(&self) -> f64 {
        f64::from_bits(self.current_multiplier_bits)
    }

    pub fn usdc_per_yt(&self) -> f64 {
        f64::from_bits(self.usdc_per_yt_bits)
    }

    /// Compute the raw xStock amount that represents the same ui_amount
    /// as `raw_pt_amount` did at deposit time, using current multiplier.
    ///
    /// pt_redeem_raw = pt_amount × (multiplier_at_deposit / current_multiplier)
    ///
    /// This gives PT holders back the exact same "ui_amount" of xStock they put in
    /// (no dividend excess included).
    pub fn pt_to_xstock_raw(&self, pt_amount_raw: u64, current_multiplier: f64) -> Result<u64> {
        let m0 = self.multiplier_at_deposit();
        let ratio = m0 / current_multiplier;
        let result = (pt_amount_raw as f64) * ratio;
        Ok(result.floor() as u64)
    }

    /// Compute excess raw xStock = vault balance - what all PT holders are owed.
    /// This represents the dividend accumulation.
    ///
    /// excess = total_deposited_raw × (1 - m0/m1)
    ///        = total_deposited_raw × (m1 - m0) / m1
    pub fn excess_raw_xstock(&self, current_multiplier: f64) -> u64 {
        let m0 = self.multiplier_at_deposit();
        if current_multiplier <= m0 {
            return 0; // no dividend accrued (or multiplier decreased — edge case)
        }
        let ratio = m0 / current_multiplier;
        let pt_claim = (self.total_deposited_raw as f64) * ratio;
        let excess = (self.total_deposited_raw as f64) - pt_claim;
        excess.floor() as u64
    }
}
