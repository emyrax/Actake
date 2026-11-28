use anchor_lang::prelude::*;

#[event]
pub struct PoolCreatedEvent {
    pub pool: Pubkey,
    pub creator: Pubkey,
    pub pool_id: u64,
    pub category: u8,
    pub visibility: u8,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub treasury: Pubkey,
    pub stake_amount: u64,
    pub target_metric: u64,
    pub duration_days: u16,
    pub start_timestamp: i64,
    pub skr_multiplier_bps: u16,
}

#[event]
pub struct UserStakedEvent {
    pub pool: Pubkey,
    pub participant: Pubkey,
    pub user: Pubkey,
    pub mint: Pubkey,
    pub stake_amount: u64,
    pub total_participants: u32,
    pub active_participants: u32,
    pub session_delegate: Pubkey,
}

#[event]
pub struct DailyCheckinVerifiedEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub signer: Pubkey,
    pub day_index: u16,
    pub metric_achieved: u64,
    pub target_metric: u64,
    pub days_completed: u16,
    pub proof_hash: [u8; 32],
    pub verified_at: i64,
}

#[event]
pub struct DailyChallengeClaimedEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub mint: Pubkey,
    pub day_index: u16,
    pub principal_payout: u64,
    pub bonus_payout: u64,
    pub total_payout: u64,
    pub claimed_at: i64,
}

#[event]
pub struct SoloChallengeDaySlashedEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub treasury: Pubkey,
    pub day_index: u16,
    pub treasury_slashed: u64,
    pub owner_refunded: u64,
    pub slashed_at: i64,
}

#[event]
pub struct ParticipantSlashedEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub crank_caller: Pubkey,
    pub missed_day_index: u16,
    pub slashed_amount: u64,
    pub active_participants: u32,
    pub forfeited_vault_balance: u64,
    pub slashed_at: i64,
}

#[event]
pub struct RewardClaimedEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub mint: Pubkey,
    pub principal: u64,
    pub bonus_share: u64,
    pub skr_multiplier_bps: u16,
    pub total_payout: u64,
    pub claimed_at: i64,
}
