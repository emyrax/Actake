use anchor_lang::prelude::*;

#[error_code]
pub enum StepStakeError {
    #[msg("Category must be 0 (Steps), 1 (Gym), or 2 (Study).")]
    InvalidCategory,
    #[msg("Visibility must be 0 (Solo) or 1 (Public Community).")]
    InvalidVisibility,
    #[msg("Treasury public key must be a valid non-default Solana address.")]
    InvalidTreasury,
    #[msg("Only the creator may join or stake into a private Solo pool.")]
    SoloPoolCreatorOnly,
    #[msg("This instruction is only valid for private Solo pools.")]
    SoloPoolOnly,
    #[msg("This instruction is only valid for Public Community pools.")]
    PublicPoolOnly,
    #[msg("Stake amount must be greater than zero.")]
    InvalidStakeAmount,
    #[msg("Target metric must be greater than zero.")]
    InvalidTargetMetric,
    #[msg("Pool duration must be between 1 and 365 days.")]
    InvalidDuration,
    #[msg("SKR multiplier must be between 10000 bps (1.0x) and 25000 bps (2.5x).")]
    InvalidMultiplierBps,
    #[msg("Pool has already concluded; new participants cannot join.")]
    PoolEnded,
    #[msg("Participant has already been eliminated from this pool.")]
    ParticipantEliminated,
    #[msg("Day index must be between 1 and duration_days.")]
    InvalidDayIndex,
    #[msg("Check-in has already been verified for this day_index.")]
    DayAlreadyCheckedIn,
    #[msg("Day has not been verified yet and cannot be claimed.")]
    DayNotVerified,
    #[msg("Daily payout for this day_index has already been claimed.")]
    DayAlreadyClaimed,
    #[msg("Day has already been slashed.")]
    DayAlreadySlashed,
    #[msg("Current clock timestamp is outside the allowed window for this day_index.")]
    OutsideDayWindow,
    #[msg("Achieved metric is below the required pool target_metric.")]
    TargetMetricNotMet,
    #[msg("Proof hash must be a non-zero 32-byte SHA-256 digest.")]
    EmptyProofHash,
    #[msg("Signer is neither the participant wallet nor their authorized scoped session delegate.")]
    UnauthorizedCheckinSigner,
    #[msg("Deadline for this day_index has not yet passed; participant cannot be slashed early.")]
    DeadlineNotPassed,
    #[msg("Participant already completed check-in for this day_index and cannot be slashed.")]
    ParticipantAlreadyCheckedIn,
    #[msg("Pool duration has not yet completed; final bonus settlement is locked until end_timestamp.")]
    PoolNotCompleted,
    #[msg("Participant has already claimed final settlement from this pool.")]
    AlreadyClaimed,
    #[msg("Participant has no unclaimed verified days or rewards available.")]
    NothingToClaim,
    #[msg("Vault has insufficient balance for settlement.")]
    InsufficientVaultBalance,
    #[msg("Arithmetic overflow or division error.")]
    MathOverflow,
}
