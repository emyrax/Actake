import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import type { TokenType } from '../types/actake.ts';

const DEFAULT_SOLANA_RPC_URL = 'https://api.devnet.solana.com';
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const USDC_DEVNET_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const USDC_DECIMALS = 6;
const LAMPORTS_PER_SOL = 1_000_000_000;
const MIN_ESCROW_SOL_RESERVE_LAMPORTS = 2_000_000; // 0.002 SOL gas reserve

const BASE58_SIG_REGEX = /^[1-9A-HJ-NP-Za-km-z]{64,100}$/;

/**
 * In-memory replay protection ledger (consumed Solana tx signatures -> bound context key)
 * and daily claim idempotency lock (`claimSlotKey` -> cached receipt metadata).
 */
const consumedTxSignatures = new Map<string, string>();
const consumedClaimSlots = new Map<
  string,
  {
    claimTxSignature: string;
    payoutTxSignature: string | null;
    payoutStatus: EscrowPayoutStatus;
    recordedAt: string;
  }
>();

export type EscrowPayoutStatus =
  | 'disbursed'
  | 'claim_verified_escrow_unconfigured'
  | 'escrow_insufficient_funds';

export interface OnChainTxVerificationResult {
  verified: boolean;
  signature: string;
  slot: number | null;
  confirmationStatus: 'processed' | 'confirmed' | 'finalized';
  signers: string[];
  feePayer: string | null;
  solscanUrl: string;
  explorerUrl: string;
}

export interface EscrowDisbursementResult {
  configured: boolean;
  status: EscrowPayoutStatus;
  escrowPubkey: string | null;
  payoutTxSignature: string | null;
  payoutSolscanUrl: string | null;
  payoutExplorerUrl: string | null;
  settledAsset?: 'USDC' | 'SOL';
  settledAmount?: number;
  detail: string;
}

export function buildSolscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

export function buildExplorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL?.trim() || DEFAULT_SOLANA_RPC_URL;
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const resp = await fetch(getRpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Solana RPC HTTP ${resp.status}: ${text.slice(0, 160)}`);
  }
  const parsed = JSON.parse(text) as { result?: T; error?: { message?: string } };
  if (parsed.error) {
    throw new Error(parsed.error.message || `Solana RPC ${method} error`);
  }
  return parsed.result as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verifies a transaction signature directly against Solana Devnet RPC:
 * 1. Validates strict Base58 signature format.
 * 2. Confirms transaction exists on-chain with `err === null` (retries briefly for fresh broadcasts).
 * 3. When `allowedSigners` is provided, verifies at least one expected signer signed the tx.
 */
export async function verifySolanaTransactionOnChain(params: {
  signature: string;
  allowedSigners?: string[];
  actionLabel?: string;
}): Promise<OnChainTxVerificationResult> {
  const sig = String(params.signature || '').trim();
  const label = params.actionLabel || 'Solana transaction';

  if (!BASE58_SIG_REGEX.test(sig)) {
    throw new Error(
      `${label} requires a real confirmed Solana transaction signature. Connect a funded Solana wallet and sign on-chain.`
    );
  }

  const normalizedAllowed = (params.allowedSigners || [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let statusEntry: {
    slot?: number;
    err?: unknown;
    confirmationStatus?: 'processed' | 'confirmed' | 'finalized';
  } | null = null;
  let txEntry: {
    slot?: number;
    meta?: { err?: unknown };
    transaction?: {
      message?: {
        accountKeys?: Array<string | { pubkey?: string; signer?: boolean }>;
      };
    };
  } | null = null;

  // Retry up to 4 times (~3.5s window) so freshly-broadcast wallet signatures finish indexing on Devnet RPC
  for (let attempt = 0; attempt < 4; attempt++) {
    const [statusRes, txRes] = await Promise.all([
      rpcCall<{
        value?: Array<{
          slot?: number;
          err?: unknown;
          confirmationStatus?: 'processed' | 'confirmed' | 'finalized';
        } | null>;
      }>('getSignatureStatuses', [[sig], { searchTransactionHistory: true }]).catch(() => null),
      rpcCall<{
        slot?: number;
        meta?: { err?: unknown };
        transaction?: {
          message?: {
            accountKeys?: Array<string | { pubkey?: string; signer?: boolean }>;
          };
        };
      } | null>('getTransaction', [
        sig,
        {
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        },
      ]).catch(() => null),
    ]);

    statusEntry = statusRes?.value?.[0] ?? null;
    txEntry = txRes ?? null;

    if (txEntry && (statusEntry || txEntry.slot)) {
      break;
    }
    if (statusEntry && !txEntry && attempt < 3) {
      await sleep(850);
      continue;
    }
    if (!statusEntry && !txEntry && attempt < 3) {
      await sleep(900);
      continue;
    }
  }

  if (!statusEntry && !txEntry) {
    throw new Error(
      `${label} was not found on Solana Devnet (${sig.slice(0, 14)}...). Make sure your wallet is on Devnet with SOL for gas and try again.`
    );
  }

  const onChainErr = txEntry?.meta?.err ?? statusEntry?.err ?? null;
  if (onChainErr !== null && onChainErr !== undefined) {
    throw new Error(
      `${label} failed on Solana Devnet (${typeof onChainErr === 'string' ? onChainErr : JSON.stringify(onChainErr)}).`
    );
  }

  const rawKeys = txEntry?.transaction?.message?.accountKeys || [];
  const signers: string[] = [];
  let feePayer: string | null = null;

  rawKeys.forEach((entry, idx) => {
    const pubkey = typeof entry === 'string' ? entry : entry?.pubkey || '';
    if (!pubkey) return;
    if (idx === 0) feePayer = pubkey;
    if (typeof entry === 'string') {
      if (idx === 0) signers.push(pubkey);
    } else if (entry?.signer || idx === 0) {
      signers.push(pubkey);
    }
  });

  if (normalizedAllowed.length > 0 && signers.length > 0) {
    const matched = normalizedAllowed.some((allowed) => signers.includes(allowed));
    if (!matched) {
      throw new Error(
        `${label} signer mismatch on Solana Devnet. Expected signature from ${normalizedAllowed[0].slice(0, 6)}...`
      );
    }
  }

  return {
    verified: true,
    signature: sig,
    slot: txEntry?.slot ?? statusEntry?.slot ?? null,
    confirmationStatus: statusEntry?.confirmationStatus || 'confirmed',
    signers,
    feePayer,
    solscanUrl: buildSolscanTxUrl(sig),
    explorerUrl: buildExplorerTxUrl(sig),
  };
}

/**
 * Prevents replaying a single Solana transaction signature across multiple stakes, check-ins, or claims.
 */
export function assertAndConsumeTxSignature(signature: string, contextKey: string): void {
  const sig = signature.trim();
  const existing = consumedTxSignatures.get(sig);
  if (existing && existing !== contextKey) {
    throw new Error(
      'This Solana transaction signature has already been used for another action. Please sign a fresh transaction.'
    );
  }
  consumedTxSignatures.set(sig, contextKey);
}

export function getExistingClaimSlot(claimSlotKey: string) {
  return consumedClaimSlots.get(claimSlotKey) || null;
}

export function markClaimSlotConsumed(
  claimSlotKey: string,
  entry: {
    claimTxSignature: string;
    payoutTxSignature: string | null;
    payoutStatus: EscrowPayoutStatus;
  }
): void {
  consumedClaimSlots.set(claimSlotKey, {
    ...entry,
    recordedAt: new Date().toISOString(),
  });
}

/**
 * Parses server-only `ACTAKE_ESCROW_SECRET_KEY` (JSON 64-byte array, Base58 secret key, or 64-char hex seed).
 * Strictly server-side; never exposed to clients or logged.
 */
function parseEscrowSecretKeypair(): Keypair | null {
  const raw = process.env.ACTAKE_ESCROW_SECRET_KEY?.trim();
  if (!raw) return null;

  try {
    // 1. JSON byte array e.g. "[12,34,...]"
    if (raw.startsWith('[')) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr) && arr.length === 64) {
        return Keypair.fromSecretKey(Uint8Array.from(arr.map((n) => Number(n) & 0xff)));
      }
      if (Array.isArray(arr) && arr.length === 32) {
        return Keypair.fromSeed(Uint8Array.from(arr.map((n) => Number(n) & 0xff)));
      }
    }

    // 2. 64-char hex 32-byte seed
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      const seed = Buffer.from(raw, 'hex');
      return Keypair.fromSeed(new Uint8Array(seed));
    }

    // 3. Base58 64-byte secret key (or 32-byte seed)
    const decoded = bs58.decode(raw);
    if (decoded.length === 64) {
      return Keypair.fromSecretKey(decoded);
    }
    if (decoded.length === 32) {
      return Keypair.fromSeed(decoded);
    }
  } catch {
    return null;
  }

  return null;
}

export function getServerEscrowDisbursementStatus(): {
  configured: boolean;
  escrowSignerPubkey: string | null;
} {
  const kp = parseEscrowSecretKeypair();
  return {
    configured: Boolean(kp),
    escrowSignerPubkey: kp ? kp.publicKey.toBase58() : null,
  };
}

async function deriveAta(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
  const [ata] = await PublicKey.findProgramAddress(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

function buildCreateAtaIdempotentIx(
  payer: PublicKey,
  ata: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function buildSplTransferCheckedIx(
  sourceAta: PublicKey,
  mint: PublicKey,
  destAta: PublicKey,
  owner: PublicKey,
  amountBaseUnits: bigint,
  decimals: number
): TransactionInstruction {
  const data = new Uint8Array(10);
  const view = new DataView(data.buffer);
  view.setUint8(0, 12);
  view.setBigUint64(1, amountBaseUnits, true);
  view.setUint8(9, decimals & 0xff);

  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: sourceAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destAta, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

async function fetchEscrowUsdcBalance(ownerPubkey: string): Promise<number> {
  try {
    const resp = await rpcCall<{
      value?: Array<{
        account?: {
          data?: {
            parsed?: {
              info?: { tokenAmount?: { uiAmount?: number | null; uiAmountString?: string } };
            };
          };
        };
      }>;
    }>('getTokenAccountsByOwner', [
      ownerPubkey,
      { mint: USDC_DEVNET_MINT.toBase58() },
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]);
    let total = 0;
    for (const acc of resp?.value || []) {
      const ta = acc.account?.data?.parsed?.info?.tokenAmount;
      if (typeof ta?.uiAmount === 'number' && Number.isFinite(ta.uiAmount)) {
        total += ta.uiAmount;
      } else if (typeof ta?.uiAmountString === 'string') {
        const parsed = Number.parseFloat(ta.uiAmountString);
        if (Number.isFinite(parsed)) total += parsed;
      }
    }
    return Number(total.toFixed(6));
  } catch {
    return 0;
  }
}

/**
 * Signs and broadcasts a real Solana Devnet payout from the server escrow wallet to the winning user
 * when `ACTAKE_ESCROW_SECRET_KEY` is configured in `process.env`.
 */
export async function disburseEscrowRewardOnChain(params: {
  recipientPubkey: string;
  usdAmount: number;
  tokenSymbol: TokenType;
  poolId: string;
  dayIndex: number;
  claimTxSignature: string;
  solPriceUsd?: number;
}): Promise<EscrowDisbursementResult> {
  const escrowKeypair = parseEscrowSecretKeypair();
  if (!escrowKeypair) {
    return {
      configured: false,
      status: 'claim_verified_escrow_unconfigured',
      escrowPubkey: null,
      payoutTxSignature: null,
      payoutSolscanUrl: null,
      payoutExplorerUrl: null,
      detail:
        'Claim verified on Solana Devnet. Configure server-side ACTAKE_ESCROW_SECRET_KEY to enable automatic escrow disbursement.',
    };
  }

  const escrowPubkey = escrowKeypair.publicKey;
  const recipient = new PublicKey(params.recipientPubkey);
  const amountUsd = Math.max(0.01, Number(params.usdAmount.toFixed(2)));

  try {
    const [balResp, blockhashResp, escrowUsdc] = await Promise.all([
      rpcCall<{ value: number }>('getBalance', [escrowPubkey.toBase58(), { commitment: 'confirmed' }]),
      rpcCall<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'confirmed' }]),
      params.tokenSymbol === 'USDC'
        ? fetchEscrowUsdcBalance(escrowPubkey.toBase58())
        : Promise.resolve(0),
    ]);

    const escrowLamports = balResp?.value ?? 0;
    const recentBlockhash = blockhashResp?.value?.blockhash;
    if (!recentBlockhash) {
      throw new Error('Unable to fetch Solana Devnet blockhash for escrow disbursement.');
    }

    const tx = new Transaction({
      feePayer: escrowPubkey,
      recentBlockhash: recentBlockhash as NonNullable<Transaction['recentBlockhash']>,
    });

    let settledAsset: 'USDC' | 'SOL' = 'SOL';
    let settledAmount = 0;

    if (
      params.tokenSymbol === 'USDC' &&
      escrowUsdc >= amountUsd &&
      escrowLamports >= MIN_ESCROW_SOL_RESERVE_LAMPORTS
    ) {
      const baseUnits = BigInt(Math.max(1, Math.round(amountUsd * 10 ** USDC_DECIMALS)));
      const [sourceAta, destAta] = await Promise.all([
        deriveAta(escrowPubkey, USDC_DEVNET_MINT),
        deriveAta(recipient, USDC_DEVNET_MINT),
      ]);
      tx.add(buildCreateAtaIdempotentIx(escrowPubkey, destAta, recipient, USDC_DEVNET_MINT));
      tx.add(
        buildSplTransferCheckedIx(
          sourceAta,
          USDC_DEVNET_MINT,
          destAta,
          escrowPubkey,
          baseUnits,
          USDC_DECIMALS
        )
      );
      settledAsset = 'USDC';
      settledAmount = amountUsd;
    } else {
      const solPrice =
        typeof params.solPriceUsd === 'number' && params.solPriceUsd > 0 ? params.solPriceUsd : 150;
      const lamportsToSend = Math.max(5_000, Math.round((amountUsd / solPrice) * LAMPORTS_PER_SOL));
      if (escrowLamports < lamportsToSend + MIN_ESCROW_SOL_RESERVE_LAMPORTS) {
        return {
          configured: true,
          status: 'escrow_insufficient_funds',
          escrowPubkey: escrowPubkey.toBase58(),
          payoutTxSignature: null,
          payoutSolscanUrl: null,
          payoutExplorerUrl: null,
          detail: `Claim verified on-chain, but server escrow wallet (${escrowPubkey.toBase58().slice(0, 6)}...) needs more Devnet funds to disburse $${amountUsd.toFixed(2)}.`,
        };
      }
      tx.add(
        SystemProgram.transfer({
          fromPubkey: escrowPubkey,
          toPubkey: recipient,
          lamports: lamportsToSend,
        })
      );
      settledAsset = 'SOL';
      settledAmount = Number((lamportsToSend / LAMPORTS_PER_SOL).toFixed(6));
    }

    const memoJson = JSON.stringify({
      app: 'actake',
      ix: 'escrow_payout',
      poolId: params.poolId,
      day: params.dayIndex,
      claimSig: params.claimTxSignature.slice(0, 24),
      token: params.tokenSymbol,
      usd: amountUsd,
      settledAsset,
      settledAmount,
    });
    tx.add(
      new TransactionInstruction({
        programId: MEMO_PROGRAM_ID,
        keys: [{ pubkey: escrowPubkey, isSigner: true, isWritable: false }],
        data: Buffer.from(memoJson, 'utf-8'),
      })
    );

    await tx.sign(escrowKeypair);
    const serialized = await tx.serialize();
    const base64Tx = Buffer.from(serialized).toString('base64');

    const payoutSig = await rpcCall<string>('sendTransaction', [
      base64Tx,
      {
        encoding: 'base64',
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      },
    ]);

    // Brief confirmation poll
    for (let i = 0; i < 4; i++) {
      await sleep(700);
      const st = await rpcCall<{
        value?: Array<{ err?: unknown; confirmationStatus?: string } | null>;
      }>('getSignatureStatuses', [[payoutSig]]).catch(() => null);
      const item = st?.value?.[0];
      if (item) {
        if (item.err) {
          throw new Error(`Escrow payout tx failed on-chain: ${JSON.stringify(item.err)}`);
        }
        break;
      }
    }

    return {
      configured: true,
      status: 'disbursed',
      escrowPubkey: escrowPubkey.toBase58(),
      payoutTxSignature: payoutSig,
      payoutSolscanUrl: buildSolscanTxUrl(payoutSig),
      payoutExplorerUrl: buildExplorerTxUrl(payoutSig),
      settledAsset,
      settledAmount,
      detail: `Escrow disbursed ${settledAsset === 'USDC' ? `$${settledAmount.toFixed(2)} SPL USDC` : `${settledAmount.toFixed(4)} SOL (~$${amountUsd.toFixed(2)})`} directly to your wallet on Solana Devnet.`,
    };
  } catch (err) {
    return {
      configured: true,
      status: 'escrow_insufficient_funds',
      escrowPubkey: escrowPubkey.toBase58(),
      payoutTxSignature: null,
      payoutSolscanUrl: null,
      payoutExplorerUrl: null,
      detail:
        err instanceof Error
          ? `Claim verified on-chain; escrow payout deferred: ${err.message}`
          : 'Claim verified on-chain; escrow payout deferred.',
    };
  }
}
