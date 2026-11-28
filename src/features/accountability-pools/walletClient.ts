import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import type { TokenType, WalletSession } from '../../types/actake';
import {
  ACTAKE_ESCROW_PROGRAM_ID,
  CONFIGURED_CLIENT_ESCROW_WALLET,
  CONFIGURED_CLIENT_TREASURY_WALLET,
  IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED,
  MEMO_PROGRAM_ID,
  TOKEN_CONFIGS,
  buildDevnetExplorerTxUrl,
  createAssociatedTokenAccountIdempotentInstruction,
  createSplTransferCheckedInstruction,
  deriveAssociatedTokenAddress,
  fetchDevnetTelemetry,
  fetchLatestDevnetBlockhash,
  getTokenProgramIdForToken,
  resolveDirectTransferPlan,
  sha256Bytes,
} from '../../solana/actakeEscrow';
import { ensureMwaRegistered } from '../../solana/registerMwa';
import { signActakeTransaction } from '../../solana/walletManager';
import type { AccountabilityTrackCategory, StepStakeVisibility } from './types';

export interface StepStakeTxExecutionResult {
  signature: string;
  solscanUrl: string;
  explorerUrl: string;
  broadcastedOnChain: boolean;
  onchainMode: 'anchor-cpi' | 'devnet-spl-memo';
}

export interface EphemeralSessionKeyBundle {
  poolId: string;
  delegatePubkey: string;
  /** Stored only in memory / opt-in encrypted Android bridge; strictly scoped to daily check-ins */
  secretKeyBase64: string;
  expiresAtMs: number;
}

const SESSION_KEY_MEMORY_STORE = new Map<string, EphemeralSessionKeyBundle>();

/**
 * Ensures Mobile Wallet Adapter (MWA) + Wallet Standard are initialized for Android Chrome / Seeker APK
 * while remaining seamless on desktop browser wallet extensions (Phantom / Solflare).
 */
export function ensureStepStakeWalletReady(): boolean {
  return ensureMwaRegistered();
}

/**
 * Returns a Solscan Devnet transaction inspection URL for every stake, check-in, slash, and payout.
 */
export function getSolscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

export function getSolscanAccountUrl(address: string): string {
  return `https://solscan.io/account/${encodeURIComponent(address)}?cluster=devnet`;
}

function encodeU64Le(value: number | bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt(Math.max(0, Math.floor(Number(value)))), true);
  return bytes;
}

function encodeI64Le(value: number | bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setBigInt64(0, BigInt(Math.floor(Number(value))), true);
  return bytes;
}

function encodeU16Le(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, Math.max(0, Math.min(65535, Math.floor(value))), true);
  return bytes;
}

function hexTo32Bytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/i, '').padEnd(64, '0').slice(0, 64);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return out;
}

async function anchorDiscriminator(ixName: string): Promise<Uint8Array> {
  const digest = await sha256Bytes(`global:${ixName}`);
  return digest.slice(0, 8);
}

/**
 * Derives exact Anchor PDAs matching programs/actake_escrow/src/step_stake/instructions.rs:
 * - ChallengePool: ["pool", creator, pool_id.to_le_bytes()]
 * - Vault:         ["vault", pool]
 * - Participant:   ["participant", pool, user]
 */
export async function deriveStepStakePdas(params: {
  creatorPubkey: string;
  poolNumericId: number;
  userPubkey?: string;
}): Promise<{
  poolPda: PublicKey;
  vaultPda: PublicKey;
  participantPda: PublicKey | null;
}> {
  const programId = new PublicKey(ACTAKE_ESCROW_PROGRAM_ID);
  const creatorKey = new PublicKey(params.creatorPubkey);
  const poolIdBytes = encodeU64Le(params.poolNumericId);

  const [poolPda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode('pool'), creatorKey.toBytes(), poolIdBytes],
    programId
  );
  const [vaultPda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode('vault'), poolPda.toBytes()],
    programId
  );

  let participantPda: PublicKey | null = null;
  if (params.userPubkey) {
    const userKey = new PublicKey(params.userPubkey);
    const [pPda] = await PublicKey.findProgramAddress(
      [new TextEncoder().encode('participant'), poolPda.toBytes(), userKey.toBytes()],
      programId
    );
    participantPda = pPda;
  }

  return { poolPda, vaultPda, participantPda };
}

function buildMemoInstruction(signer: PublicKey, payload: Record<string, unknown>): TransactionInstruction {
  const text = JSON.stringify(payload);
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: new TextEncoder().encode(text) as unknown as Buffer,
  });
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Creates an opt-in scoped ephemeral session keypair strictly for daily check-ins.
 * Never persisted to localStorage (kept in memory on web; passed to Android EncryptedSharedPreferences
 * when running inside the Seeker Capacitor APK).
 */
export async function createScopedEphemeralSessionKey(
  poolId: string,
  durationDays: number
): Promise<EphemeralSessionKeyBundle> {
  const kp = await Keypair.generate();
  const bundle: EphemeralSessionKeyBundle = {
    poolId,
    delegatePubkey: kp.publicKey.toBase58(),
    secretKeyBase64: uint8ToBase64(kp.secretKey),
    expiresAtMs: Date.now() + Math.max(1, durationDays) * 86_400_000,
  };
  SESSION_KEY_MEMORY_STORE.set(poolId, bundle);
  return bundle;
}

export function getScopedEphemeralSessionKey(poolId: string): EphemeralSessionKeyBundle | null {
  const existing = SESSION_KEY_MEMORY_STORE.get(poolId);
  if (!existing) return null;
  if (existing.expiresAtMs <= Date.now()) {
    SESSION_KEY_MEMORY_STORE.delete(poolId);
    return null;
  }
  return existing;
}

export function revokeScopedEphemeralSessionKey(poolId: string): void {
  SESSION_KEY_MEMORY_STORE.delete(poolId);
}

async function appendEscrowStakeTransferInstructions(params: {
  tx: Transaction;
  payer: PublicKey;
  tokenSymbol: TokenType;
  stakeAmount: number;
  escrowWallet?: string | null;
}): Promise<{ settledAsset?: 'USDC' | 'SOL'; settledAmount?: number; destination?: string }> {
  const targetEscrowStr = params.escrowWallet || CONFIGURED_CLIENT_ESCROW_WALLET;
  if (!targetEscrowStr) {
    return {};
  }

  let usdcBalance: number | null = null;
  let solBalance: number | null = null;
  let solPriceUsd: number | null = null;
  try {
    const telemetry = await fetchDevnetTelemetry(params.payer.toBase58());
    usdcBalance = telemetry.usdcBalance;
    solBalance = telemetry.solBalance;
    solPriceUsd = telemetry.solPriceUsd;
  } catch {
    // Allow plan resolution with fallback SOL rate if balance snapshot fails
  }

  const plan = resolveDirectTransferPlan({
    token: params.tokenSymbol,
    usdAmount: params.stakeAmount,
    destination: targetEscrowStr,
    usdcBalance,
    solBalance,
    solPriceUsd,
  });

  const destOwner = new PublicKey(plan.destination);
  if (plan.asset === 'USDC' && plan.baseUnits && plan.baseUnits > 0n) {
    const mintKey = new PublicKey(plan.mint || TOKEN_CONFIGS.USDC.mint);
    const decimals = plan.decimals ?? TOKEN_CONFIGS.USDC.decimals;
    const [sourceAta, destAta] = await Promise.all([
      deriveAssociatedTokenAddress(params.payer, mintKey),
      deriveAssociatedTokenAddress(destOwner, mintKey),
    ]);
    params.tx.add(
      createAssociatedTokenAccountIdempotentInstruction(params.payer, destAta, destOwner, mintKey)
    );
    params.tx.add(
      createSplTransferCheckedInstruction(
        sourceAta,
        mintKey,
        destAta,
        params.payer,
        plan.baseUnits,
        decimals
      )
    );
  } else if (plan.lamports && plan.lamports > 0) {
    params.tx.add(
      SystemProgram.transfer({
        fromPubkey: params.payer,
        toPubkey: destOwner,
        lamports: plan.lamports,
      })
    );
  }

  return {
    settledAsset: plan.asset,
    settledAmount: plan.displayAmount,
    destination: plan.destination,
  };
}

/**
 * Executes `create_challenge_pool` via Anchor CPI when deployed, OR transfers the creator's
 * real Devnet SPL USDC / SOL stake into escrow alongside a verifiable Memo carrying ChallengePool parameters.
 */
export async function executeCreateChallengePoolTx(params: {
  wallet: WalletSession;
  poolNumericId: number;
  category: AccountabilityTrackCategory;
  visibility: StepStakeVisibility;
  tokenSymbol: TokenType;
  stakeAmount: number;
  targetMetric: number;
  durationDays: number;
  skrMultiplierBps: number;
  title: string;
  escrowWallet?: string | null;
  treasuryWallet?: string | null;
  autoJoinCreator?: boolean;
  sessionDelegatePubkey?: string | null;
}): Promise<StepStakeTxExecutionResult & { poolPda: string; vaultPda: string }> {
  ensureStepStakeWalletReady();
  const creatorKey = new PublicKey(params.wallet.publicKey);
  const { poolPda, vaultPda, participantPda } = await deriveStepStakePdas({
    creatorPubkey: params.wallet.publicKey,
    poolNumericId: params.poolNumericId,
    userPubkey: params.wallet.publicKey,
  });
  const mintCfg = TOKEN_CONFIGS[params.tokenSymbol];
  const mintKey = new PublicKey(mintCfg.mint);
  const tokenProgramId = getTokenProgramIdForToken(params.tokenSymbol);
  const stakeBaseUnits = Math.round(params.stakeAmount * Math.pow(10, mintCfg.decimals));
  const startTs = Math.floor(Date.now() / 1000);
  const recentBlockhash = await fetchLatestDevnetBlockhash();

  const tx = new Transaction({
    feePayer: creatorKey,
    recentBlockhash: recentBlockhash as NonNullable<Transaction['recentBlockhash']>,
  });
  const useAnchorCpi = IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED;

  if (useAnchorCpi) {
    const treasuryStr =
      params.treasuryWallet || CONFIGURED_CLIENT_TREASURY_WALLET || params.wallet.publicKey;
    const treasuryKey = new PublicKey(treasuryStr);
    const visibilityByte = params.visibility === 'community' ? 1 : 0;
    const clampedDays = Math.max(1, Math.min(365, Math.floor(params.durationDays)));

    // 78 bytes: disc[8] + pool_id(u64)[8] + category(u8)[1] + visibility(u8)[1] +
    // treasury(Pubkey)[32] + stake_amount(u64)[8] + target_metric(u64)[8] +
    // duration_days(u16)[2] + start_timestamp(i64)[8] + skr_multiplier_bps(u16)[2]
    const disc = await anchorDiscriminator('create_challenge_pool');
    const data = new Uint8Array(8 + 8 + 1 + 1 + 32 + 8 + 8 + 2 + 8 + 2);
    let offset = 0;
    data.set(disc, offset); offset += 8;
    data.set(encodeU64Le(params.poolNumericId), offset); offset += 8;
    data[offset] = params.category; offset += 1;
    data[offset] = visibilityByte; offset += 1;
    data.set(treasuryKey.toBytes(), offset); offset += 32;
    data.set(encodeU64Le(stakeBaseUnits), offset); offset += 8;
    data.set(encodeU64Le(params.targetMetric), offset); offset += 8;
    data.set(encodeU16Le(clampedDays), offset); offset += 2;
    data.set(encodeI64Le(startTs), offset); offset += 8;
    data.set(encodeU16Le(params.skrMultiplierBps), offset);

    tx.add(
      new TransactionInstruction({
        programId: new PublicKey(ACTAKE_ESCROW_PROGRAM_ID),
        keys: [
          { pubkey: creatorKey, isSigner: true, isWritable: true },
          { pubkey: mintKey, isSigner: false, isWritable: false },
          { pubkey: poolPda, isSigner: false, isWritable: true },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: tokenProgramId, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: data as unknown as Buffer,
      })
    );

    // Atomically lock creator's stake in the same transaction when autoJoinCreator is enabled
    if (params.autoJoinCreator !== false && participantPda) {
      const creatorAta = await deriveAssociatedTokenAddress(creatorKey, mintKey, tokenProgramId);
      const joinDisc = await anchorDiscriminator('join_pool_and_stake');
      const hasDelegate = Boolean(params.sessionDelegatePubkey);
      const joinData = new Uint8Array(8 + 1 + (hasDelegate ? 32 : 0));
      joinData.set(joinDisc, 0);
      joinData[8] = hasDelegate ? 1 : 0;
      if (hasDelegate && params.sessionDelegatePubkey) {
        joinData.set(new PublicKey(params.sessionDelegatePubkey).toBytes(), 9);
      }

      tx.add(
        new TransactionInstruction({
          programId: new PublicKey(ACTAKE_ESCROW_PROGRAM_ID),
          keys: [
            { pubkey: creatorKey, isSigner: true, isWritable: true },
            { pubkey: poolPda, isSigner: false, isWritable: true },
            { pubkey: mintKey, isSigner: false, isWritable: false },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: creatorAta, isSigner: false, isWritable: true },
            { pubkey: participantPda, isSigner: false, isWritable: true },
            { pubkey: tokenProgramId, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: joinData as unknown as Buffer,
        })
      );
    }
  } else {
    let transferMeta: { settledAsset?: 'USDC' | 'SOL'; settledAmount?: number; destination?: string } = {};
    if (params.autoJoinCreator !== false) {
      transferMeta = await appendEscrowStakeTransferInstructions({
        tx,
        payer: creatorKey,
        tokenSymbol: params.tokenSymbol,
        stakeAmount: params.stakeAmount,
        escrowWallet: params.escrowWallet,
      });
    }

    tx.add(
      buildMemoInstruction(creatorKey, {
        app: 'actake-step-stake',
        ix: 'create_challenge_pool',
        vis: params.visibility,
        poolId: params.poolNumericId,
        poolPda: poolPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        cat: params.category,
        token: params.tokenSymbol,
        stake: params.stakeAmount,
        target: params.targetMetric,
        days: params.durationDays,
        bps: params.skrMultiplierBps,
        ...(transferMeta.settledAsset
          ? {
              settledAsset: transferMeta.settledAsset,
              settledAmount: transferMeta.settledAmount,
              escrow: transferMeta.destination,
            }
          : {}),
      })
    );
  }

  const signed = await signActakeTransaction(tx, params.wallet, { requireBroadcast: true });
  return {
    signature: signed.signature,
    solscanUrl: getSolscanTxUrl(signed.signature),
    explorerUrl: signed.explorerUrl || buildDevnetExplorerTxUrl(signed.signature),
    broadcastedOnChain: signed.broadcastedOnChain,
    onchainMode: useAnchorCpi ? 'anchor-cpi' : 'devnet-spl-memo',
    poolPda: poolPda.toBase58(),
    vaultPda: vaultPda.toBase58(),
  };
}

/**
 * Executes `join_pool_and_stake` via Anchor CPI when deployed, OR executes a real Devnet SPL USDC / SOL
 * stake transfer into the configured escrow wallet + on-chain Memo receipt verified on Solana Devnet.
 */
export async function executeJoinPoolAndStakeTx(params: {
  wallet: WalletSession;
  poolId: string;
  creatorPubkey: string;
  poolNumericId: number;
  tokenSymbol: TokenType;
  stakeAmount: number;
  escrowWallet?: string | null;
  sessionDelegatePubkey?: string | null;
}): Promise<StepStakeTxExecutionResult> {
  ensureStepStakeWalletReady();
  const userKey = new PublicKey(params.wallet.publicKey);
  const { poolPda, vaultPda, participantPda } = await deriveStepStakePdas({
    creatorPubkey: params.creatorPubkey,
    poolNumericId: params.poolNumericId,
    userPubkey: params.wallet.publicKey,
  });
  const mintCfg = TOKEN_CONFIGS[params.tokenSymbol];
  const mintKey = new PublicKey(mintCfg.mint);
  const recentBlockhash = await fetchLatestDevnetBlockhash();

  const tx = new Transaction({
    feePayer: userKey,
    recentBlockhash: recentBlockhash as NonNullable<Transaction['recentBlockhash']>,
  });
  const useAnchorCpi = IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED;

  if (useAnchorCpi && participantPda) {
    const tokenProgramId = getTokenProgramIdForToken(params.tokenSymbol);
    const userAta = await deriveAssociatedTokenAddress(userKey, mintKey, tokenProgramId);
    const disc = await anchorDiscriminator('join_pool_and_stake');
    const hasDelegate = Boolean(params.sessionDelegatePubkey);
    const data = new Uint8Array(8 + 1 + (hasDelegate ? 32 : 0));
    data.set(disc, 0);
    data[8] = hasDelegate ? 1 : 0;
    if (hasDelegate && params.sessionDelegatePubkey) {
      data.set(new PublicKey(params.sessionDelegatePubkey).toBytes(), 9);
    }

    tx.add(
      new TransactionInstruction({
        programId: new PublicKey(ACTAKE_ESCROW_PROGRAM_ID),
        keys: [
          { pubkey: userKey, isSigner: true, isWritable: true },
          { pubkey: poolPda, isSigner: false, isWritable: true },
          { pubkey: mintKey, isSigner: false, isWritable: false },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: userAta, isSigner: false, isWritable: true },
          { pubkey: participantPda, isSigner: false, isWritable: true },
          { pubkey: tokenProgramId, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: data as unknown as Buffer,
      })
    );
  } else {
    const transferMeta = await appendEscrowStakeTransferInstructions({
      tx,
      payer: userKey,
      tokenSymbol: params.tokenSymbol,
      stakeAmount: params.stakeAmount,
      escrowWallet: params.escrowWallet,
    });

    tx.add(
      buildMemoInstruction(userKey, {
        app: 'actake-step-stake',
        ix: 'join_pool_and_stake',
        poolId: params.poolId,
        poolPda: poolPda.toBase58(),
        token: params.tokenSymbol,
        stake: params.stakeAmount,
        delegate: params.sessionDelegatePubkey || null,
        ...(transferMeta.settledAsset
          ? {
              settledAsset: transferMeta.settledAsset,
              settledAmount: transferMeta.settledAmount,
              escrow: transferMeta.destination,
            }
          : {}),
      })
    );
  }

  const signed = await signActakeTransaction(tx, params.wallet, { requireBroadcast: true });
  return {
    signature: signed.signature,
    solscanUrl: getSolscanTxUrl(signed.signature),
    explorerUrl: signed.explorerUrl || buildDevnetExplorerTxUrl(signed.signature),
    broadcastedOnChain: signed.broadcastedOnChain,
    onchainMode: useAnchorCpi ? 'anchor-cpi' : 'devnet-spl-memo',
  };
}

/**
 * Executes `submit_daily_checkin(day_index, metric_achieved, proof_hash)` via Anchor CPI
 * or live Devnet Memo transaction embedding the 32-byte SHA-256 `proof_hash` for Solscan audit.
 */
export async function executeSubmitDailyCheckinTx(params: {
  wallet: WalletSession;
  poolId: string;
  creatorPubkey: string;
  poolNumericId: number;
  dayIndex: number;
  metricAchieved: number;
  proofHash: string;
}): Promise<StepStakeTxExecutionResult> {
  ensureStepStakeWalletReady();
  const userKey = new PublicKey(params.wallet.publicKey);
  const { poolPda, participantPda } = await deriveStepStakePdas({
    creatorPubkey: params.creatorPubkey,
    poolNumericId: params.poolNumericId,
    userPubkey: params.wallet.publicKey,
  });
  const recentBlockhash = await fetchLatestDevnetBlockhash();
  const tx = new Transaction({
    feePayer: userKey,
    recentBlockhash: recentBlockhash as NonNullable<Transaction['recentBlockhash']>,
  });
  const useAnchorCpi = IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED;

  if (useAnchorCpi && participantPda) {
    // 50 bytes: disc[8] + day_index(u16 LE)[2] + metric_achieved(u64 LE)[8] + proof_hash[32]
    const disc = await anchorDiscriminator('submit_daily_checkin');
    const data = new Uint8Array(8 + 2 + 8 + 32);
    data.set(disc, 0);
    data.set(encodeU16Le(Math.max(1, Math.min(365, Math.floor(params.dayIndex)))), 8);
    data.set(encodeU64Le(params.metricAchieved), 10);
    data.set(hexTo32Bytes(params.proofHash), 18);

    tx.add(
      new TransactionInstruction({
        programId: new PublicKey(ACTAKE_ESCROW_PROGRAM_ID),
        keys: [
          { pubkey: userKey, isSigner: true, isWritable: false },
          { pubkey: poolPda, isSigner: false, isWritable: false },
          { pubkey: participantPda, isSigner: false, isWritable: true },
        ],
        data: data as unknown as Buffer,
      })
    );
  } else {
    tx.add(
      buildMemoInstruction(userKey, {
        app: 'actake-step-stake',
        ix: 'submit_daily_checkin',
        poolId: params.poolId,
        day: params.dayIndex,
        metric: Math.round(params.metricAchieved),
        proofHash: params.proofHash,
      })
    );
  }

  const signed = await signActakeTransaction(tx, params.wallet, { requireBroadcast: true });
  return {
    signature: signed.signature,
    solscanUrl: getSolscanTxUrl(signed.signature),
    explorerUrl: signed.explorerUrl || buildDevnetExplorerTxUrl(signed.signature),
    broadcastedOnChain: signed.broadcastedOnChain,
    onchainMode: useAnchorCpi ? 'anchor-cpi' : 'devnet-spl-memo',
  };
}

/**
 * Permissionless crank executing `mark_quitter_slashed(day_index: u16)` on-chain for Public pools.
 */
export async function executeMarkQuitterSlashedTx(params: {
  wallet: WalletSession;
  poolId: string;
  creatorPubkey: string;
  poolNumericId: number;
  targetWalletPubkey: string;
  dayIndex: number;
}): Promise<StepStakeTxExecutionResult> {
  ensureStepStakeWalletReady();
  const crankCallerKey = new PublicKey(params.wallet.publicKey);
  const { poolPda, participantPda } = await deriveStepStakePdas({
    creatorPubkey: params.creatorPubkey,
    poolNumericId: params.poolNumericId,
    userPubkey: params.targetWalletPubkey,
  });
  const recentBlockhash = await fetchLatestDevnetBlockhash();
  const tx = new Transaction({
    feePayer: crankCallerKey,
    recentBlockhash: recentBlockhash as NonNullable<Transaction['recentBlockhash']>,
  });
  const useAnchorCpi = IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED;

  if (useAnchorCpi && participantPda) {
    // 10 bytes: disc[8] + day_index(u16 LE)[2]
    const disc = await anchorDiscriminator('mark_quitter_slashed');
    const data = new Uint8Array(10);
    data.set(disc, 0);
    data.set(encodeU16Le(Math.max(1, Math.min(365, Math.floor(params.dayIndex)))), 8);

    tx.add(
      new TransactionInstruction({
        programId: new PublicKey(ACTAKE_ESCROW_PROGRAM_ID),
        keys: [
          { pubkey: crankCallerKey, isSigner: true, isWritable: false },
          { pubkey: poolPda, isSigner: false, isWritable: true },
          { pubkey: participantPda, isSigner: false, isWritable: true },
        ],
        data: data as unknown as Buffer,
      })
    );
  } else {
    tx.add(
      buildMemoInstruction(crankCallerKey, {
        app: 'actake-step-stake',
        ix: 'mark_quitter_slashed',
        poolId: params.poolId,
        slashedUser: params.targetWalletPubkey,
        missedDay: params.dayIndex,
      })
    );
  }

  const signed = await signActakeTransaction(tx, params.wallet, { requireBroadcast: true });
  return {
    signature: signed.signature,
    solscanUrl: getSolscanTxUrl(signed.signature),
    explorerUrl: signed.explorerUrl || buildDevnetExplorerTxUrl(signed.signature),
    broadcastedOnChain: signed.broadcastedOnChain,
    onchainMode: useAnchorCpi ? 'anchor-cpi' : 'devnet-spl-memo',
  };
}

/**
 * Executes `slash_solo_challenge_day(day_index: u16)` for a private Solo Track Pool.
 * On-chain contract sends 50% to Treasury + 50% back to owner for 1-day ("Once") pools,
 * or strictly that day's daily ratio to Treasury for multi-day pools.
 */
export async function executeSlashSoloChallengeDayTx(params: {
  wallet: WalletSession;
  poolId: string;
  creatorPubkey: string;
  poolNumericId: number;
  tokenSymbol: TokenType;
  dayIndex: number;
  treasuryWallet?: string | null;
}): Promise<StepStakeTxExecutionResult> {
  ensureStepStakeWalletReady();
  const callerKey = new PublicKey(params.wallet.publicKey);
  const { poolPda, vaultPda, participantPda } = await deriveStepStakePdas({
    creatorPubkey: params.creatorPubkey,
    poolNumericId: params.poolNumericId,
    userPubkey: params.creatorPubkey,
  });
  const mintCfg = TOKEN_CONFIGS[params.tokenSymbol];
  const mintKey = new PublicKey(mintCfg.mint);
  const tokenProgramId = getTokenProgramIdForToken(params.tokenSymbol);
  const recentBlockhash = await fetchLatestDevnetBlockhash();
  const tx = new Transaction({
    feePayer: callerKey,
    recentBlockhash: recentBlockhash as NonNullable<Transaction['recentBlockhash']>,
  });
  const useAnchorCpi = IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED;

  if (useAnchorCpi && participantPda) {
    const treasuryStr =
      params.treasuryWallet || CONFIGURED_CLIENT_TREASURY_WALLET || params.wallet.publicKey;
    const treasuryKey = new PublicKey(treasuryStr);
    const ownerKey = new PublicKey(params.creatorPubkey);
    const [treasuryAta, ownerAta] = await Promise.all([
      deriveAssociatedTokenAddress(treasuryKey, mintKey, tokenProgramId),
      deriveAssociatedTokenAddress(ownerKey, mintKey, tokenProgramId),
    ]);

    const disc = await anchorDiscriminator('slash_solo_challenge_day');
    const data = new Uint8Array(10);
    data.set(disc, 0);
    data.set(encodeU16Le(Math.max(1, Math.min(365, Math.floor(params.dayIndex)))), 8);

    tx.add(
      new TransactionInstruction({
        programId: new PublicKey(ACTAKE_ESCROW_PROGRAM_ID),
        keys: [
          { pubkey: callerKey, isSigner: true, isWritable: false },
          { pubkey: poolPda, isSigner: false, isWritable: true },
          { pubkey: mintKey, isSigner: false, isWritable: false },
          { pubkey: vaultPda, isSigner: false, isWritable: true },
          { pubkey: treasuryAta, isSigner: false, isWritable: true },
          { pubkey: ownerAta, isSigner: false, isWritable: true },
          { pubkey: participantPda, isSigner: false, isWritable: true },
          { pubkey: tokenProgramId, isSigner: false, isWritable: false },
        ],
        data: data as unknown as Buffer,
      })
    );
  } else {
    tx.add(
      buildMemoInstruction(callerKey, {
        app: 'actake-step-stake',
        ix: 'slash_solo_challenge_day',
        poolId: params.poolId,
        missedDay: params.dayIndex,
      })
    );
  }

  const signed = await signActakeTransaction(tx, params.wallet, { requireBroadcast: true });
  return {
    signature: signed.signature,
    solscanUrl: getSolscanTxUrl(signed.signature),
    explorerUrl: signed.explorerUrl || buildDevnetExplorerTxUrl(signed.signature),
    broadcastedOnChain: signed.broadcastedOnChain,
    onchainMode: useAnchorCpi ? 'anchor-cpi' : 'devnet-spl-memo',
  };
}

/**
 * Executes `claim_daily_challenge_payout(day_index: u16)` when `dayIndex` is supplied,
 * or final `settle_and_claim_challenge` when settling the entire completed pool.
 */
export async function executeSettleAndClaimTx(params: {
  wallet: WalletSession;
  poolId: string;
  creatorPubkey: string;
  poolNumericId: number;
  tokenSymbol: TokenType;
  estimatedPayout: number;
  dayIndex?: number;
  totalDays?: number;
}): Promise<StepStakeTxExecutionResult> {
  ensureStepStakeWalletReady();
  const userKey = new PublicKey(params.wallet.publicKey);
  const { poolPda, vaultPda, participantPda } = await deriveStepStakePdas({
    creatorPubkey: params.creatorPubkey,
    poolNumericId: params.poolNumericId,
    userPubkey: params.wallet.publicKey,
  });
  const mintCfg = TOKEN_CONFIGS[params.tokenSymbol];
  const mintKey = new PublicKey(mintCfg.mint);
  const tokenProgramId = getTokenProgramIdForToken(params.tokenSymbol);
  const recentBlockhash = await fetchLatestDevnetBlockhash();
  const tx = new Transaction({
    feePayer: userKey,
    recentBlockhash: recentBlockhash as NonNullable<Transaction['recentBlockhash']>,
  });
  const useAnchorCpi = IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED;

  if (useAnchorCpi && participantPda) {
    const userAta = await deriveAssociatedTokenAddress(userKey, mintKey, tokenProgramId);
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        userKey,
        userAta,
        userKey,
        mintKey,
        tokenProgramId
      )
    );

    if (typeof params.dayIndex === 'number' && Number.isFinite(params.dayIndex) && params.dayIndex >= 1) {
      // 10 bytes: disc[8] + day_index(u16 LE)[2]
      const disc = await anchorDiscriminator('claim_daily_challenge_payout');
      const data = new Uint8Array(10);
      data.set(disc, 0);
      data.set(encodeU16Le(Math.max(1, Math.min(365, Math.floor(params.dayIndex)))), 8);

      tx.add(
        new TransactionInstruction({
          programId: new PublicKey(ACTAKE_ESCROW_PROGRAM_ID),
          keys: [
            { pubkey: userKey, isSigner: true, isWritable: true },
            { pubkey: poolPda, isSigner: false, isWritable: true },
            { pubkey: mintKey, isSigner: false, isWritable: false },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: userAta, isSigner: false, isWritable: true },
            { pubkey: participantPda, isSigner: false, isWritable: true },
            { pubkey: tokenProgramId, isSigner: false, isWritable: false },
          ],
          data: data as unknown as Buffer,
        })
      );
    } else {
      const disc = await anchorDiscriminator('settle_and_claim_challenge');
      tx.add(
        new TransactionInstruction({
          programId: new PublicKey(ACTAKE_ESCROW_PROGRAM_ID),
          keys: [
            { pubkey: userKey, isSigner: true, isWritable: true },
            { pubkey: poolPda, isSigner: false, isWritable: true },
            { pubkey: mintKey, isSigner: false, isWritable: false },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: userAta, isSigner: false, isWritable: true },
            { pubkey: participantPda, isSigner: false, isWritable: true },
            { pubkey: tokenProgramId, isSigner: false, isWritable: false },
          ],
          data: disc as unknown as Buffer,
        })
      );
    }
  } else {
    tx.add(
      buildMemoInstruction(userKey, {
        app: 'actake-step-stake',
        ix: params.dayIndex ? 'claim_daily_challenge_payout' : 'settle_and_claim_challenge',
        poolId: params.poolId,
        token: params.tokenSymbol,
        payout: Number(params.estimatedPayout.toFixed(2)),
        ...(params.dayIndex ? { day: params.dayIndex, totalDays: params.totalDays ?? params.dayIndex } : {}),
      })
    );
  }

  const signed = await signActakeTransaction(tx, params.wallet, { requireBroadcast: true });
  return {
    signature: signed.signature,
    solscanUrl: getSolscanTxUrl(signed.signature),
    explorerUrl: signed.explorerUrl || buildDevnetExplorerTxUrl(signed.signature),
    broadcastedOnChain: signed.broadcastedOnChain,
    onchainMode: useAnchorCpi ? 'anchor-cpi' : 'devnet-spl-memo',
  };
}
