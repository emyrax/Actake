use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as SYSVAR_INSTRUCTIONS_ID,
};
use anchor_lang::system_program;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{verify_ed25519_ix_data, ActakeError};

use super::errors::GeoDropError;
use super::events::{GeoDropClaimed, GeoDropHuntCreated, GeoDropReclaimed};
use super::state::{GeoDropClaimReceipt, GeoDropHunt, EXPECTED_GEODROP_ORACLE_MSG_LEN};

pub fn handle_create_token_geodrop_hunt(
    ctx: Context<CreateTokenGeoDropHunt>,
    hunt_id: u64,
    oracle_pubkey: [u8; 32],
    reward_per_chest: u64,
    total_chests: u16,
    expires_at: i64,
) -> Result<()> {
    require!(reward_per_chest > 0, GeoDropError::InvalidRewardAmount);
    require!(total_chests >= 1 && total_chests <= 10_000, GeoDropError::InvalidChestCount);

    let now = Clock::get()?.unix_timestamp;
    require!(expires_at > now, GeoDropError::InvalidExpiryTimestamp);

    let total_funded = reward_per_chest
        .checked_mul(total_chests as u64)
        .ok_or(GeoDropError::MathOverflow)?;

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.creator_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.creator.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token_interface::transfer_checked(cpi_ctx, total_funded, ctx.accounts.mint.decimals)?;

    let hunt = &mut ctx.accounts.hunt;
    hunt.creator = ctx.accounts.creator.key();
    hunt.hunt_id = hunt_id;
    hunt.oracle_pubkey = oracle_pubkey;
    hunt.mint = ctx.accounts.mint.key();
    hunt.vault = ctx.accounts.vault.key();
    hunt.is_native_sol = false;
    hunt.reward_per_chest = reward_per_chest;
    hunt.total_chests = total_chests;
    hunt.claims_remaining = total_chests;
    hunt.expires_at = expires_at;
    hunt.bump = ctx.bumps.hunt;
    hunt.vault_bump = ctx.bumps.vault;

    emit!(GeoDropHuntCreated {
        hunt: hunt.key(),
        creator: hunt.creator,
        hunt_id,
        mint: hunt.mint,
        vault: hunt.vault,
        is_native_sol: false,
        reward_per_chest,
        total_chests,
        total_funded,
        expires_at,
    });

    Ok(())
}

pub fn handle_create_sol_geodrop_hunt(
    ctx: Context<CreateSolGeoDropHunt>,
    hunt_id: u64,
    oracle_pubkey: [u8; 32],
    reward_per_chest: u64,
    total_chests: u16,
    expires_at: i64,
) -> Result<()> {
    require!(reward_per_chest > 0, GeoDropError::InvalidRewardAmount);
    require!(total_chests >= 1 && total_chests <= 10_000, GeoDropError::InvalidChestCount);

    let now = Clock::get()?.unix_timestamp;
    require!(expires_at > now, GeoDropError::InvalidExpiryTimestamp);

    let total_funded = reward_per_chest
        .checked_mul(total_chests as u64)
        .ok_or(GeoDropError::MathOverflow)?;

    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.creator.to_account_info(),
            to: ctx.accounts.sol_vault.to_account_info(),
        },
    );
    system_program::transfer(cpi_ctx, total_funded)?;

    let hunt = &mut ctx.accounts.hunt;
    hunt.creator = ctx.accounts.creator.key();
    hunt.hunt_id = hunt_id;
    hunt.oracle_pubkey = oracle_pubkey;
    hunt.mint = Pubkey::default();
    hunt.vault = ctx.accounts.sol_vault.key();
    hunt.is_native_sol = true;
    hunt.reward_per_chest = reward_per_chest;
    hunt.total_chests = total_chests;
    hunt.claims_remaining = total_chests;
    hunt.expires_at = expires_at;
    hunt.bump = ctx.bumps.hunt;
    hunt.vault_bump = ctx.bumps.sol_vault;

    emit!(GeoDropHuntCreated {
        hunt: hunt.key(),
        creator: hunt.creator,
        hunt_id,
        mint: hunt.mint,
        vault: hunt.vault,
        is_native_sol: true,
        reward_per_chest,
        total_chests,
        total_funded,
        expires_at,
    });

    Ok(())
}

fn verify_geodrop_oracle_attestation(
    instructions_sysvar: &AccountInfo,
    hunt_key: Pubkey,
    hunter_key: Pubkey,
    oracle_pubkey: &[u8; 32],
    reward_per_chest: u64,
    attestation_expires_at: i64,
) -> Result<()> {
    let current_idx = load_current_index_checked(instructions_sysvar)
        .map_err(|_| ActakeError::MissingEd25519Instruction)?;
    require!(current_idx > 0, ActakeError::MissingEd25519Instruction);

    let ed25519_ix = load_instruction_at_checked((current_idx - 1) as usize, instructions_sysvar)
        .map_err(|_| ActakeError::MissingEd25519Instruction)?;
    require_keys_eq!(
        ed25519_ix.program_id,
        ed25519_program::ID,
        ActakeError::InvalidEd25519Program
    );

    let mut expected_msg = Vec::with_capacity(EXPECTED_GEODROP_ORACLE_MSG_LEN);
    expected_msg.extend_from_slice(hunt_key.as_ref());
    expected_msg.extend_from_slice(hunter_key.as_ref());
    expected_msg.extend_from_slice(&reward_per_chest.to_le_bytes());
    expected_msg.extend_from_slice(&attestation_expires_at.to_le_bytes());

    verify_ed25519_ix_data(&ed25519_ix.data, oracle_pubkey, &expected_msg)
}

pub fn handle_claim_token_geodrop(
    ctx: Context<ClaimTokenGeoDrop>,
    attestation_expires_at: i64,
) -> Result<()> {
    let hunt = &mut ctx.accounts.hunt;
    require!(!hunt.is_native_sol, GeoDropError::AssetTypeMismatch);
    require!(hunt.claims_remaining > 0, GeoDropError::NoChestsRemaining);

    let now = Clock::get()?.unix_timestamp;
    require!(now <= hunt.expires_at, GeoDropError::HuntExpired);
    require!(now <= attestation_expires_at, GeoDropError::AttestationExpired);

    verify_geodrop_oracle_attestation(
        &ctx.accounts.instructions_sysvar,
        hunt.key(),
        ctx.accounts.hunter.key(),
        &hunt.oracle_pubkey,
        hunt.reward_per_chest,
        attestation_expires_at,
    )?;

    require!(
        ctx.accounts.vault.amount >= hunt.reward_per_chest,
        GeoDropError::InsufficientVaultBalance
    );

    let hunt_id_bytes = hunt.hunt_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"geodrop",
        hunt.creator.as_ref(),
        hunt_id_bytes.as_ref(),
        &[hunt.bump],
    ]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.hunter_token_account.to_account_info(),
        authority: hunt.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token_interface::transfer_checked(cpi_ctx, hunt.reward_per_chest, ctx.accounts.mint.decimals)?;

    hunt.claims_remaining = hunt
        .claims_remaining
        .checked_sub(1)
        .ok_or(GeoDropError::MathOverflow)?;

    let receipt = &mut ctx.accounts.claim_receipt;
    receipt.hunt = hunt.key();
    receipt.hunter = ctx.accounts.hunter.key();
    receipt.reward_claimed = hunt.reward_per_chest;
    receipt.claimed_at = now;
    receipt.bump = ctx.bumps.claim_receipt;

    emit!(GeoDropClaimed {
        hunt: hunt.key(),
        hunter: receipt.hunter,
        receipt: receipt.key(),
        is_native_sol: false,
        reward_amount: hunt.reward_per_chest,
        claims_remaining: hunt.claims_remaining,
        claimed_at: now,
    });

    Ok(())
}

pub fn handle_claim_sol_geodrop(
    ctx: Context<ClaimSolGeoDrop>,
    attestation_expires_at: i64,
) -> Result<()> {
    let hunt = &mut ctx.accounts.hunt;
    require!(hunt.is_native_sol, GeoDropError::AssetTypeMismatch);
    require!(hunt.claims_remaining > 0, GeoDropError::NoChestsRemaining);

    let now = Clock::get()?.unix_timestamp;
    require!(now <= hunt.expires_at, GeoDropError::HuntExpired);
    require!(now <= attestation_expires_at, GeoDropError::AttestationExpired);

    verify_geodrop_oracle_attestation(
        &ctx.accounts.instructions_sysvar,
        hunt.key(),
        ctx.accounts.hunter.key(),
        &hunt.oracle_pubkey,
        hunt.reward_per_chest,
        attestation_expires_at,
    )?;

    require!(
        ctx.accounts.sol_vault.lamports() >= hunt.reward_per_chest,
        GeoDropError::InsufficientVaultBalance
    );

    let hunt_key = hunt.key();
    let sol_vault_seeds: &[&[&[u8]]] = &[&[
        b"geodrop_sol_vault",
        hunt_key.as_ref(),
        &[hunt.vault_bump],
    ]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.sol_vault.to_account_info(),
            to: ctx.accounts.hunter.to_account_info(),
        },
        sol_vault_seeds,
    );
    system_program::transfer(cpi_ctx, hunt.reward_per_chest)?;

    hunt.claims_remaining = hunt
        .claims_remaining
        .checked_sub(1)
        .ok_or(GeoDropError::MathOverflow)?;

    let receipt = &mut ctx.accounts.claim_receipt;
    receipt.hunt = hunt.key();
    receipt.hunter = ctx.accounts.hunter.key();
    receipt.reward_claimed = hunt.reward_per_chest;
    receipt.claimed_at = now;
    receipt.bump = ctx.bumps.claim_receipt;

    emit!(GeoDropClaimed {
        hunt: hunt.key(),
        hunter: receipt.hunter,
        receipt: receipt.key(),
        is_native_sol: true,
        reward_amount: hunt.reward_per_chest,
        claims_remaining: hunt.claims_remaining,
        claimed_at: now,
    });

    Ok(())
}

pub fn handle_reclaim_token_geodrop(ctx: Context<ReclaimTokenGeoDrop>) -> Result<()> {
    let hunt = &mut ctx.accounts.hunt;
    require!(!hunt.is_native_sol, GeoDropError::AssetTypeMismatch);
    require_keys_eq!(
        ctx.accounts.creator.key(),
        hunt.creator,
        GeoDropError::UnauthorizedCreator
    );

    let now = Clock::get()?.unix_timestamp;
    require!(now > hunt.expires_at, GeoDropError::HuntNotExpired);

    let reclaim_amount = ctx.accounts.vault.amount;
    require!(reclaim_amount > 0, GeoDropError::InsufficientVaultBalance);

    let hunt_id_bytes = hunt.hunt_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"geodrop",
        hunt.creator.as_ref(),
        hunt_id_bytes.as_ref(),
        &[hunt.bump],
    ]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.creator_token_account.to_account_info(),
        authority: hunt.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token_interface::transfer_checked(cpi_ctx, reclaim_amount, ctx.accounts.mint.decimals)?;

    hunt.claims_remaining = 0;

    emit!(GeoDropReclaimed {
        hunt: hunt.key(),
        creator: hunt.creator,
        is_native_sol: false,
        reclaimed_amount: reclaim_amount,
        reclaimed_at: now,
    });

    Ok(())
}

pub fn handle_reclaim_sol_geodrop(ctx: Context<ReclaimSolGeoDrop>) -> Result<()> {
    let hunt = &mut ctx.accounts.hunt;
    require!(hunt.is_native_sol, GeoDropError::AssetTypeMismatch);
    require_keys_eq!(
        ctx.accounts.creator.key(),
        hunt.creator,
        GeoDropError::UnauthorizedCreator
    );

    let now = Clock::get()?.unix_timestamp;
    require!(now > hunt.expires_at, GeoDropError::HuntNotExpired);

    let reclaim_amount = ctx.accounts.sol_vault.lamports();
    require!(reclaim_amount > 0, GeoDropError::InsufficientVaultBalance);

    let hunt_key = hunt.key();
    let sol_vault_seeds: &[&[&[u8]]] = &[&[
        b"geodrop_sol_vault",
        hunt_key.as_ref(),
        &[hunt.vault_bump],
    ]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.sol_vault.to_account_info(),
            to: ctx.accounts.creator.to_account_info(),
        },
        sol_vault_seeds,
    );
    system_program::transfer(cpi_ctx, reclaim_amount)?;

    hunt.claims_remaining = 0;

    emit!(GeoDropReclaimed {
        hunt: hunt.key(),
        creator: hunt.creator,
        is_native_sol: true,
        reclaimed_amount: reclaim_amount,
        reclaimed_at: now,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(hunt_id: u64)]
pub struct CreateTokenGeoDropHunt<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + GeoDropHunt::INIT_SPACE,
        seeds = [b"geodrop", creator.key().as_ref(), &hunt_id.to_le_bytes()],
        bump
    )]
    pub hunt: Account<'info, GeoDropHunt>,

    #[account(
        init,
        payer = creator,
        seeds = [b"geodrop_vault", hunt.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = hunt,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = creator,
        token::token_program = token_program
    )]
    pub creator_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(hunt_id: u64)]
pub struct CreateSolGeoDropHunt<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + GeoDropHunt::INIT_SPACE,
        seeds = [b"geodrop", creator.key().as_ref(), &hunt_id.to_le_bytes()],
        bump
    )]
    pub hunt: Account<'info, GeoDropHunt>,

    /// CHECK: System-owned lamport vault PDA derived strictly from ["geodrop_sol_vault", hunt]
    #[account(
        mut,
        seeds = [b"geodrop_sol_vault", hunt.key().as_ref()],
        bump
    )]
    pub sol_vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimTokenGeoDrop<'info> {
    #[account(mut)]
    pub hunter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"geodrop", hunt.creator.as_ref(), &hunt.hunt_id.to_le_bytes()],
        bump = hunt.bump
    )]
    pub hunt: Account<'info, GeoDropHunt>,

    #[account(address = hunt.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        address = hunt.vault,
        seeds = [b"geodrop_vault", hunt.key().as_ref()],
        bump = hunt.vault_bump,
        token::mint = mint,
        token::authority = hunt,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = hunter,
        token::token_program = token_program
    )]
    pub hunter_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = hunter,
        space = 8 + GeoDropClaimReceipt::INIT_SPACE,
        seeds = [b"geodrop_claim", hunt.key().as_ref(), hunter.key().as_ref()],
        bump
    )]
    pub claim_receipt: Account<'info, GeoDropClaimReceipt>,

    /// CHECK: Verified strictly via address constraint to Solana's Sysvar Instructions account
    #[account(address = SYSVAR_INSTRUCTIONS_ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimSolGeoDrop<'info> {
    #[account(mut)]
    pub hunter: Signer<'info>,

    #[account(
        mut,
        seeds = [b"geodrop", hunt.creator.as_ref(), &hunt.hunt_id.to_le_bytes()],
        bump = hunt.bump
    )]
    pub hunt: Account<'info, GeoDropHunt>,

    /// CHECK: System-owned lamport vault PDA verified by address and PDA seeds
    #[account(
        mut,
        address = hunt.vault,
        seeds = [b"geodrop_sol_vault", hunt.key().as_ref()],
        bump = hunt.vault_bump
    )]
    pub sol_vault: SystemAccount<'info>,

    #[account(
        init,
        payer = hunter,
        space = 8 + GeoDropClaimReceipt::INIT_SPACE,
        seeds = [b"geodrop_claim", hunt.key().as_ref(), hunter.key().as_ref()],
        bump
    )]
    pub claim_receipt: Account<'info, GeoDropClaimReceipt>,

    /// CHECK: Verified strictly via address constraint to Solana's Sysvar Instructions account
    #[account(address = SYSVAR_INSTRUCTIONS_ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReclaimTokenGeoDrop<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        has_one = creator,
        seeds = [b"geodrop", hunt.creator.as_ref(), &hunt.hunt_id.to_le_bytes()],
        bump = hunt.bump
    )]
    pub hunt: Account<'info, GeoDropHunt>,

    #[account(address = hunt.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        address = hunt.vault,
        seeds = [b"geodrop_vault", hunt.key().as_ref()],
        bump = hunt.vault_bump,
        token::mint = mint,
        token::authority = hunt,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = creator,
        token::token_program = token_program
    )]
    pub creator_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ReclaimSolGeoDrop<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        has_one = creator,
        seeds = [b"geodrop", hunt.creator.as_ref(), &hunt.hunt_id.to_le_bytes()],
        bump = hunt.bump
    )]
    pub hunt: Account<'info, GeoDropHunt>,

    /// CHECK: System-owned lamport vault PDA verified by address and PDA seeds
    #[account(
        mut,
        address = hunt.vault,
        seeds = [b"geodrop_sol_vault", hunt.key().as_ref()],
        bump = hunt.vault_bump
    )]
    pub sol_vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}
