use anchor_lang::prelude::*;

#[event]
pub struct GeoDropHuntCreated {
    pub hunt: Pubkey,
    pub creator: Pubkey,
    pub hunt_id: u64,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub is_native_sol: bool,
    pub reward_per_chest: u64,
    pub total_chests: u16,
    pub total_funded: u64,
    pub expires_at: i64,
}

#[event]
pub struct GeoDropClaimed {
    pub hunt: Pubkey,
    pub hunter: Pubkey,
    pub receipt: Pubkey,
    pub is_native_sol: bool,
    pub reward_amount: u64,
    pub claims_remaining: u16,
    pub claimed_at: i64,
}

#[event]
pub struct GeoDropReclaimed {
    pub hunt: Pubkey,
    pub creator: Pubkey,
    pub is_native_sol: bool,
    pub reclaimed_amount: u64,
    pub reclaimed_at: i64,
}
