use anchor_lang::prelude::*;

#[error_code]
pub enum StockSplitError {
    #[msg("Vault has already been settled")]
    AlreadySettled,

    #[msg("Vault is past maturity — deposits are no longer accepted")]
    AlreadyMatured,

    #[msg("Vault has not been settled yet — call settle() first")]
    NotSettled,

    #[msg("Maturity timestamp has not been reached yet")]
    NotMatured,

    #[msg("Maturity timestamp is in the past — must be a future timestamp")]
    InvalidMaturity,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Insufficient PT balance to redeem")]
    InsufficientPtBalance,

    #[msg("Insufficient YT balance to claim")]
    InsufficientYtBalance,

    #[msg("Insufficient xStock in vault for this redemption")]
    InsufficientVaultBalance,

    #[msg("The provided mint is not a Token-2022 mint with ScaledUiAmount extension")]
    MissingScaledUiAmountExtension,

    #[msg("Settlement produced zero excess — no dividends have accrued")]
    ZeroExcess,

    #[msg("Arithmetic overflow in settlement calculation")]
    MathOverflow,

    #[msg("USDC per YT is zero — vault was settled with no USDC proceeds")]
    ZeroUsdcPerYt,

    #[msg("Signer is not the vault authority")]
    Unauthorized,

    #[msg("Cannot withdraw after vault has been settled")]
    WithdrawAfterSettlement,

    #[msg("Fee amount equals or exceeds deposit amount — fee rate too large")]
    FeeTooLarge,

    #[msg("Protocol fee account has invalid owner or mint mismatch")]
    InvalidFeeAccount,
}
