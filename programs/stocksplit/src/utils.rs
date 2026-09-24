use anchor_lang::prelude::*;

/// Seeds for the vault PDA: ["vault", xstock_mint, maturity_as_le_bytes]
pub fn vault_seeds(xstock_mint: &Pubkey, maturity_timestamp: i64) -> [Vec<u8>; 3] {
    [
        b"vault".to_vec(),
        xstock_mint.to_bytes().to_vec(),
        maturity_timestamp.to_le_bytes().to_vec(),
    ]
}
