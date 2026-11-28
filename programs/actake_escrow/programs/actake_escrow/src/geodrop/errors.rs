use anchor_lang::prelude::*;

#[error_code]
pub enum GeoDropError {
    #[msg("Reward per chest must be greater than zero.")]
    InvalidRewardAmount,
    #[msg("Total chests must be between 1 and 10000.")]
    InvalidChestCount,
    #[msg("Hunt expiry timestamp must be in the future.")]
    InvalidExpiryTimestamp,
    #[msg("This GeoDrop hunt has expired.")]
    HuntExpired,
    #[msg("This GeoDrop hunt has not expired yet; unclaimed funds cannot be reclaimed early.")]
    HuntNotExpired,
    #[msg("All chests in this GeoDrop hunt have already been claimed.")]
    NoChestsRemaining,
    #[msg("Hunt vault asset type does not match this instruction (SOL vs SPL/Token-2022).")]
    AssetTypeMismatch,
    #[msg("GPS oracle attestation has expired. Re-verify your live location and retry.")]
    AttestationExpired,
    #[msg("Only the hunt creator can reclaim unclaimed funds after expiry.")]
    UnauthorizedCreator,
    #[msg("Vault has insufficient balance to pay out or reclaim.")]
    InsufficientVaultBalance,
    #[msg("Arithmetic overflow occurred.")]
    MathOverflow,
}
