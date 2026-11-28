use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as SYSVAR_INSTRUCTIONS_ID,
};
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

pub mod geodrop;
pub mod step_stake;
pub use geodrop::*;
pub use step_stake::*;

// Replace with your deployed Devnet/Mainnet Program ID from `anchor keys list`
declare_id!("ACTKescrow111111111111111111111111111111111");

/// Expected binary message layout signed by the Actake Ed25519 Oracle for Habit Stake:
/// pool_pda (32 bytes) || user_pubkey (32 bytes) || day_index (u16 LE, 1-based, 2 bytes) || proof_hash (32 bytes)
pub const EXPECTED_ORACLE_MSG_LEN: usize = 32 + 32 + 2 + 32;

/// Maximum recurring days supported across Habit Stake & Track Pools (fits in [u64; 6] = 384 bits).
pub const MAX_HABIT_DURATION_DAYS: u16 = 365;

/// Shared 1-based day bitmap query (`day_index` in `1..=365`).
pub(crate) fn is_day_bit_set(bitmap: &[u64; 6], day_index_1based: u16) -> Result<bool> {
    require!(
        day_index_1based >= 1 && day_index_1based <= MAX_HABIT_DURATION_DAYS,
        ActakeError::InvalidDayIndex
    );
    let zero_idx = (day_index_1based - 1) as usize;
    let word = zero_idx / 64;
    let bit = (zero_idx % 64) as u32;
    Ok((bitmap[word] & (1u64 << bit)) != 0)
}

/// Shared 1-based day bitmap setter (`day_index` in `1..=365`).
pub(crate) fn set_day_bit(bitmap: &mut [u64; 6], day_index_1based: u16) -> Result<()> {
    require!(
        day_index_1based >= 1 && day_index_1based <= MAX_HABIT_DURATION_DAYS,
        ActakeError::InvalidDayIndex
    );
    let zero_idx = (day_index_1based - 1) as usize;
    let word = zero_idx / 64;
    let bit = (zero_idx % 64) as u32;
    bitmap[word] |= 1u64 << bit;
    Ok(())
}

/// Computes exact per-day principal split across `total_days` (`1..=365`),
/// reconciling integer division remainder onto the final day (`day_index == total_days`)
/// so the sum across Day 1..=N equals `stake_amount` to the exact base unit.
pub(crate) fn compute_day_principal_share(
    stake_amount: u64,
    total_days: u16,
    day_index_1based: u16,
) -> Result<u64> {
    require!(
        total_days >= 1 && total_days <= MAX_HABIT_DURATION_DAYS,
        ActakeError::InvalidDuration
    );
    require!(
        day_index_1based >= 1 && day_index_1based <= total_days,
        ActakeError::InvalidDayIndex
    );
    let td = total_days as u64;
    let base = stake_amount / td;
    if day_index_1based == total_days {
        let prior_total = base
            .checked_mul(td.saturating_sub(1))
            .ok_or(ActakeError::MathOverflow)?;
        stake_amount
            .checked_sub(prior_total)
            .ok_or_else(|| error!(ActakeError::MathOverflow))
    } else {
        Ok(base)
    }
}

/// Computes the Solo missed-day slash split `(treasury_amount, owner_refund_amount)`:
/// - If `total_days == 1` ("Once"): 50% goes to Actake Fee Treasury, 50% returns to the owner.
/// - If `total_days > 1` (Multi-day recurring): ONLY that day's claimable daily ratio
///   goes to Treasury, keeping all other days' principal safe in the vault.
pub(crate) fn compute_solo_slash_split(
    stake_amount: u64,
    total_days: u16,
    day_index_1based: u16,
) -> Result<(u64, u64)> {
    if total_days == 1 {
        let treasury_amount = stake_amount / 2;
        let owner_refund_amount = stake_amount.saturating_sub(treasury_amount);
        Ok((treasury_amount, owner_refund_amount))
    } else {
        let day_ratio = compute_day_principal_share(stake_amount, total_days, day_index_1based)?;
        Ok((day_ratio, 0))
    }
}

#[program]
pub mod actake_escrow {
    use super::*;

    // =========================================================================
    // MODULE 1: HABIT STAKE (Solo Private + Public Community)
    // Supports SPL Token (USDC) and Token-2022 (SKR), 1..=365 days, daily split
    // claims, and Once-50%/Multi-day-daily-ratio Solo missed-day slashes.
    // =========================================================================

    /// Initializes a new Actake habit accountability pool and its PDA token vault.
    /// `pool_type`: 0 = Solo (private, creator-only), 1 = Public Community Pool.
    pub fn create_pool(
        ctx: Context<CreatePool>,
        pool_id: [u8; 16],
        pool_type: u8,
        stake_amount: u64,
        oracle_pubkey: [u8; 32],
        treasury: Pubkey,
        total_days: u16,
        deadline_unix_ts: i64,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        require!(stake_amount > 0, ActakeError::InvalidStakeAmount);
        require!(
            total_days >= 1 && total_days <= MAX_HABIT_DURATION_DAYS,
            ActakeError::InvalidDuration
        );
        require!(protocol_fee_bps <= 500, ActakeError::FeeTooHigh);
        require!(pool_type <= 2, ActakeError::InvalidPoolType);
        require!(treasury != Pubkey::default(), ActakeError::InvalidTreasury);

        let pool = &mut ctx.accounts.pool;
        pool.pool_id = pool_id;
        pool.pool_type = pool_type;
        pool.creator = ctx.accounts.creator.key();
        pool.mint = ctx.accounts.mint.key();
        pool.vault = ctx.accounts.vault.key();
        pool.treasury = treasury;
        pool.oracle_pubkey = oracle_pubkey;
        pool.stake_amount = stake_amount;
        pool.total_days = total_days;
        pool.deadline_unix_ts = deadline_unix_ts;
        pool.protocol_fee_bps = protocol_fee_bps;
        pool.total_staked = 0;
        pool.participant_count = 0;
        pool.verified_participant_count = 0;
        pool.slashed_pot = 0;
        pool.settled = false;
        pool.treasury_swept = false;
        pool.bump = ctx.bumps.pool;
        pool.vault_bump = ctx.bumps.vault;

        emit!(PoolCreated {
            pool: pool.key(),
            creator: pool.creator,
            mint: pool.mint,
            treasury: pool.treasury,
            pool_type,
            stake_amount,
            total_days,
            oracle_pubkey,
            protocol_fee_bps,
        });

        Ok(())
    }

    /// Locks the user's SPL / Token-2022 stake into the trustless Pool Vault PDA
    /// and initializes their Participant PDA account.
    /// Enforces creator-only access when `pool.pool_type == 0` (Solo).
    pub fn join_pool(ctx: Context<JoinPool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(!pool.settled, ActakeError::PoolAlreadySettled);

        if pool.pool_type == 0 {
            require_keys_eq!(
                ctx.accounts.user.key(),
                pool.creator,
                ActakeError::SoloPoolCreatorOnly
            );
        }

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.user_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token_interface::transfer_checked(cpi_ctx, pool.stake_amount, ctx.accounts.mint.decimals)?;

        let participant = &mut ctx.accounts.participant;
        participant.pool = pool.key();
        participant.user = ctx.accounts.user.key();
        participant.staked_amount = pool.stake_amount;
        participant.checkin_bitmap = [0u64; 6];
        participant.claimed_bitmap = [0u64; 6];
        participant.slashed_bitmap = [0u64; 6];
        participant.claimed_principal = 0;
        participant.slashed_total = 0;
        participant.checkins_completed = 0;
        participant.verified_for_payout = false;
        participant.has_claimed = false;
        participant.bump = ctx.bumps.participant;

        pool.total_staked = pool
            .total_staked
            .checked_add(pool.stake_amount)
            .ok_or(ActakeError::MathOverflow)?;
        pool.participant_count = pool
            .participant_count
            .checked_add(1)
            .ok_or(ActakeError::MathOverflow)?;

        emit!(ParticipantJoined {
            pool: pool.key(),
            user: participant.user,
            amount: pool.stake_amount,
        });

        Ok(())
    }

    /// Verifies a stateless Ed25519 Oracle attestation via native Solana instruction
    /// introspection (`sysvar::instructions`), ensuring the immediately preceding instruction
    /// is an `Ed25519Program` verification signed by `pool.oracle_pubkey` over 98 bytes:
    /// `pool_pda[32] || user_pubkey[32] || day_index(u16 LE, 1-based)[2] || proof_hash[32]`.
    pub fn submit_checkin(
        ctx: Context<SubmitCheckin>,
        day_index: u16,
        proof_hash: [u8; 32],
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let participant = &mut ctx.accounts.participant;

        require!(!pool.settled, ActakeError::PoolAlreadySettled);
        require!(
            day_index >= 1 && day_index <= pool.total_days,
            ActakeError::InvalidDayIndex
        );
        require!(
            !is_day_bit_set(&participant.checkin_bitmap, day_index)?,
            ActakeError::DayAlreadyVerified
        );
        require!(
            !is_day_bit_set(&participant.slashed_bitmap, day_index)?,
            ActakeError::DayAlreadySlashed
        );

        // Introspect the preceding instruction in the same transaction
        let ixs_info = &ctx.accounts.instructions_sysvar;
        let current_idx = load_current_index_checked(ixs_info)
            .map_err(|_| ActakeError::MissingEd25519Instruction)?;
        require!(current_idx > 0, ActakeError::MissingEd25519Instruction);

        let ed25519_ix = load_instruction_at_checked((current_idx - 1) as usize, ixs_info)
            .map_err(|_| ActakeError::MissingEd25519Instruction)?;
        require_keys_eq!(
            ed25519_ix.program_id,
            ed25519_program::ID,
            ActakeError::InvalidEd25519Program
        );

        // Exact 98-byte message matching server.ts oracle signer
        let mut expected_msg = Vec::with_capacity(EXPECTED_ORACLE_MSG_LEN);
        expected_msg.extend_from_slice(pool.key().as_ref());
        expected_msg.extend_from_slice(ctx.accounts.user.key().as_ref());
        expected_msg.extend_from_slice(&day_index.to_le_bytes());
        expected_msg.extend_from_slice(&proof_hash);

        verify_ed25519_ix_data(&ed25519_ix.data, &pool.oracle_pubkey, &expected_msg)?;

        set_day_bit(&mut participant.checkin_bitmap, day_index)?;
        participant.checkins_completed = participant
            .checkins_completed
            .checked_add(1)
            .ok_or(ActakeError::MathOverflow)?;

        if !participant.verified_for_payout {
            participant.verified_for_payout = true;
            pool.verified_participant_count = pool
                .verified_participant_count
                .checked_add(1)
                .ok_or(ActakeError::MathOverflow)?;
        }

        emit!(CheckinVerified {
            pool: pool.key(),
            user: participant.user,
            day_index,
            proof_hash,
        });

        Ok(())
    }

    /// Immediately claims the split-evenly daily principal share for a verified `day_index`
    /// (`1..=pool.total_days`). Remainder units reconcile onto Day `total_days`.
    pub fn claim_daily_payout(ctx: Context<ClaimDailyPayout>, day_index: u16) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let participant = &mut ctx.accounts.participant;

        require!(
            day_index >= 1 && day_index <= pool.total_days,
            ActakeError::InvalidDayIndex
        );
        require!(
            is_day_bit_set(&participant.checkin_bitmap, day_index)?,
            ActakeError::NotVerifiedForPayout
        );
        require!(
            !is_day_bit_set(&participant.claimed_bitmap, day_index)?,
            ActakeError::DayAlreadyClaimed
        );
        require!(
            !is_day_bit_set(&participant.slashed_bitmap, day_index)?,
            ActakeError::DayAlreadySlashed
        );

        let day_principal =
            compute_day_principal_share(participant.staked_amount, pool.total_days, day_index)?;
        let vault_balance = ctx.accounts.vault.amount;
        let transfer_amount = day_principal.min(vault_balance);
        require!(transfer_amount > 0, ActakeError::EmptyVault);

        let pool_id_ref = pool.pool_id;
        let signer_seeds: &[&[&[u8]]] = &[&[b"pool", pool_id_ref.as_ref(), &[pool.bump]]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token_interface::transfer_checked(cpi_ctx, transfer_amount, ctx.accounts.mint.decimals)?;

        set_day_bit(&mut participant.claimed_bitmap, day_index)?;
        participant.claimed_principal = participant
            .claimed_principal
            .checked_add(transfer_amount)
            .ok_or(ActakeError::MathOverflow)?;

        if participant
            .claimed_principal
            .saturating_add(participant.slashed_total)
            >= participant.staked_amount
            && pool.pool_type == 0
        {
            participant.has_claimed = true;
        }

        emit!(DailyPayoutClaimed {
            pool: pool.key(),
            user: participant.user,
            day_index,
            amount: transfer_amount,
        });

        Ok(())
    }

    /// Slashes a missed day (`day_index` in `1..=pool.total_days`):
    /// - Solo (`pool_type == 0`):
    ///   * If `total_days == 1` ("Once"): 50% to Actake Fee Treasury, 50% refunded to owner.
    ///   * If `total_days > 1`: ONLY that day's daily ratio goes to Actake Fee Treasury;
    ///     remaining days' principal stays safe in escrow for future check-ins.
    /// - Public Community (`pool_type == 1`):
    ///   * Adds that missed day's ratio to `pool.slashed_pot` for verified winners to split.
    pub fn slash_missed_day(ctx: Context<SlashMissedDay>, day_index: u16) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let participant = &mut ctx.accounts.participant;

        require!(
            day_index >= 1 && day_index <= pool.total_days,
            ActakeError::InvalidDayIndex
        );
        require!(
            !is_day_bit_set(&participant.checkin_bitmap, day_index)?,
            ActakeError::DayAlreadyVerified
        );
        require!(
            !is_day_bit_set(&participant.slashed_bitmap, day_index)?,
            ActakeError::DayAlreadySlashed
        );

        let pool_id_ref = pool.pool_id;
        let signer_seeds: &[&[&[u8]]] = &[&[b"pool", pool_id_ref.as_ref(), &[pool.bump]]];

        let (treasury_transfer, owner_refund_transfer, pot_added) = if pool.pool_type == 0 {
            let (treasury_share, owner_refund) =
                compute_solo_slash_split(participant.staked_amount, pool.total_days, day_index)?;
            let vault_balance = ctx.accounts.vault.amount;
            let t_amt = treasury_share.min(vault_balance);
            let rem = vault_balance.saturating_sub(t_amt);
            let o_amt = owner_refund.min(rem);

            if t_amt > 0 {
                let cpi_accounts = TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.treasury_token_account.to_account_info(),
                    authority: pool.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signer_seeds,
                );
                token_interface::transfer_checked(cpi_ctx, t_amt, ctx.accounts.mint.decimals)?;
            }

            if o_amt > 0 {
                let refund_cpi_accounts = TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: pool.to_account_info(),
                };
                let refund_cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    refund_cpi_accounts,
                    signer_seeds,
                );
                token_interface::transfer_checked(
                    refund_cpi_ctx,
                    o_amt,
                    ctx.accounts.mint.decimals,
                )?;
            }

            if pool.total_days == 1 {
                pool.settled = true;
                participant.has_claimed = true;
            }
            (t_amt, o_amt, 0u64)
        } else {
            let day_share =
                compute_day_principal_share(participant.staked_amount, pool.total_days, day_index)?;
            pool.slashed_pot = pool
                .slashed_pot
                .checked_add(day_share)
                .ok_or(ActakeError::MathOverflow)?;
            (0u64, 0u64, day_share)
        };

        set_day_bit(&mut participant.slashed_bitmap, day_index)?;
        participant.slashed_total = participant
            .slashed_total
            .checked_add(
                treasury_transfer
                    .saturating_add(owner_refund_transfer)
                    .saturating_add(pot_added),
            )
            .ok_or(ActakeError::MathOverflow)?;

        emit!(DaySlashed {
            pool: pool.key(),
            user: participant.user,
            day_index,
            treasury_slashed: treasury_transfer,
            owner_refunded: owner_refund_transfer,
            added_to_slashed_pot: pot_added,
        });

        Ok(())
    }

    /// Final settlement for a participant: claims any remaining verified-but-unclaimed
    /// daily principal plus proportional share of `pool.slashed_pot` (minus protocol fee bps).
    pub fn settle_and_claim(ctx: Context<SettleAndClaim>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let participant = &mut ctx.accounts.participant;

        require!(!participant.has_claimed, ActakeError::AlreadyClaimed);
        require!(participant.verified_for_payout, ActakeError::NotVerifiedForPayout);

        let clock = Clock::get()?;
        if !pool.settled && clock.unix_timestamp >= pool.deadline_unix_ts {
            if pool.pool_type != 0 && pool.slashed_pot == 0 {
                let unverified_count = pool
                    .participant_count
                    .saturating_sub(pool.verified_participant_count);
                pool.slashed_pot = (unverified_count as u64)
                    .checked_mul(pool.stake_amount)
                    .ok_or(ActakeError::MathOverflow)?;
            }
            pool.settled = true;
        }

        // Sum any verified days not yet claimed via `claim_daily_payout`
        let mut remaining_verified_principal: u64 = 0;
        for d in 1..=pool.total_days {
            let checked = is_day_bit_set(&participant.checkin_bitmap, d)?;
            let claimed = is_day_bit_set(&participant.claimed_bitmap, d)?;
            let slashed = is_day_bit_set(&participant.slashed_bitmap, d)?;
            if checked && !claimed && !slashed {
                let share =
                    compute_day_principal_share(participant.staked_amount, pool.total_days, d)?;
                remaining_verified_principal = remaining_verified_principal
                    .checked_add(share)
                    .ok_or(ActakeError::MathOverflow)?;
                set_day_bit(&mut participant.claimed_bitmap, d)?;
            }
        }

        let winners = pool.verified_participant_count.max(1) as u64;
        let gross_bonus = if pool.pool_type == 0 {
            0
        } else {
            pool.slashed_pot / winners
        };
        let fee_amount = gross_bonus
            .checked_mul(pool.protocol_fee_bps as u64)
            .ok_or(ActakeError::MathOverflow)?
            / 10_000;
        let net_bonus = gross_bonus.saturating_sub(fee_amount);
        let total_payout = remaining_verified_principal
            .checked_add(net_bonus)
            .ok_or(ActakeError::MathOverflow)?;

        let vault_balance = ctx.accounts.vault.amount;
        let transfer_amount = total_payout.min(vault_balance);
        require!(transfer_amount > 0, ActakeError::EmptyVault);

        let pool_id_ref = pool.pool_id;
        let signer_seeds: &[&[&[u8]]] = &[&[b"pool", pool_id_ref.as_ref(), &[pool.bump]]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: pool.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token_interface::transfer_checked(cpi_ctx, transfer_amount, ctx.accounts.mint.decimals)?;

        let remaining_after_user = vault_balance.saturating_sub(transfer_amount);
        let fee_transfer = fee_amount.min(remaining_after_user);
        if fee_transfer > 0 {
            let fee_cpi_accounts = TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: pool.to_account_info(),
            };
            let fee_cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                fee_cpi_accounts,
                signer_seeds,
            );
            token_interface::transfer_checked(
                fee_cpi_ctx,
                fee_transfer,
                ctx.accounts.mint.decimals,
            )?;
        }

        participant.claimed_principal = participant
            .claimed_principal
            .checked_add(remaining_verified_principal)
            .ok_or(ActakeError::MathOverflow)?;
        participant.has_claimed = true;

        emit!(PayoutClaimed {
            pool: pool.key(),
            user: participant.user,
            principal: remaining_verified_principal,
            bonus: net_bonus,
            protocol_fee: fee_transfer,
            total_transferred: transfer_amount,
        });

        Ok(())
    }

    /// Sweeps remaining forfeited stakes from expired zero-winner pools to the Actake Fee Treasury.
    pub fn sweep_to_treasury(ctx: Context<SweepToTreasury>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(!pool.treasury_swept, ActakeError::TreasuryAlreadySwept);

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= pool.deadline_unix_ts,
            ActakeError::DeadlineNotReached
        );
        require!(
            pool.verified_participant_count == 0,
            ActakeError::PoolHasVerifiedWinners
        );

        let sweep_amount = ctx.accounts.vault.amount;
        require!(sweep_amount > 0, ActakeError::EmptyVault);

        let pool_id_ref = pool.pool_id;
        let signer_seeds: &[&[&[u8]]] = &[&[b"pool", pool_id_ref.as_ref(), &[pool.bump]]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.treasury_token_account.to_account_info(),
            authority: pool.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token_interface::transfer_checked(cpi_ctx, sweep_amount, ctx.accounts.mint.decimals)?;

        pool.slashed_pot = pool
            .slashed_pot
            .checked_add(sweep_amount)
            .ok_or(ActakeError::MathOverflow)?;
        pool.settled = true;
        pool.treasury_swept = true;

        emit!(TreasurySwept {
            pool: pool.key(),
            treasury: pool.treasury,
            pool_type: pool.pool_type,
            amount: sweep_amount,
        });

        Ok(())
    }

    // =========================================================================
    // MODULE 2: TRACK POOLS / STEP STAKE (Steps, Gym, Study — Solo + Public)
    // =========================================================================

    pub fn create_challenge_pool(
        ctx: Context<CreateChallengePool>,
        pool_id: u64,
        category: u8,
        visibility: u8,
        treasury: Pubkey,
        stake_amount: u64,
        target_metric: u64,
        duration_days: u16,
        start_timestamp: i64,
        skr_multiplier_bps: u16,
    ) -> Result<()> {
        step_stake::instructions::handle_create_challenge_pool(
            ctx,
            pool_id,
            category,
            visibility,
            treasury,
            stake_amount,
            target_metric,
            duration_days,
            start_timestamp,
            skr_multiplier_bps,
        )
    }

    pub fn join_pool_and_stake(
        ctx: Context<JoinPoolAndStake>,
        session_delegate: Option<Pubkey>,
    ) -> Result<()> {
        step_stake::instructions::handle_join_pool_and_stake(ctx, session_delegate)
    }

    pub fn submit_daily_checkin(
        ctx: Context<SubmitDailyCheckin>,
        day_index: u16,
        metric_achieved: u64,
        proof_hash: [u8; 32],
    ) -> Result<()> {
        step_stake::instructions::handle_submit_daily_checkin(
            ctx,
            day_index,
            metric_achieved,
            proof_hash,
        )
    }

    pub fn claim_daily_challenge_payout(
        ctx: Context<ClaimDailyChallengePayout>,
        day_index: u16,
    ) -> Result<()> {
        step_stake::instructions::handle_claim_daily_challenge_payout(ctx, day_index)
    }

    pub fn slash_solo_challenge_day(
        ctx: Context<SlashSoloChallengeDay>,
        day_index: u16,
    ) -> Result<()> {
        step_stake::instructions::handle_slash_solo_challenge_day(ctx, day_index)
    }

    pub fn mark_quitter_slashed(
        ctx: Context<MarkQuitterSlashed>,
        day_index: u16,
    ) -> Result<()> {
        step_stake::instructions::handle_mark_quitter_slashed(ctx, day_index)
    }

    pub fn settle_and_claim_challenge(
        ctx: Context<SettleAndClaimChallenge>,
    ) -> Result<()> {
        step_stake::instructions::handle_settle_and_claim(ctx)
    }

    // =========================================================================
    // MODULE 3: GEODROPS AR HUNTS (SPL USDC, Token-2022 SKR, and Native SOL)
    // =========================================================================

    pub fn create_token_geodrop_hunt(
        ctx: Context<CreateTokenGeoDropHunt>,
        hunt_id: u64,
        oracle_pubkey: [u8; 32],
        reward_per_chest: u64,
        total_chests: u16,
        expires_at: i64,
    ) -> Result<()> {
        geodrop::instructions::handle_create_token_geodrop_hunt(
            ctx,
            hunt_id,
            oracle_pubkey,
            reward_per_chest,
            total_chests,
            expires_at,
        )
    }

    pub fn create_sol_geodrop_hunt(
        ctx: Context<CreateSolGeoDropHunt>,
        hunt_id: u64,
        oracle_pubkey: [u8; 32],
        reward_per_chest: u64,
        total_chests: u16,
        expires_at: i64,
    ) -> Result<()> {
        geodrop::instructions::handle_create_sol_geodrop_hunt(
            ctx,
            hunt_id,
            oracle_pubkey,
            reward_per_chest,
            total_chests,
            expires_at,
        )
    }

    pub fn claim_token_geodrop(
        ctx: Context<ClaimTokenGeoDrop>,
        attestation_expires_at: i64,
    ) -> Result<()> {
        geodrop::instructions::handle_claim_token_geodrop(ctx, attestation_expires_at)
    }

    pub fn claim_sol_geodrop(
        ctx: Context<ClaimSolGeoDrop>,
        attestation_expires_at: i64,
    ) -> Result<()> {
        geodrop::instructions::handle_claim_sol_geodrop(ctx, attestation_expires_at)
    }

    pub fn reclaim_token_geodrop(ctx: Context<ReclaimTokenGeoDrop>) -> Result<()> {
        geodrop::instructions::handle_reclaim_token_geodrop(ctx)
    }

    pub fn reclaim_sol_geodrop(ctx: Context<ReclaimSolGeoDrop>) -> Result<()> {
        geodrop::instructions::handle_reclaim_sol_geodrop(ctx)
    }
}

/// Parses Solana's standard single-signature Ed25519Program instruction header
/// (16-byte header: num_sigs(1), padding(1), sig_offset(2), sig_ix(2),
///  pubkey_offset(2), pubkey_ix(2), msg_offset(2), msg_len(2), msg_ix(2))
/// and asserts both the oracle public key and exact message payload bytes.
pub(crate) fn verify_ed25519_ix_data(
    data: &[u8],
    expected_oracle_pubkey: &[u8; 32],
    expected_message: &[u8],
) -> Result<()> {
    require!(data.len() >= 16, ActakeError::InvalidEd25519Data);
    let num_signatures = data[0];
    require!(num_signatures == 1, ActakeError::InvalidEd25519Data);

    let sig_ix_idx = u16::from_le_bytes([data[4], data[5]]);
    let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let pubkey_ix_idx = u16::from_le_bytes([data[8], data[9]]);
    let msg_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let msg_len = u16::from_le_bytes([data[12], data[13]]) as usize;
    let msg_ix_idx = u16::from_le_bytes([data[14], data[15]]);

    // Ensure all fields reference inline bytes of the Ed25519 instruction itself (u16::MAX)
    require!(
        sig_ix_idx == u16::MAX && pubkey_ix_idx == u16::MAX && msg_ix_idx == u16::MAX,
        ActakeError::InvalidEd25519Data
    );
    require!(
        pubkey_offset.saturating_add(32) <= data.len(),
        ActakeError::InvalidEd25519Data
    );
    require!(
        msg_len == expected_message.len() && msg_offset.saturating_add(msg_len) <= data.len(),
        ActakeError::OracleMessageMismatch
    );

    let ix_pubkey = &data[pubkey_offset..pubkey_offset + 32];
    require!(
        ix_pubkey == expected_oracle_pubkey,
        ActakeError::UnauthorizedOracle
    );

    let ix_message = &data[msg_offset..msg_offset + msg_len];
    require!(
        ix_message == expected_message,
        ActakeError::OracleMessageMismatch
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(pool_id: [u8; 16])]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", pool_id.as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = creator,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = pool,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinPool<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(address = pool.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
        token::mint = mint,
        token::authority = pool,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = user,
        token::token_program = token_program
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = user,
        space = 8 + Participant::INIT_SPACE,
        seeds = [b"participant", pool.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub participant: Account<'info, Participant>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitCheckin<'info> {
    pub user: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"participant", pool.key().as_ref(), user.key().as_ref()],
        bump = participant.bump,
        has_one = pool,
        has_one = user
    )]
    pub participant: Account<'info, Participant>,

    /// CHECK: Verified strictly via address constraint to Solana's Sysvar Instructions account
    #[account(address = SYSVAR_INSTRUCTIONS_ID)]
    pub instructions_sysvar: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ClaimDailyPayout<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(address = pool.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
        token::mint = mint,
        token::authority = pool,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = user,
        token::token_program = token_program
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"participant", pool.key().as_ref(), user.key().as_ref()],
        bump = participant.bump,
        has_one = pool,
        has_one = user
    )]
    pub participant: Account<'info, Participant>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SlashMissedDay<'info> {
    pub caller: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(address = pool.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
        token::mint = mint,
        token::authority = pool,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = pool.treasury,
        token::token_program = token_program
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = participant.user,
        token::token_program = token_program
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"participant", pool.key().as_ref(), participant.user.as_ref()],
        bump = participant.bump,
        has_one = pool
    )]
    pub participant: Account<'info, Participant>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SettleAndClaim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(address = pool.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
        token::mint = mint,
        token::authority = pool,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = user,
        token::token_program = token_program
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = pool.treasury,
        token::token_program = token_program
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"participant", pool.key().as_ref(), user.key().as_ref()],
        bump = participant.bump,
        has_one = pool,
        has_one = user
    )]
    pub participant: Account<'info, Participant>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SweepToTreasury<'info> {
    pub caller: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(address = pool.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump,
        token::mint = mint,
        token::authority = pool,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = pool.treasury,
        token::token_program = token_program
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub pool_id: [u8; 16],
    pub pool_type: u8,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub treasury: Pubkey,
    pub oracle_pubkey: [u8; 32],
    pub stake_amount: u64,
    pub total_days: u16,
    pub deadline_unix_ts: i64,
    pub protocol_fee_bps: u16,
    pub total_staked: u64,
    pub participant_count: u32,
    pub verified_participant_count: u32,
    pub slashed_pot: u64,
    pub settled: bool,
    pub treasury_swept: bool,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Participant {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub staked_amount: u64,
    /// 384-bit bitmap covering 1-based days 1..=365 for verified check-ins
    pub checkin_bitmap: [u64; 6],
    /// 384-bit bitmap covering 1-based days 1..=365 for claimed daily principal
    pub claimed_bitmap: [u64; 6],
    /// 384-bit bitmap covering 1-based days 1..=365 for slashed missed days
    pub slashed_bitmap: [u64; 6],
    pub claimed_principal: u64,
    pub slashed_total: u64,
    pub checkins_completed: u16,
    pub verified_for_payout: bool,
    pub has_claimed: bool,
    pub bump: u8,
}

#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub treasury: Pubkey,
    pub pool_type: u8,
    pub stake_amount: u64,
    pub total_days: u16,
    pub oracle_pubkey: [u8; 32],
    pub protocol_fee_bps: u16,
}

#[event]
pub struct ParticipantJoined {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CheckinVerified {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub day_index: u16,
    pub proof_hash: [u8; 32],
}

#[event]
pub struct DailyPayoutClaimed {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub day_index: u16,
    pub amount: u64,
}

#[event]
pub struct DaySlashed {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub day_index: u16,
    pub treasury_slashed: u64,
    pub owner_refunded: u64,
    pub added_to_slashed_pot: u64,
}

#[event]
pub struct PayoutClaimed {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub principal: u64,
    pub bonus: u64,
    pub protocol_fee: u64,
    pub total_transferred: u64,
}

#[event]
pub struct TreasurySwept {
    pub pool: Pubkey,
    pub treasury: Pubkey,
    pub pool_type: u8,
    pub amount: u64,
}

#[error_code]
pub enum ActakeError {
    #[msg("Stake amount must be greater than zero.")]
    InvalidStakeAmount,
    #[msg("Duration must be between 1 and 365 days.")]
    InvalidDuration,
    #[msg("Protocol fee cannot exceed 5% (500 bps).")]
    FeeTooHigh,
    #[msg("Pool type must be 0 (Solo), 1 (Public Community), or 2 (Geo-Hunt).")]
    InvalidPoolType,
    #[msg("Treasury public key must be a valid non-default Solana address.")]
    InvalidTreasury,
    #[msg("Only the creator may join a private Solo pool.")]
    SoloPoolCreatorOnly,
    #[msg("This commitment pool is already settled.")]
    PoolAlreadySettled,
    #[msg("Day index must be between 1 and total_days.")]
    InvalidDayIndex,
    #[msg("This day has already been verified.")]
    DayAlreadyVerified,
    #[msg("Daily payout for this day has already been claimed.")]
    DayAlreadyClaimed,
    #[msg("This day has already been slashed.")]
    DayAlreadySlashed,
    #[msg("Missing preceding Ed25519 oracle signature verification instruction.")]
    MissingEd25519Instruction,
    #[msg("Preceding instruction must target the native Solana Ed25519Program.")]
    InvalidEd25519Program,
    #[msg("Malformed Ed25519 instruction header or offsets.")]
    InvalidEd25519Data,
    #[msg("Ed25519 signer does not match this pool's trusted oracle public key.")]
    UnauthorizedOracle,
    #[msg("Signed oracle payload does not match pool, user, day_index, or proof_hash.")]
    OracleMessageMismatch,
    #[msg("Participant has already claimed payout from this pool.")]
    AlreadyClaimed,
    #[msg("Participant has not completed required verified check-in.")]
    NotVerifiedForPayout,
    #[msg("Pool vault has insufficient tokens for payout.")]
    EmptyVault,
    #[msg("Pool deadline has not yet expired.")]
    DeadlineNotReached,
    #[msg("Cannot sweep full vault to treasury when verified winners exist.")]
    PoolHasVerifiedWinners,
    #[msg("Forfeited vault funds have already been swept to treasury.")]
    TreasuryAlreadySwept,
    #[msg("Arithmetic overflow occurred.")]
    MathOverflow,
}
