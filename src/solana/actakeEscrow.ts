import {
  Ed25519Program,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { TokenType } from '../types/actake';

export const DEFAULT_ACTAKE_ESCROW_PROGRAM_ID = 'ACTKescrow111111111111111111111111111111111';
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

function resolveEscrowProgramId(): { programId: string; customDeployed: boolean } {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env
      ? String(import.meta.env.VITE_ACTAKE_ESCROW_PROGRAM_ID || '').trim()
      : '';
  if (raw && raw !== DEFAULT_ACTAKE_ESCROW_PROGRAM_ID) {
    try {
      const pk = new PublicKey(raw);
      return { programId: pk.toBase58(), customDeployed: true };
    } catch {
      // fall through to default
    }
  }
  return { programId: DEFAULT_ACTAKE_ESCROW_PROGRAM_ID, customDeployed: false };
}

const resolvedProgram = resolveEscrowProgramId();
export const ACTAKE_ESCROW_PROGRAM_ID = resolvedProgram.programId;
export const IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED = resolvedProgram.customDeployed;

function parsePublicSolanaAddress(raw: string | null | undefined): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    return new PublicKey(trimmed).toBase58();
  } catch {
    return null;
  }
}

export const CONFIGURED_CLIENT_ESCROW_WALLET: string | null = parsePublicSolanaAddress(
  typeof import.meta !== 'undefined' && import.meta.env
    ? String(import.meta.env.VITE_ACTAKE_ESCROW_WALLET || '')
    : ''
);

export const CONFIGURED_CLIENT_TREASURY_WALLET: string | null = parsePublicSolanaAddress(
  typeof import.meta !== 'undefined' && import.meta.env
    ? String(import.meta.env.VITE_ACTAKE_TREASURY_WALLET || '')
    : ''
);

/**
 * Resolves the safe Solana destination for real Pollar/SPL stake deposits:
 * 1. If a custom Anchor Escrow Program is deployed, deposits target the Pool Vault PDA.
 * 2. Otherwise, deposits target the configured Escrow Vault Wallet (client env or server config).
 * 3. If neither is configured, returns safeForRealTokens=false so Pollar never sends real tokens to an unowned PDA.
 */
export function resolveStakeDepositDestination(params: {
  poolPda: string;
  runtimeEscrowWallet?: string | null;
}): {
  destination: string;
  mode: 'anchor-pda' | 'escrow-wallet' | 'unconfigured-pda';
  safeForRealTokens: boolean;
} {
  if (IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED) {
    return {
      destination: params.poolPda,
      mode: 'anchor-pda',
      safeForRealTokens: true,
    };
  }
  const escrowWallet =
    parsePublicSolanaAddress(params.runtimeEscrowWallet) || CONFIGURED_CLIENT_ESCROW_WALLET;
  if (escrowWallet) {
    return {
      destination: escrowWallet,
      mode: 'escrow-wallet',
      safeForRealTokens: true,
    };
  }
  return {
    destination: params.poolPda,
    mode: 'unconfigured-pda',
    safeForRealTokens: false,
  };
}

export interface SplTokenConfig {
  symbol: TokenType;
  name: string;
  mint: string;
  tokenProgram: 'SPL Token' | 'Token-2022';
  decimals: number;
  protocolFeePct: number;
  yieldMultiplier: number;
}

export const TOKEN_CONFIGS: Record<TokenType, SplTokenConfig> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    tokenProgram: 'SPL Token',
    decimals: 6,
    protocolFeePct: 1.5,
    yieldMultiplier: 1,
  },
  SKR: {
    symbol: 'SKR',
    name: 'Solana Seeker SKR',
    mint: 'SKR1111111111111111111111111111111111111111',
    tokenProgram: 'Token-2022',
    decimals: 6,
    protocolFeePct: 0,
    yieldMultiplier: 1.2,
  },
};

export async function sha256Bytes(input: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return new Uint8Array(digest);
}

function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function buildDevnetExplorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

export function buildDevnetExplorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=devnet`;
}

function getSafeProgramPublicKey(): PublicKey {
  try {
    return new PublicKey(ACTAKE_ESCROW_PROGRAM_ID);
  } catch {
    return MEMO_PROGRAM_ID;
  }
}

/**
 * Real Solana PDA derivation matching programs/actake_escrow/programs/actake_escrow/src/lib.rs:
 * - Pool PDA:        ["pool", pool_id_16_bytes]
 * - Vault PDA:       ["vault", pool_pda]
 * - Participant PDA: ["participant", pool_pda, user_pubkey]
 */
export async function deriveAnchorPoolPdas(
  walletPublicKey: string,
  categoryId: string
): Promise<{ poolPda: string; vaultPda: string; participantPda: string; poolIdHex: string }> {
  const programId = getSafeProgramPublicKey();
  const seedHash = await sha256Bytes(`actake:${walletPublicKey}:${categoryId}`);
  const poolId16 = seedHash.slice(0, 16);
  const poolIdHex = Array.from(poolId16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  try {
    const userPk = new PublicKey(walletPublicKey);
    const [poolPk] = await PublicKey.findProgramAddress(
      [new TextEncoder().encode('pool'), poolId16],
      programId
    );
    const [vaultPk] = await PublicKey.findProgramAddress(
      [new TextEncoder().encode('vault'), poolPk.toBytes()],
      programId
    );
    const [participantPk] = await PublicKey.findProgramAddress(
      [new TextEncoder().encode('participant'), poolPk.toBytes(), userPk.toBytes()],
      programId
    );

    return {
      poolPda: poolPk.toBase58(),
      vaultPda: vaultPk.toBase58(),
      participantPda: participantPk.toBase58(),
      poolIdHex,
    };
  } catch {
    // Graceful deterministic fallback if wallet string is non-base58
    const fallbackPool = bs58.encode(seedHash);
    const fallbackVault = bs58.encode(await sha256Bytes(`vault:${fallbackPool}`));
    const fallbackParticipant = bs58.encode(
      await sha256Bytes(`participant:${fallbackPool}:${walletPublicKey}`)
    );
    return {
      poolPda: fallbackPool,
      vaultPda: fallbackVault,
      participantPda: fallbackParticipant,
      poolIdHex,
    };
  }
}

export async function deriveEscrowPoolPda(
  walletPublicKey: string,
  categoryId: string
): Promise<string> {
  const pdas = await deriveAnchorPoolPdas(walletPublicKey, categoryId);
  return pdas.poolPda;
}

/**
 * Builds a real Solana Actions / Blinks URL pointing to our live /api/actions/join/:poolId endpoint.
 */
export function buildSquadBlinkUrl(params: {
  poolId?: string;
  squadName: string;
  amount: number;
  token: TokenType;
  alarmTime: string;
  escrowPda?: string;
}): string {
  const baseOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://actake.app';
  const poolSlug =
    params.poolId ||
    params.squadName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') ||
    'squad-7am-club';
  const actionUrl = new URL(`/api/actions/join/${encodeURIComponent(poolSlug)}`, baseOrigin);
  return `https://dial.to/?action=${encodeURIComponent(`solana-action:${actionUrl.toString()}`)}`;
}

export function buildSquadLobbyUrl(poolId: string): string {
  const baseOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://actake.app';
  return `${baseOrigin}/squad/${encodeURIComponent(poolId)}`;
}

async function solanaRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch('/api/solana/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  if (!res.ok) {
    throw new Error(`Devnet RPC error (${res.status})`);
  }
  const payload = await res.json();
  if (payload.error) {
    throw new Error(payload.error.message || 'Solana RPC returned an error');
  }
  return payload.result as T;
}

export async function fetchDevnetTelemetry(publicKey?: string): Promise<{
  slot: number;
  solBalance: number | null;
  blockhash: string;
}> {
  const [slot, blockhashResp, balanceResp] = await Promise.all([
    solanaRpc<number>('getSlot', [{ commitment: 'confirmed' }]),
    solanaRpc<{ value: { blockhash: string } }>('getLatestBlockhash', [
      { commitment: 'confirmed' },
    ]),
    publicKey
      ? solanaRpc<{ value: number }>('getBalance', [publicKey, { commitment: 'confirmed' }]).catch(
          () => ({ value: 0 })
        )
      : Promise.resolve(null),
  ]);

  return {
    slot,
    solBalance: balanceResp ? balanceResp.value / 1_000_000_000 : null,
    blockhash: blockhashResp.value.blockhash,
  };
}

export async function fetchLatestDevnetBlockhash(): Promise<string> {
  try {
    const resp = await solanaRpc<{ value: { blockhash: string } }>('getLatestBlockhash', [
      { commitment: 'confirmed' },
    ]);
    return resp.value.blockhash;
  } catch {
    const fallbackBytes = await sha256Bytes(`devnet-fallback-${Date.now()}`);
    return bs58.encode(fallbackBytes);
  }
}

export interface DevnetBroadcastResult {
  signature: string;
  confirmed: boolean;
  confirmationStatus?: string;
  explorerUrl: string;
  error?: string;
}

export async function broadcastSignedTransactionToDevnet(
  signedTxBytes: Uint8Array
): Promise<DevnetBroadcastResult> {
  const base64 = Buffer.from(signedTxBytes).toString('base64');
  const res = await fetch('/api/solana/send-tx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTransactionBase64: base64 }),
  });
  const payload = await res.json();
  if (!res.ok || !payload.signature) {
    throw new Error(payload.error || 'Solana Devnet broadcast failed.');
  }
  return {
    signature: String(payload.signature),
    confirmed: Boolean(payload.confirmed),
    confirmationStatus: payload.confirmationStatus,
    explorerUrl: String(payload.explorerUrl || buildDevnetExplorerTxUrl(payload.signature)),
  };
}

export async function requestDevnetSolAirdrop(
  publicKey: string,
  solAmount = 1
): Promise<{ signature: string; solAmount: number; explorerUrl: string }> {
  const res = await fetch('/api/solana/airdrop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey, solAmount }),
  });
  const payload = await res.json();
  if (!res.ok || !payload.signature) {
    throw new Error(payload.error || 'Devnet SOL airdrop failed.');
  }
  return {
    signature: String(payload.signature),
    solAmount: Number(payload.solAmount || solAmount),
    explorerUrl: String(payload.explorerUrl || buildDevnetExplorerTxUrl(payload.signature)),
  };
}

export interface OracleAttestationBundle {
  publicKeyHex: string;
  signatureHex: string;
  messageBytesHex: string;
}

// Precomputed Anchor 8-byte global instruction discriminators matching lib.rs:
// sha256("global:<instruction_name>")[0..8]
async function computeAnchorDiscriminator(ixName: string): Promise<Uint8Array> {
  const digest = await sha256Bytes(`global:${ixName}`);
  return digest.slice(0, 8);
}

/**
 * Builds an Anchor submit_checkin instruction referencing SYSVAR_INSTRUCTIONS_PUBKEY
 * when a deployed custom Devnet program ID is configured via VITE_ACTAKE_ESCROW_PROGRAM_ID.
 */
export async function buildAnchorSubmitCheckinInstruction(params: {
  payerPublicKey: string;
  poolPda: string;
  participantPda: string;
  dayIndex: number;
  proofHashHex: string;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('submit_checkin');
  const dayBytes = new Uint8Array(2);
  new DataView(dayBytes.buffer).setUint16(0, params.dayIndex & 0xffff, true);
  const proofBytes = hexToUint8Array(params.proofHashHex).slice(0, 32);
  const paddedProof = new Uint8Array(32);
  paddedProof.set(proofBytes);

  const data = new Uint8Array(8 + 2 + 32);
  data.set(disc, 0);
  data.set(dayBytes, 8);
  data.set(paddedProof, 10);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: new PublicKey(params.payerPublicKey), isSigner: true, isWritable: false },
      { pubkey: new PublicKey(params.poolPda), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.participantPda), isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function buildActakeEscrowTransaction(params: {
  payerPublicKey: string;
  recentBlockhash: string;
  instructionType:
    | 'create_pool'
    | 'join_pool'
    | 'submit_checkin'
    | 'claim_payout'
    | 'slash_personal';
  escrowPda: string;
  escrowWallet?: string | null;
  treasuryWallet?: string | null;
  token: TokenType;
  amount: number;
  metadata?: Record<string, string | number>;
  oracleAttestation?: OracleAttestationBundle;
}): Transaction {
  const payer = new PublicKey(params.payerPublicKey);
  const tx = new Transaction({
    feePayer: payer,
    recentBlockhash: params.recentBlockhash as NonNullable<Transaction['recentBlockhash']>,
  });

  // For submit_checkin with a server-signed Ed25519 attestation, prepend native Solana
  // Ed25519Program.createInstructionWithPublicKey matching lib.rs sysvar::instructions introspection.
  let hasEd25519Ix = false;
  if (
    params.instructionType === 'submit_checkin' &&
    params.oracleAttestation &&
    params.oracleAttestation.publicKeyHex.length === 64 &&
    params.oracleAttestation.signatureHex.length === 128 &&
    params.oracleAttestation.messageBytesHex.length > 0
  ) {
    try {
      const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
        publicKey: hexToUint8Array(params.oracleAttestation.publicKeyHex),
        message: hexToUint8Array(params.oracleAttestation.messageBytesHex),
        signature: hexToUint8Array(params.oracleAttestation.signatureHex),
      });
      tx.add(ed25519Ix);
      hasEd25519Ix = true;
    } catch {
      // Fall back cleanly if attestation bytes are malformed
    }
  }

  // 0-lamport self-transfer anchor so wallet simulators and Devnet preflight validate cleanly
  tx.add(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: payer,
      lamports: 0,
    })
  );

  const validEscrow = parsePublicSolanaAddress(params.escrowWallet) || CONFIGURED_CLIENT_ESCROW_WALLET;
  const validTreasury =
    parsePublicSolanaAddress(params.treasuryWallet) || CONFIGURED_CLIENT_TREASURY_WALLET;

  const memoPayload = JSON.stringify({
    program: IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED ? ACTAKE_ESCROW_PROGRAM_ID : 'actake_escrow',
    mode: IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED ? 'anchor_devnet' : 'devnet_memo_ed25519',
    ix: params.instructionType,
    pda: params.escrowPda,
    ...(validEscrow ? { escrowWallet: validEscrow } : {}),
    ...(validTreasury ? { treasuryWallet: validTreasury } : {}),
    token: params.token,
    mint: TOKEN_CONFIGS[params.token].mint,
    tokenProgram: TOKEN_CONFIGS[params.token].tokenProgram,
    feePct: TOKEN_CONFIGS[params.token].protocolFeePct,
    amount: params.amount,
    ...(hasEd25519Ix ? { ed25519IntrospectionIx: 0 } : {}),
    ...params.metadata,
  });

  tx.add(
    new TransactionInstruction({
      keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memoPayload, 'utf-8'),
    })
  );

  return tx;
}
