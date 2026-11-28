use anchor_lang::prelude::*;

/// Expected binary message layout signed by the Actake GeoDrops Ed25519 GPS Oracle:
/// hunt_pda (32 bytes) || hunter_pubkey (32 bytes) || reward_per_chest (u64 LE, 8 bytes) || attestation_expires_at (i64 LE, 8 bytes)
pub const EXPECTED_GEODROP_ORACLE_MSG_LEN: usize = 32 + 32 + 8 + 8;

#[account]
#[derive(InitSpace)]
pub struct GeoDropHunt {
    pub creator: Pubkey,
    pub hunt_id: u64,
    pub oracle_pubkey: [u8; 32],
    /// SPL / Token-2022 mint address, or Pubkey::default() for Native SOL hunts
    pub mint: Pubkey,
    /// PDA vault holding SPL/Token-2022 tokens or Native SOL lamports
    pub vault: Pubkey,
    pub is_native_sol: bool,
    pub reward_per_chest: u64,
    pub total_chests: u16,
    pub claims_remaining: u16,
    pub expires_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct GeoDropClaimReceipt {
    pub hunt: Pubkey,
    pub hunter: Pubkey,
    pub reward_claimed: u64,
    pub claimed_at: i64,
    pub bump: u8,
}
