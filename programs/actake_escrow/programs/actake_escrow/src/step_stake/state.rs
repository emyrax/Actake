use anchor_lang::prelude::*;

/// Category identifiers for Modular Accountability Pools.
/// 0 = Physical Steps, 1 = Gym Attendance, 2 = Study Focus.
pub const CATEGORY_STEPS: u8 = 0;
pub const CATEGORY_GYM: u8 = 1;
pub const CATEGORY_STUDY: u8 = 2;

/// Visibility identifiers for Track Pools.
/// 0 = Solo (private, creator-only), 1 = Public Community (open join, Explore listed).
pub const VISIBILITY_SOLO: u8 = 0;
pub const VISIBILITY_PUBLIC: u8 = 1;

/// Maximum recurring challenge duration (365 days; fits in [u64; 6] = 384 bits).
pub const MAX_DURATION_DAYS: u16 = 365;

/// Seconds per challenge day (24h).
pub const SECONDS_PER_DAY: i64 = 86_400;

/// Basis points denominator (10_000 = 1.0x).
pub const BPS_DENOMINATOR: u128 = 10_000;

#[account]
#[derive(InitSpace)]
pub struct ChallengePool {
    pub creator: Pubkey,
    pub pool_id: u64,
    /// 0 = Steps, 1 = Gym, 2 = Study
    pub category: u8,
    /// 0 = Solo (private creator-only), 1 = Public Community
    pub visibility: u8,
    /// USDC (SPL Token) or SKR (Token-2022) mint
    pub mint: Pubkey,
    /// Escrow Token Account PDA owned by this ChallengePool PDA
    pub vault: Pubkey,
    /// Actake Fee Treasury wallet receiving solo missed-day slashes
    pub treasury: Pubkey,
    /// Required token stake per participant (base units)
    pub stake_amount: u64,
    /// Daily target metric (e.g., 8000 steps, 45 gym mins, 120 study mins)
    pub target_metric: u64,
    /// Total duration in days (1..=365)
    pub duration_days: u16,
    /// Pool start unix timestamp (UTC seconds)
    pub start_timestamp: i64,
    /// Total users who joined and staked
    pub total_participants: u32,
    /// Currently surviving (non-eliminated) participants
    pub active_participants: u32,
    /// Accumulated forfeited tokens from slashed quitters in Public pools
    pub forfeited_vault_balance: u64,
    /// SKR reward weighting in basis points (10000 = 1.0x, 12000 = 1.2x)
    pub skr_multiplier_bps: u16,
    /// PDA bump for ChallengePool
    pub bump: u8,
    /// PDA bump for Vault Token Account
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ParticipantState {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub days_completed: u16,
    pub last_checkin_day: u16,
    pub is_eliminated: bool,
    pub has_claimed: bool,
    /// 384-bit bitmap covering 1-based days 1..=365 for verified check-ins
    pub checkin_bitmap: [u64; 6],
    /// 384-bit bitmap covering 1-based days 1..=365 for claimed daily principal payouts
    pub claimed_bitmap: [u64; 6],
    /// 384-bit bitmap covering 1-based days 1..=365 for slashed missed days
    pub slashed_bitmap: [u64; 6],
    /// Total principal already returned via daily claims
    pub claimed_principal: u64,
    /// Total principal already slashed (to treasury for Solo or forfeited pot for Public)
    pub slashed_total: u64,
    /// SHA-256 hash of canonical sensor / GPS / study focus proof payload (visible on Solscan)
    pub latest_proof_hash: [u8; 32],
    /// Optional scoped ephemeral session delegate authorized strictly for daily check-ins
    /// (Pubkey::default() when manual MWA signing mode is active; NEVER permitted to withdraw funds)
    pub session_delegate: Pubkey,
    pub bump: u8,
}
