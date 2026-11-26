use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as SYSVAR_INSTRUCTIONS_ID,
};
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

// Replace with your deployed Devnet Program ID from `anchor keys list`
declare_id!("ACTKescrow111111111111111111111111111111111");

/// Expected binary message layout signed by the Actake Ed25519 Oracle:
/// pool_pda (32 bytes) || user_pubkey (32 bytes) || day_index (u16 LE, 2 bytes) || proof_hash (32 bytes)
const EXPECTED_ORACLE_MSG_LEN: usize = 32 + 32 + 2 + 32;

#[program]
pub mod actake_escrow {
    use super::*;

    /// Initializes a new Actake accountability commitment pool and its PDA token vault.
    /// Supports both standard SPL Token (USDC) and Token-2022 (0%-fee SKR).
    pub fn create_pool(
        ctx: Context<CreatePool>,
        pool_id: [u8; 16],
        stake_amount: u64,
        oracle_pubkey: [u8; 32],
        total_days: u16,
        deadline_unix_ts: i64,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        require!(stake_amount > 0, ActakeError::InvalidStakeAmount);
        require!(total_days > 0 && total_days <= 64, ActakeError::InvalidDuration);
        require!(protocol_fee_bps <= 500, ActakeError::FeeTooHigh);

        let pool = &mut ctx.accounts.pool;
        pool.pool_id = pool_id;
        pool.creator = ctx.accounts.creator.key();
        pool.mint = ctx.accounts.mint.key();
        pool.vault = ctx.accounts.vault.key();
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
        pool.bump = ctx.bumps.pool;
        pool.vault_bump = ctx.bumps.vault;

        emit!(PoolCreated {
            pool: pool.key(),
            creator: pool.creator,
            mint: pool.mint,
            stake_amount,
            oracle_pubkey,
            protocol_fee_bps,
        });

        Ok(())
    }

    /// Locks the user's SPL / Token-2022 stake into the trustless Pool Vault PDA
    /// and initializes their Participant PDA account.
    pub fn join_pool(ctx: Context<JoinPool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(!pool.settled, ActakeError::PoolAlreadySettled);

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
        participant.checkin_bitmap = 0;
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
    /// is an `Ed25519Program` verification signed by `pool.oracle_pubkey` over:
    /// `pool_pda || user_pubkey || day_index (u16 LE) || proof_hash (32 bytes)`.
    pub fn submit_checkin(
        ctx: Context<SubmitCheckin>,
        day_index: u16,
        proof_hash: [u8; 32],
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let participant = &mut ctx.accounts.participant;

        require!(!pool.settled, ActakeError::PoolAlreadySettled);
        require!(day_index < pool.total_days, ActakeError::InvalidDayIndex);

        let day_bit = 1u64
            .checked_shl(day_index as u32)
            .ok_or(ActakeError::InvalidDayIndex)?;
        require!(
            (participant.checkin_bitmap & day_bit) == 0,
            ActakeError::DayAlreadyVerified
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

        // Build exact expected message bytes matching server.ts oracle signer
        let mut expected_msg = Vec::with_capacity(EXPECTED_ORACLE_MSG_LEN);
        expected_msg.extend_from_slice(pool.key().as_ref());
        expected_msg.extend_from_slice(ctx.accounts.user.key().as_ref());
        expected_msg.extend_from_slice(&day_index.to_le_bytes());
        expected_msg.extend_from_slice(&proof_hash);

        verify_ed25519_ix_data(&ed25519_ix.data, &pool.oracle_pubkey, &expected_msg)?;

        participant.checkin_bitmap |= day_bit;
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

    /// Settles a participant's escrow after check-in verification / deadline expiry.
    /// Verified participants receive their full principal plus a proportional share
    /// of the pool's slashed pot from non-verified participants (minus protocol fee bps).
    pub fn settle_and_claim(ctx: Context<SettleAndClaim>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let participant = &mut ctx.accounts.participant;

        require!(!participant.has_claimed, ActakeError::AlreadyClaimed);
        require!(participant.verified_for_payout, ActakeError::NotVerifiedForPayout);

        let clock = Clock::get()?;
        if !pool.settled && clock.unix_timestamp >= pool.deadline_unix_ts {
            let unverified_count = pool
                .participant_count
                .saturating_sub(pool.verified_participant_count);
            pool.slashed_pot = (unverified_count as u64)
                .checked_mul(pool.stake_amount)
                .ok_or(ActakeError::MathOverflow)?;
            pool.settled = true;
        }

        let winners = pool.verified_participant_count.max(1) as u64;
        let gross_bonus = pool.slashed_pot / winners;
        let fee_amount = gross_bonus
            .checked_mul(pool.protocol_fee_bps as u64)
            .ok_or(ActakeError::MathOverflow)?
            / 10_000;
        let net_bonus = gross_bonus.saturating_sub(fee_amount);
        let total_payout = participant
            .staked_amount
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

        participant.has_claimed = true;

        emit!(PayoutClaimed {
            pool: pool.key(),
            user: participant.user,
            principal: participant.staked_amount,
            bonus: net_bonus,
            total_transferred: transfer_amount,
        });

        Ok(())
    }
}

/// Parses Solana's standard single-signature Ed25519Program instruction header
/// (16-byte header: num_sigs(1), padding(1), sig_offset(2), sig_ix(2),
///  pubkey_offset(2), pubkey_ix(2), msg_offset(2), msg_len(2), msg_ix(2))
/// and asserts both the oracle public key and exact message payload bytes.
fn verify_ed25519_ix_data(
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
        seeds = [b"participant", pool.key().as_ref(), user.key().as_ref()],
        bump = participant.bump,
        has_one = pool,
        has_one = user
    )]
    pub participant: Account<'info, Participant>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub pool_id: [u8; 16],
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
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
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Participant {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub staked_amount: u64,
    pub checkin_bitmap: u64,
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
    pub stake_amount: u64,
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
pub struct PayoutClaimed {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub principal: u64,
    pub bonus: u64,
    pub total_transferred: u64,
}

#[error_code]
pub enum ActakeError {
    #[msg("Stake amount must be greater than zero.")]
    InvalidStakeAmount,
    #[msg("Duration must be between 1 and 64 days.")]
    InvalidDuration,
    #[msg("Protocol fee cannot exceed 5% (500 bps).")]
    FeeTooHigh,
    #[msg("This commitment pool is already settled.")]
    PoolAlreadySettled,
    #[msg("Day index out of bounds for this pool.")]
    InvalidDayIndex,
    #[msg("This day has already been verified.")]
    DayAlreadyVerified,
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
    #[msg("Arithmetic overflow occurred.")]
    MathOverflow,
}
