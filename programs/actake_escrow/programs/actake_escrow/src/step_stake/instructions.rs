use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    compute_day_principal_share, compute_solo_slash_split, is_day_bit_set, set_day_bit,
};

use super::errors::StepStakeError;
use super::events::{
    DailyChallengeClaimedEvent, DailyCheckinVerifiedEvent, ParticipantSlashedEvent,
    PoolCreatedEvent, RewardClaimedEvent, SoloChallengeDaySlashedEvent, UserStakedEvent,
};
use super::state::{
    ChallengePool, ParticipantState, BPS_DENOMINATOR, CATEGORY_STUDY, MAX_DURATION_DAYS,
    SECONDS_PER_DAY, VISIBILITY_PUBLIC, VISIBILITY_SOLO,
};

pub fn handle_create_challenge_pool(
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
    require!(category <= CATEGORY_STUDY, StepStakeError::InvalidCategory);
    require!(
        visibility <= VISIBILITY_PUBLIC,
        StepStakeError::InvalidVisibility
    );
    require!(treasury != Pubkey::default(), StepStakeError::InvalidTreasury);
    require!(stake_amount > 0, StepStakeError::InvalidStakeAmount);
    require!(target_metric > 0, StepStakeError::InvalidTargetMetric);
    require!(
        duration_days >= 1 && duration_days <= MAX_DURATION_DAYS,
        StepStakeError::InvalidDuration
    );
    require!(
        skr_multiplier_bps >= 10_000 && skr_multiplier_bps <= 25_000,
        StepStakeError::InvalidMultiplierBps
    );

    let now = Clock::get()?.unix_timestamp;
    let effective_start = if start_timestamp > 0 { start_timestamp } else { now };

    let pool = &mut ctx.accounts.pool;
    pool.creator = ctx.accounts.creator.key();
    pool.pool_id = pool_id;
    pool.category = category;
    pool.visibility = visibility;
    pool.mint = ctx.accounts.mint.key();
    pool.vault = ctx.accounts.vault.key();
    pool.treasury = treasury;
    pool.stake_amount = stake_amount;
    pool.target_metric = target_metric;
    pool.duration_days = duration_days;
    pool.start_timestamp = effective_start;
    pool.total_participants = 0;
    pool.active_participants = 0;
    pool.forfeited_vault_balance = 0;
    pool.skr_multiplier_bps = skr_multiplier_bps;
    pool.bump = ctx.bumps.pool;
    pool.vault_bump = ctx.bumps.vault;

    emit!(PoolCreatedEvent {
        pool: pool.key(),
        creator: pool.creator,
        pool_id: pool.pool_id,
        category: pool.category,
        visibility: pool.visibility,
        mint: pool.mint,
        vault: pool.vault,
        treasury: pool.treasury,
        stake_amount: pool.stake_amount,
        target_metric: pool.target_metric,
        duration_days: pool.duration_days,
        start_timestamp: pool.start_timestamp,
        skr_multiplier_bps: pool.skr_multiplier_bps,
    });

    Ok(())
}

pub fn handle_join_pool_and_stake(
    ctx: Context<JoinPoolAndStake>,
    session_delegate: Option<Pubkey>,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // Enforce Solo pool privacy on-chain: only the creator can stake into a Solo pool.
    if pool.visibility == VISIBILITY_SOLO {
        require_keys_eq!(
            ctx.accounts.user.key(),
            pool.creator,
            StepStakeError::SoloPoolCreatorOnly
        );
    }

    let now = Clock::get()?.unix_timestamp;
    let end_ts = pool
        .start_timestamp
        .checked_add(
            (pool.duration_days as i64)
                .checked_mul(SECONDS_PER_DAY)
                .ok_or(StepStakeError::MathOverflow)?,
        )
        .ok_or(StepStakeError::MathOverflow)?;
    require!(now < end_ts, StepStakeError::PoolEnded);

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.user_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token_interface::transfer_checked(cpi_ctx, pool.stake_amount, ctx.accounts.mint.decimals)?;

    let delegate_key = session_delegate.unwrap_or(Pubkey::default());

    let participant = &mut ctx.accounts.participant;
    participant.pool = pool.key();
    participant.user = ctx.accounts.user.key();
    participant.days_completed = 0;
    participant.last_checkin_day = 0;
    participant.is_eliminated = false;
    participant.has_claimed = false;
    participant.checkin_bitmap = [0u64; 6];
    participant.claimed_bitmap = [0u64; 6];
    participant.slashed_bitmap = [0u64; 6];
    participant.claimed_principal = 0;
    participant.slashed_total = 0;
    participant.latest_proof_hash = [0u8; 32];
    participant.session_delegate = delegate_key;
    participant.bump = ctx.bumps.participant;

    pool.total_participants = pool
        .total_participants
        .checked_add(1)
        .ok_or(StepStakeError::MathOverflow)?;
    pool.active_participants = pool
        .active_participants
        .checked_add(1)
        .ok_or(StepStakeError::MathOverflow)?;

    emit!(UserStakedEvent {
        pool: pool.key(),
        participant: participant.key(),
        user: participant.user,
        mint: pool.mint,
        stake_amount: pool.stake_amount,
        total_participants: pool.total_participants,
        active_participants: pool.active_participants,
        session_delegate: delegate_key,
    });

    Ok(())
}

pub fn handle_submit_daily_checkin(
    ctx: Context<SubmitDailyCheckin>,
    day_index: u16,
    metric_achieved: u64,
    proof_hash: [u8; 32],
) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let participant = &mut ctx.accounts.participant;
    let authority_key = ctx.accounts.checkin_authority.key();

    // Allow either the primary participant wallet OR their opt-in scoped ephemeral session delegate
    let is_owner = authority_key == participant.user;
    let is_delegate = participant.session_delegate != Pubkey::default()
        && authority_key == participant.session_delegate;
    require!(is_owner || is_delegate, StepStakeError::UnauthorizedCheckinSigner);

    // Public pools eliminate quitters; Solo multi-day pools slash only the missed day so future days remain playable.
    if pool.visibility == VISIBILITY_PUBLIC {
        require!(!participant.is_eliminated, StepStakeError::ParticipantEliminated);
    }

    require!(
        day_index >= 1 && day_index <= pool.duration_days,
        StepStakeError::InvalidDayIndex
    );
    require!(
        !is_day_bit_set(&participant.checkin_bitmap, day_index)
            .map_err(|_| StepStakeError::InvalidDayIndex)?,
        StepStakeError::DayAlreadyCheckedIn
    );
    require!(
        !is_day_bit_set(&participant.slashed_bitmap, day_index)
            .map_err(|_| StepStakeError::InvalidDayIndex)?,
        StepStakeError::DayAlreadySlashed
    );
    require!(
        metric_achieved >= pool.target_metric,
        StepStakeError::TargetMetricNotMet
    );
    require!(proof_hash != [0u8; 32], StepStakeError::EmptyProofHash);

    let now = Clock::get()?.unix_timestamp;
    let day_offset_start = ((day_index - 1) as i64)
        .checked_mul(SECONDS_PER_DAY)
        .ok_or(StepStakeError::MathOverflow)?;
    let day_offset_end = (day_index as i64)
        .checked_mul(SECONDS_PER_DAY)
        .ok_or(StepStakeError::MathOverflow)?;

    let window_start = pool
        .start_timestamp
        .checked_add(day_offset_start)
        .ok_or(StepStakeError::MathOverflow)?;
    let window_end = pool
        .start_timestamp
        .checked_add(day_offset_end)
        .ok_or(StepStakeError::MathOverflow)?;

    require!(
        now >= window_start && now <= window_end,
        StepStakeError::OutsideDayWindow
    );

    set_day_bit(&mut participant.checkin_bitmap, day_index)
        .map_err(|_| StepStakeError::InvalidDayIndex)?;
    participant.days_completed = participant
        .days_completed
        .checked_add(1)
        .ok_or(StepStakeError::MathOverflow)?;
    if day_index > participant.last_checkin_day {
        participant.last_checkin_day = day_index;
    }
    participant.latest_proof_hash = proof_hash;

    emit!(DailyCheckinVerifiedEvent {
        pool: pool.key(),
        user: participant.user,
        signer: authority_key,
        day_index,
        metric_achieved,
        target_metric: pool.target_metric,
        days_completed: participant.days_completed,
        proof_hash,
        verified_at: now,
    });

    Ok(())
}

/// Immediately releases a single completed day's split-evenly principal share
/// (`stake_amount / duration_days`, with exact remainder on the final day).
/// On the final day (after `end_timestamp` for surviving Public participants),
/// also includes the SKR-weighted bonus share from `forfeited_vault_balance`.
pub fn handle_claim_daily_challenge_payout(
    ctx: Context<ClaimDailyChallengePayout>,
    day_index: u16,
) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let participant = &mut ctx.accounts.participant;

    require!(
        day_index >= 1 && day_index <= pool.duration_days,
        StepStakeError::InvalidDayIndex
    );
    require!(
        is_day_bit_set(&participant.checkin_bitmap, day_index)
            .map_err(|_| StepStakeError::InvalidDayIndex)?,
        StepStakeError::DayNotVerified
    );
    require!(
        !is_day_bit_set(&participant.claimed_bitmap, day_index)
            .map_err(|_| StepStakeError::InvalidDayIndex)?,
        StepStakeError::DayAlreadyClaimed
    );
    require!(
        !is_day_bit_set(&participant.slashed_bitmap, day_index)
            .map_err(|_| StepStakeError::InvalidDayIndex)?,
        StepStakeError::DayAlreadySlashed
    );

    let principal_payout =
        compute_day_principal_share(pool.stake_amount, pool.duration_days, day_index)
            .map_err(|_| StepStakeError::MathOverflow)?;

    let now = Clock::get()?.unix_timestamp;
    let end_ts = pool
        .start_timestamp
        .checked_add(
            (pool.duration_days as i64)
                .checked_mul(SECONDS_PER_DAY)
                .ok_or(StepStakeError::MathOverflow)?,
        )
        .ok_or(StepStakeError::MathOverflow)?;

    let mut bonus_payout: u64 = 0;
    if pool.visibility == VISIBILITY_PUBLIC
        && day_index == pool.duration_days
        && !participant.is_eliminated
        && !participant.has_claimed
        && now >= end_ts
        && pool.forfeited_vault_balance > 0
    {
        let survivors = std::cmp::max(1, pool.active_participants) as u128;
        let base_bonus = (pool.forfeited_vault_balance as u128)
            .checked_div(survivors)
            .ok_or(StepStakeError::MathOverflow)?;
        let weighted_bonus = base_bonus
            .checked_mul(pool.skr_multiplier_bps as u128)
            .ok_or(StepStakeError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(StepStakeError::MathOverflow)?;
        bonus_payout = weighted_bonus as u64;
        participant.has_claimed = true;
    }

    let desired_payout = principal_payout
        .checked_add(bonus_payout)
        .ok_or(StepStakeError::MathOverflow)?;
    let vault_balance = ctx.accounts.vault.amount;
    require!(
        vault_balance >= principal_payout,
        StepStakeError::InsufficientVaultBalance
    );
    let total_payout = std::cmp::min(desired_payout, vault_balance);
    let actual_bonus = total_payout.saturating_sub(principal_payout);

    let pool_id_bytes = pool.pool_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"pool",
        pool.creator.as_ref(),
        pool_id_bytes.as_ref(),
        &[pool.bump],
    ]];

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
    token_interface::transfer_checked(cpi_ctx, total_payout, ctx.accounts.mint.decimals)?;

    set_day_bit(&mut participant.claimed_bitmap, day_index)
        .map_err(|_| StepStakeError::InvalidDayIndex)?;
    participant.claimed_principal = participant
        .claimed_principal
        .checked_add(principal_payout)
        .ok_or(StepStakeError::MathOverflow)?;

    if participant
        .claimed_principal
        .saturating_add(participant.slashed_total)
        >= pool.stake_amount
        && (pool.visibility == VISIBILITY_SOLO || now >= end_ts)
    {
        participant.has_claimed = true;
    }

    emit!(DailyChallengeClaimedEvent {
        pool: pool.key(),
        user: participant.user,
        mint: pool.mint,
        day_index,
        principal_payout,
        bonus_payout: actual_bonus,
        total_payout,
        claimed_at: now,
    });

    Ok(())
}

/// Slashes a missed day on a private Solo Track Pool:
/// - If `duration_days == 1` (Once): sends 50% to `pool.treasury` and refunds 50% to owner.
/// - If `duration_days > 1` (Multi-day): sends ONLY that day's daily ratio to `pool.treasury`,
///   leaving all remaining days' principal intact in the vault for future check-ins.
pub fn handle_slash_solo_challenge_day(
    ctx: Context<SlashSoloChallengeDay>,
    day_index: u16,
) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let participant = &mut ctx.accounts.participant;

    require!(
        pool.visibility == VISIBILITY_SOLO,
        StepStakeError::SoloPoolOnly
    );
    require!(
        day_index >= 1 && day_index <= pool.duration_days,
        StepStakeError::InvalidDayIndex
    );
    require!(
        !is_day_bit_set(&participant.checkin_bitmap, day_index)
            .map_err(|_| StepStakeError::InvalidDayIndex)?,
        StepStakeError::ParticipantAlreadyCheckedIn
    );
    require!(
        !is_day_bit_set(&participant.slashed_bitmap, day_index)
            .map_err(|_| StepStakeError::InvalidDayIndex)?,
        StepStakeError::DayAlreadySlashed
    );

    let now = Clock::get()?.unix_timestamp;
    let day_deadline = pool
        .start_timestamp
        .checked_add(
            (day_index as i64)
                .checked_mul(SECONDS_PER_DAY)
                .ok_or(StepStakeError::MathOverflow)?,
        )
        .ok_or(StepStakeError::MathOverflow)?;
    require!(now > day_deadline, StepStakeError::DeadlineNotPassed);

    let (treasury_share, owner_refund) =
        compute_solo_slash_split(pool.stake_amount, pool.duration_days, day_index)
            .map_err(|_| StepStakeError::MathOverflow)?;

    let vault_balance = ctx.accounts.vault.amount;
    let treasury_transfer = std::cmp::min(treasury_share, vault_balance);
    let remaining_after_treasury = vault_balance.saturating_sub(treasury_transfer);
    let owner_transfer = std::cmp::min(owner_refund, remaining_after_treasury);

    let pool_id_bytes = pool.pool_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"pool",
        pool.creator.as_ref(),
        pool_id_bytes.as_ref(),
        &[pool.bump],
    ]];

    if treasury_transfer > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.treasury_token_account.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token_interface::transfer_checked(cpi_ctx, treasury_transfer, ctx.accounts.mint.decimals)?;
    }

    if owner_transfer > 0 {
        let refund_cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };
        let refund_cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            refund_cpi_accounts,
            signer_seeds,
        );
        token_interface::transfer_checked(
            refund_cpi_ctx,
            owner_transfer,
            ctx.accounts.mint.decimals,
        )?;
    }

    set_day_bit(&mut participant.slashed_bitmap, day_index)
        .map_err(|_| StepStakeError::InvalidDayIndex)?;
    participant.slashed_total = participant
        .slashed_total
        .checked_add(treasury_transfer.saturating_add(owner_transfer))
        .ok_or(StepStakeError::MathOverflow)?;

    if pool.duration_days == 1 {
        participant.is_eliminated = true;
        participant.has_claimed = true;
    }

    emit!(SoloChallengeDaySlashedEvent {
        pool: pool.key(),
        user: participant.user,
        treasury: pool.treasury,
        day_index,
        treasury_slashed: treasury_transfer,
        owner_refunded: owner_transfer,
        slashed_at: now,
    });

    Ok(())
}

/// Public Community quitter slash crank: forfeits the quitter's remaining unclaimed
/// stake into `pool.forfeited_vault_balance` so surviving community members split it.
pub fn handle_mark_quitter_slashed(
    ctx: Context<MarkQuitterSlashed>,
    day_index: u16,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let participant = &mut ctx.accounts.participant;

    require!(
        pool.visibility == VISIBILITY_PUBLIC,
        StepStakeError::PublicPoolOnly
    );
    require!(!participant.is_eliminated, StepStakeError::ParticipantEliminated);
    require!(
        day_index >= 1 && day_index <= pool.duration_days,
        StepStakeError::InvalidDayIndex
    );
    require!(
        !is_day_bit_set(&participant.checkin_bitmap, day_index)
            .map_err(|_| StepStakeError::InvalidDayIndex)?,
        StepStakeError::ParticipantAlreadyCheckedIn
    );

    let now = Clock::get()?.unix_timestamp;
    let day_deadline = pool
        .start_timestamp
        .checked_add(
            (day_index as i64)
                .checked_mul(SECONDS_PER_DAY)
                .ok_or(StepStakeError::MathOverflow)?,
        )
        .ok_or(StepStakeError::MathOverflow)?;
    require!(now > day_deadline, StepStakeError::DeadlineNotPassed);

    let remaining_forfeitable = pool
        .stake_amount
        .saturating_sub(participant.claimed_principal)
        .saturating_sub(participant.slashed_total);

    participant.is_eliminated = true;
    set_day_bit(&mut participant.slashed_bitmap, day_index)
        .map_err(|_| StepStakeError::InvalidDayIndex)?;
    participant.slashed_total = participant
        .slashed_total
        .checked_add(remaining_forfeitable)
        .ok_or(StepStakeError::MathOverflow)?;

    pool.active_participants = pool
        .active_participants
        .checked_sub(1)
        .ok_or(StepStakeError::MathOverflow)?;
    pool.forfeited_vault_balance = pool
        .forfeited_vault_balance
        .checked_add(remaining_forfeitable)
        .ok_or(StepStakeError::MathOverflow)?;

    emit!(ParticipantSlashedEvent {
        pool: pool.key(),
        user: participant.user,
        crank_caller: ctx.accounts.crank_caller.key(),
        missed_day_index: day_index,
        slashed_amount: remaining_forfeitable,
        active_participants: pool.active_participants,
        forfeited_vault_balance: pool.forfeited_vault_balance,
        slashed_at: now,
    });

    Ok(())
}

/// Final pool settlement: pays any remaining verified-but-unclaimed daily principal
/// plus (for surviving Public participants after `end_timestamp`) their SKR-weighted
/// share of `pool.forfeited_vault_balance`.
pub fn handle_settle_and_claim(ctx: Context<SettleAndClaimChallenge>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let participant = &mut ctx.accounts.participant;

    require!(!participant.has_claimed, StepStakeError::AlreadyClaimed);

    let now = Clock::get()?.unix_timestamp;
    let end_ts = pool
        .start_timestamp
        .checked_add(
            (pool.duration_days as i64)
                .checked_mul(SECONDS_PER_DAY)
                .ok_or(StepStakeError::MathOverflow)?,
        )
        .ok_or(StepStakeError::MathOverflow)?;
    require!(now >= end_ts, StepStakeError::PoolNotCompleted);

    // Sum all verified days that were not yet claimed via `claim_daily_challenge_payout`
    let mut unclaimed_verified_principal: u64 = 0;
    for d in 1..=pool.duration_days {
        let checked = is_day_bit_set(&participant.checkin_bitmap, d)
            .map_err(|_| StepStakeError::InvalidDayIndex)?;
        let claimed = is_day_bit_set(&participant.claimed_bitmap, d)
            .map_err(|_| StepStakeError::InvalidDayIndex)?;
        let slashed = is_day_bit_set(&participant.slashed_bitmap, d)
            .map_err(|_| StepStakeError::InvalidDayIndex)?;
        if checked && !claimed && !slashed {
            let share = compute_day_principal_share(pool.stake_amount, pool.duration_days, d)
                .map_err(|_| StepStakeError::MathOverflow)?;
            unclaimed_verified_principal = unclaimed_verified_principal
                .checked_add(share)
                .ok_or(StepStakeError::MathOverflow)?;
            set_day_bit(&mut participant.claimed_bitmap, d)
                .map_err(|_| StepStakeError::InvalidDayIndex)?;
        }
    }

    let mut weighted_bonus: u64 = 0;
    if pool.visibility == VISIBILITY_PUBLIC
        && !participant.is_eliminated
        && participant.days_completed >= pool.duration_days
        && pool.forfeited_vault_balance > 0
    {
        let survivors = std::cmp::max(1, pool.active_participants) as u128;
        let base_bonus = (pool.forfeited_vault_balance as u128)
            .checked_div(survivors)
            .ok_or(StepStakeError::MathOverflow)?;
        let bonus_u128 = base_bonus
            .checked_mul(pool.skr_multiplier_bps as u128)
            .ok_or(StepStakeError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(StepStakeError::MathOverflow)?;
        weighted_bonus = bonus_u128 as u64;
    }

    let desired_payout = unclaimed_verified_principal
        .checked_add(weighted_bonus)
        .ok_or(StepStakeError::MathOverflow)?;
    require!(desired_payout > 0, StepStakeError::NothingToClaim);

    let vault_balance = ctx.accounts.vault.amount;
    require!(
        vault_balance >= unclaimed_verified_principal,
        StepStakeError::InsufficientVaultBalance
    );

    let total_payout = std::cmp::min(desired_payout, vault_balance);
    let actual_bonus = total_payout.saturating_sub(unclaimed_verified_principal);

    let pool_id_bytes = pool.pool_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"pool",
        pool.creator.as_ref(),
        pool_id_bytes.as_ref(),
        &[pool.bump],
    ]];

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
    token_interface::transfer_checked(cpi_ctx, total_payout, ctx.accounts.mint.decimals)?;

    participant.claimed_principal = participant
        .claimed_principal
        .checked_add(unclaimed_verified_principal)
        .ok_or(StepStakeError::MathOverflow)?;
    participant.has_claimed = true;

    emit!(RewardClaimedEvent {
        pool: pool.key(),
        user: participant.user,
        mint: pool.mint,
        principal: unclaimed_verified_principal,
        bonus_share: actual_bonus,
        skr_multiplier_bps: pool.skr_multiplier_bps,
        total_payout,
        claimed_at: now,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct CreateChallengePool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + ChallengePool::INIT_SPACE,
        seeds = [b"pool", creator.key().as_ref(), &pool_id.to_le_bytes()],
        bump
    )]
    pub pool: Account<'info, ChallengePool>,

    #[account(
        init,
        payer = creator,
        token::mint = mint,
        token::authority = pool,
        token::token_program = token_program,
        seeds = [b"vault", pool.key().as_ref()],
        bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinPoolAndStake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.pool_id.to_le_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, ChallengePool>,

    #[account(address = pool.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        address = pool.vault,
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
        space = 8 + ParticipantState::INIT_SPACE,
        seeds = [b"participant", pool.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub participant: Account<'info, ParticipantState>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitDailyCheckin<'info> {
    /// Either the participant's wallet OR their authorized scoped ephemeral session delegate
    pub checkin_authority: Signer<'info>,

    #[account(
        seeds = [b"pool", pool.creator.as_ref(), &pool.pool_id.to_le_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, ChallengePool>,

    #[account(
        mut,
        has_one = pool,
        seeds = [b"participant", pool.key().as_ref(), participant.user.as_ref()],
        bump = participant.bump
    )]
    pub participant: Account<'info, ParticipantState>,
}

#[derive(Accounts)]
pub struct ClaimDailyChallengePayout<'info> {
    /// Strictly requires the primary participant wallet (scoped session delegates cannot withdraw funds)
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.pool_id.to_le_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, ChallengePool>,

    #[account(address = pool.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        address = pool.vault,
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
        has_one = pool,
        has_one = user,
        seeds = [b"participant", pool.key().as_ref(), user.key().as_ref()],
        bump = participant.bump
    )]
    pub participant: Account<'info, ParticipantState>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SlashSoloChallengeDay<'info> {
    /// Either the owner or a keeper crank may settle an expired solo missed day
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.pool_id.to_le_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, ChallengePool>,

    #[account(address = pool.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        address = pool.vault,
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
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        has_one = pool,
        seeds = [b"participant", pool.key().as_ref(), participant.user.as_ref()],
        bump = participant.bump
    )]
    pub participant: Account<'info, ParticipantState>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct MarkQuitterSlashed<'info> {
    /// Permissionless crank caller — anyone may slash a Public pool participant who missed a day deadline
    pub crank_caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.pool_id.to_le_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, ChallengePool>,

    #[account(
        mut,
        has_one = pool,
        seeds = [b"participant", pool.key().as_ref(), participant.user.as_ref()],
        bump = participant.bump
    )]
    pub participant: Account<'info, ParticipantState>,
}

#[derive(Accounts)]
pub struct SettleAndClaimChallenge<'info> {
    /// Strictly requires the primary participant wallet (scoped session delegates cannot claim funds)
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.pool_id.to_le_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, ChallengePool>,

    #[account(address = pool.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        address = pool.vault,
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
        has_one = pool,
        has_one = user,
        seeds = [b"participant", pool.key().as_ref(), user.key().as_ref()],
        bump = participant.bump
    )]
    pub participant: Account<'info, ParticipantState>,

    pub token_program: Interface<'info, TokenInterface>,
}
