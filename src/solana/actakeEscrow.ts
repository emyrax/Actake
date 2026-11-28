import {
  Ed25519Program,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { OnChainTransactionDetails, TokenType } from '../types/actake';
import { safeFetchJson } from '../utils/safeFetchJson';

export const DEFAULT_ACTAKE_ESCROW_PROGRAM_ID = 'ACTKescrow111111111111111111111111111111111';
export const DEFAULT_SKR_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
);
export const MIN_SOL_GAS_RESERVE = 0.002;
export const LAMPORTS_PER_SOL_NUM = 1_000_000_000;

export function getTokenProgramIdForToken(token: TokenType): PublicKey {
  return token === 'SKR' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

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

const CONFIGURED_SKR_MINT =
  parsePublicSolanaAddress(
    typeof import.meta !== 'undefined' && import.meta.env
      ? String(import.meta.env.VITE_SKR_MINT || '')
      : ''
  ) || DEFAULT_SKR_MINT;

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
    mint: CONFIGURED_SKR_MINT,
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

export function buildDevnetSolscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

export function buildDevnetExplorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=devnet`;
}

export function buildDevnetSolscanAddressUrl(address: string): string {
  return `https://solscan.io/account/${encodeURIComponent(address)}?cluster=devnet`;
}

export function isValidSolanaPublicKey(raw: string | null | undefined): boolean {
  return parsePublicSolanaAddress(raw) !== null;
}

/**
 * Derives the canonical Associated Token Account (ATA) address for an owner & SPL/Token-2022 mint
 * using pure @solana/web3.js primitives (zero external SPL package overhead).
 */
export async function deriveAssociatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  const [ata] = await PublicKey.findProgramAddress(
    [owner.toBytes(), tokenProgramId.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

/**
 * Builds an Associated Token Account Program `CreateIdempotent` instruction (opcode 1).
 * Safely creates the destination ATA on first SPL or Token-2022 deposit without failing if it already exists.
 */
export function createAssociatedTokenAccountIdempotentInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

/**
 * Builds an SPL Token / Token-2022 `TransferChecked` instruction (opcode 12, little-endian u64 amount + u8 decimals).
 */
export function createSplTransferCheckedInstruction(
  sourceAta: PublicKey,
  mint: PublicKey,
  destinationAta: PublicKey,
  owner: PublicKey,
  amountBaseUnits: bigint,
  decimals: number,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): TransactionInstruction {
  const data = new Uint8Array(10);
  const view = new DataView(data.buffer);
  view.setUint8(0, 12); // SPL Token / Token-2022 Instruction::TransferChecked
  view.setBigUint64(1, amountBaseUnits, true);
  view.setUint8(9, decimals & 0xff);

  return new TransactionInstruction({
    programId: tokenProgramId,
    keys: [
      { pubkey: sourceAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destinationAta, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export interface ResolvedDirectTransferPlan {
  asset: 'USDC' | 'SOL';
  destination: string;
  usdEquivalent: number;
  displayAmount: number;
  /** SPL base units when asset === 'USDC' */
  baseUnits?: bigint;
  mint?: string;
  decimals?: number;
  /** Lamports when asset === 'SOL' */
  lamports?: number;
  solPriceUsdUsed?: number;
  usedSolFallback: boolean;
}

/**
 * Resolves a real Devnet value transfer plan:
 * 1. If staking/slashing USDC and the sender holds enough Devnet SPL USDC (plus >= 0.002 SOL gas),
 *    settles in real Devnet SPL USDC.
 * 2. Otherwise converts the USD amount to exact Devnet SOL lamports using the live SOL/USD price
 *    while preserving a 0.002 SOL gas reserve in the sender wallet.
 */
export function resolveDirectTransferPlan(params: {
  token: TokenType;
  usdAmount: number;
  destination: string;
  usdcBalance: number | null;
  solBalance: number | null;
  solPriceUsd: number | null;
  skipBalanceCheck?: boolean;
}): ResolvedDirectTransferPlan {
  const validDestination = parsePublicSolanaAddress(params.destination);
  if (!validDestination) {
    throw new Error(
      'Destination Escrow or Treasury wallet address is missing or invalid. Configure ACTAKE_ESCROW_WALLET and ACTAKE_TREASURY_WALLET in your environment variables.'
    );
  }

  const usdAmount = Number(params.usdAmount);
  if (!Number.isFinite(usdAmount) || usdAmount <= 0 || usdAmount > 100_000) {
    throw new Error('Transfer amount must be a positive USD value.');
  }

  const usdcBalance =
    typeof params.usdcBalance === 'number' && Number.isFinite(params.usdcBalance)
      ? params.usdcBalance
      : 0;
  const solBalance =
    typeof params.solBalance === 'number' && Number.isFinite(params.solBalance)
      ? params.solBalance
      : null;

  // Prefer real Devnet SPL USDC when staking/slashing USDC and wallet actually holds enough Devnet USDC
  if (params.token === 'USDC' && usdcBalance >= usdAmount) {
    if (!params.skipBalanceCheck && solBalance !== null && solBalance < MIN_SOL_GAS_RESERVE) {
      throw new Error(
        `You need at least ${MIN_SOL_GAS_RESERVE} Devnet SOL to pay Solana network gas fees. Request a Devnet SOL airdrop from Wallet Settings.`
      );
    }
    const decimals = TOKEN_CONFIGS.USDC.decimals;
    const baseUnits = BigInt(Math.max(1, Math.round(usdAmount * 10 ** decimals)));
    return {
      asset: 'USDC',
      destination: validDestination,
      usdEquivalent: Number(usdAmount.toFixed(2)),
      displayAmount: Number(usdAmount.toFixed(2)),
      baseUnits,
      mint: TOKEN_CONFIGS.USDC.mint,
      decimals,
      usedSolFallback: false,
    };
  }

  // Automatic native Devnet SOL fallback using live SOL/USD market rate
  const liveSolPrice =
    typeof params.solPriceUsd === 'number' && Number.isFinite(params.solPriceUsd) && params.solPriceUsd > 0
      ? params.solPriceUsd
      : 150;
  const rawSolAmount = usdAmount / liveSolPrice;
  const lamports = Math.max(5_000, Math.round(rawSolAmount * LAMPORTS_PER_SOL_NUM));
  const exactSolAmount = Number((lamports / LAMPORTS_PER_SOL_NUM).toFixed(6));

  if (!params.skipBalanceCheck && solBalance !== null) {
    const spendableSol = Math.max(0, solBalance - MIN_SOL_GAS_RESERVE);
    if (exactSolAmount > spendableSol) {
      throw new Error(
        `Insufficient Devnet balance for $${usdAmount.toFixed(2)} (~${exactSolAmount.toFixed(4)} SOL). Your wallet holds ${solBalance.toFixed(4)} SOL and ${usdcBalance.toFixed(2)} Devnet USDC (keeping ${MIN_SOL_GAS_RESERVE} SOL for gas). Fund Devnet SOL or Devnet USDC and try again.`
      );
    }
  }

  return {
    asset: 'SOL',
    destination: validDestination,
    usdEquivalent: Number(usdAmount.toFixed(2)),
    displayAmount: exactSolAmount,
    lamports,
    solPriceUsdUsed: liveSolPrice,
    usedSolFallback: true,
  };
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

export const CANONICAL_APP_ORIGIN = (
  (import.meta.env?.VITE_APP_URL as string | undefined)?.trim() || 'https://actake.vercel.app'
).replace(/\/$/, '');

/**
 * Resolves the public shareable Actake app origin.
 * Uses the live browser origin when already hosted on the production domain,
 * and falls back to https://actake.vercel.app when running in localhost or ephemeral preview iframes
 * so shared links always open cleanly for other people.
 */
export function resolveCanonicalAppOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const host = window.location.hostname.toLowerCase();
    const isEphemeralPreview =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.run.app') ||
      host.endsWith('.googleusercontent.com') ||
      host.endsWith('.aistudio.google.com') ||
      host.endsWith('.webcontainer.io');
    if (!isEphemeralPreview && window.location.protocol === 'https:') {
      return window.location.origin.replace(/\/$/, '');
    }
  }
  return CANONICAL_APP_ORIGIN;
}

/**
 * Builds the direct shareable Actake app URL for any accountability pool (/squad/:poolId).
 */
export function buildSquadLobbyUrl(poolId: string): string {
  const baseOrigin = resolveCanonicalAppOrigin();
  const cleanId = poolId.trim() || 'squad-7am-club';
  return `${baseOrigin}/squad/${encodeURIComponent(cleanId)}`;
}

/**
 * Builds the direct shareable Actake app URL for any GeoDrops AR Hunt (/hunts?hunt=:huntId).
 */
export function buildHuntUrl(huntId?: string): string {
  const baseOrigin = resolveCanonicalAppOrigin();
  if (!huntId) return `${baseOrigin}/hunts`;
  return `${baseOrigin}/hunts?hunt=${encodeURIComponent(huntId)}`;
}

/**
 * Builds a canonical Actake pool URL (with optional Solana Actions / Blinks endpoint support).
 */
export function buildSquadBlinkUrl(params: {
  poolId?: string;
  squadName: string;
  amount: number;
  token: TokenType;
  alarmTime: string;
  escrowPda?: string;
}): string {
  const poolSlug =
    params.poolId ||
    params.squadName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') ||
    'squad-7am-club';
  return buildSquadLobbyUrl(poolSlug);
}

/**
 * Builds the raw Solana Actions / Blinks protocol URL pointing to /api/actions/join/:poolId.
 */
export function buildSolanaActionUrl(poolId: string): string {
  const baseOrigin = resolveCanonicalAppOrigin();
  const actionUrl = new URL(`/api/actions/join/${encodeURIComponent(poolId)}`, baseOrigin);
  return `https://dial.to/?action=${encodeURIComponent(`solana-action:${actionUrl.toString()}`)}`;
}

async function solanaRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const payload = await safeFetchJson<{
    result?: T;
    error?: { message?: string };
  }>('/api/solana/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
    retries: 1,
    fallbackError: 'Devnet RPC returned an unexpected response.',
  });
  if (payload.error) {
    throw new Error(payload.error.message || 'Solana RPC returned an error');
  }
  return payload.result as T;
}

interface ParsedTokenAccountEntry {
  account?: {
    data?: {
      parsed?: {
        info?: {
          tokenAmount?: {
            uiAmount?: number | null;
            uiAmountString?: string;
          };
        };
      };
    };
  };
}

async function fetchSplTokenBalance(publicKey: string, mint: string): Promise<number> {
  try {
    const resp = await solanaRpc<{ value?: ParsedTokenAccountEntry[] }>(
      'getTokenAccountsByOwner',
      [publicKey, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]
    );
    const accounts = Array.isArray(resp?.value) ? resp.value : [];
    let total = 0;
    for (const acc of accounts) {
      const tokenAmt = acc.account?.data?.parsed?.info?.tokenAmount;
      if (typeof tokenAmt?.uiAmount === 'number' && Number.isFinite(tokenAmt.uiAmount)) {
        total += tokenAmt.uiAmount;
      } else if (typeof tokenAmt?.uiAmountString === 'string') {
        const parsed = Number.parseFloat(tokenAmt.uiAmountString);
        if (Number.isFinite(parsed)) total += parsed;
      }
    }
    return Number(total.toFixed(6));
  } catch {
    return 0;
  }
}

export async function fetchLiveSolPrice(): Promise<{
  solPriceUsd: number | null;
  solChange24hPct: number | null;
}> {
  try {
    const payload = await safeFetchJson<{
      priceUsd?: number;
      change24hPct?: number | null;
    }>('/api/solana/price', {
      method: 'GET',
      retries: 1,
      fallbackError: 'Unable to fetch live SOL price.',
    });
    const price = Number(payload?.priceUsd);
    const change =
      typeof payload?.change24hPct === 'number' && Number.isFinite(payload.change24hPct)
        ? payload.change24hPct
        : null;
    return {
      solPriceUsd: Number.isFinite(price) && price > 0 ? price : null,
      solChange24hPct: change,
    };
  } catch {
    return { solPriceUsd: null, solChange24hPct: null };
  }
}

export async function fetchOnChainTransactionDetails(
  signature: string
): Promise<OnChainTransactionDetails> {
  return safeFetchJson<OnChainTransactionDetails>(
    `/api/solana/tx/${encodeURIComponent(signature.trim())}`,
    {
      method: 'GET',
      retries: 1,
      fallbackError: 'Unable to fetch live Solana transaction status.',
    }
  );
}

export async function fetchDevnetTelemetry(publicKey?: string): Promise<{
  slot: number;
  solBalance: number | null;
  usdcBalance: number | null;
  skrBalance: number | null;
  solPriceUsd: number | null;
  solChange24hPct: number | null;
  blockhash: string;
}> {
  const [slot, blockhashResp, balanceResp, usdcBalance, skrBalance, priceQuote] =
    await Promise.all([
      solanaRpc<number>('getSlot', [{ commitment: 'confirmed' }]),
      solanaRpc<{ value: { blockhash: string } }>('getLatestBlockhash', [
        { commitment: 'confirmed' },
      ]),
      publicKey
        ? solanaRpc<{ value: number }>('getBalance', [publicKey, { commitment: 'confirmed' }]).catch(
            () => ({ value: 0 })
          )
        : Promise.resolve(null),
      publicKey
        ? fetchSplTokenBalance(publicKey, TOKEN_CONFIGS.USDC.mint)
        : Promise.resolve(null),
      publicKey
        ? fetchSplTokenBalance(publicKey, TOKEN_CONFIGS.SKR.mint)
        : Promise.resolve(null),
      fetchLiveSolPrice(),
    ]);

  return {
    slot,
    solBalance: balanceResp ? balanceResp.value / 1_000_000_000 : null,
    usdcBalance,
    skrBalance,
    solPriceUsd: priceQuote.solPriceUsd,
    solChange24hPct: priceQuote.solChange24hPct,
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
  const payload = await safeFetchJson<{
    signature?: string;
    confirmed?: boolean;
    confirmationStatus?: string;
    explorerUrl?: string;
    error?: string;
  }>('/api/solana/send-tx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTransactionBase64: base64 }),
    retries: 1,
    fallbackError: 'Solana Devnet broadcast failed.',
  });
  if (!payload.signature) {
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
  const payload = await safeFetchJson<{
    signature?: string;
    solAmount?: number;
    explorerUrl?: string;
    error?: string;
  }>('/api/solana/airdrop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey, solAmount }),
    retries: 0,
    fallbackError: 'Devnet SOL airdrop failed.',
  });
  if (!payload.signature) {
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
export async function computeAnchorDiscriminator(ixName: string): Promise<Uint8Array> {
  const digest = await sha256Bytes(`global:${ixName}`);
  return digest.slice(0, 8);
}

function writeU16Le(value: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, Math.max(0, Math.min(65535, Math.floor(value))), true);
  return b;
}

function writeU64Le(value: number | bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, typeof value === 'bigint' ? value : BigInt(Math.max(0, Math.floor(value))), true);
  return b;
}

function writeI64Le(value: number | bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, typeof value === 'bigint' ? value : BigInt(Math.floor(value)), true);
  return b;
}

/**
 * Builds Anchor `create_pool` instruction matching lib.rs (109 bytes):
 * disc[8] + pool_id[16] + pool_type[1] + stake_amount(u64)[8] + oracle_pubkey[32] +
 * treasury[32] + total_days(u16)[2] + deadline_unix_ts(i64)[8] + protocol_fee_bps(u16)[2]
 */
export async function buildAnchorCreatePoolInstruction(params: {
  creatorPublicKey: string;
  poolIdHex: string;
  poolPda: string;
  vaultPda: string;
  token: TokenType;
  poolType: 0 | 1 | 2;
  stakeAmountBaseUnits: bigint;
  oraclePubkeyHex: string;
  treasuryPublicKey: string;
  totalDays: number;
  deadlineUnixTs: number;
  protocolFeeBps: number;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('create_pool');
  const poolId16 = hexToUint8Array(params.poolIdHex).slice(0, 16);
  const paddedPoolId = new Uint8Array(16);
  paddedPoolId.set(poolId16);
  const oracleBytes = hexToUint8Array(params.oraclePubkeyHex).slice(0, 32);
  const paddedOracle = new Uint8Array(32);
  paddedOracle.set(oracleBytes);
  const treasuryPk = new PublicKey(params.treasuryPublicKey);
  const mintPk = new PublicKey(TOKEN_CONFIGS[params.token].mint);
  const tokenProgramId = getTokenProgramIdForToken(params.token);

  const data = new Uint8Array(8 + 16 + 1 + 8 + 32 + 32 + 2 + 8 + 2);
  let offset = 0;
  data.set(disc, offset); offset += 8;
  data.set(paddedPoolId, offset); offset += 16;
  data[offset] = params.poolType; offset += 1;
  data.set(writeU64Le(params.stakeAmountBaseUnits), offset); offset += 8;
  data.set(paddedOracle, offset); offset += 32;
  data.set(treasuryPk.toBytes(), offset); offset += 32;
  data.set(writeU16Le(Math.max(1, Math.min(365, Math.floor(params.totalDays)))), offset); offset += 2;
  data.set(writeI64Le(params.deadlineUnixTs), offset); offset += 8;
  data.set(writeU16Le(params.protocolFeeBps), offset);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: new PublicKey(params.creatorPublicKey), isSigner: true, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(params.poolPda), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.vaultPda), isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Builds Anchor `join_pool` instruction matching lib.rs (8 bytes).
 */
export async function buildAnchorJoinPoolInstruction(params: {
  userPublicKey: string;
  poolPda: string;
  vaultPda: string;
  participantPda: string;
  token: TokenType;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('join_pool');
  const userPk = new PublicKey(params.userPublicKey);
  const mintPk = new PublicKey(TOKEN_CONFIGS[params.token].mint);
  const tokenProgramId = getTokenProgramIdForToken(params.token);
  const userAta = await deriveAssociatedTokenAddress(userPk, mintPk, tokenProgramId);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(params.poolPda), isSigner: false, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(params.vaultPda), isSigner: false, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.participantPda), isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(disc),
  });
}

/**
 * Builds an Anchor `submit_checkin` instruction (42 bytes) referencing SYSVAR_INSTRUCTIONS_PUBKEY
 * when a deployed custom Devnet program ID is configured via VITE_ACTAKE_ESCROW_PROGRAM_ID.
 * `dayIndex` is 1-based (`1..=365`).
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
  const normalizedDay = Math.max(1, Math.min(365, Math.floor(params.dayIndex)));
  const dayBytes = writeU16Le(normalizedDay);
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

/**
 * Builds Anchor `claim_daily_payout(day_index: u16)` instruction (10 bytes).
 */
export async function buildAnchorClaimDailyPayoutInstruction(params: {
  userPublicKey: string;
  poolPda: string;
  vaultPda: string;
  participantPda: string;
  token: TokenType;
  dayIndex: number;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('claim_daily_payout');
  const userPk = new PublicKey(params.userPublicKey);
  const mintPk = new PublicKey(TOKEN_CONFIGS[params.token].mint);
  const tokenProgramId = getTokenProgramIdForToken(params.token);
  const userAta = await deriveAssociatedTokenAddress(userPk, mintPk, tokenProgramId);

  const data = new Uint8Array(10);
  data.set(disc, 0);
  data.set(writeU16Le(Math.max(1, Math.min(365, Math.floor(params.dayIndex)))), 8);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(params.poolPda), isSigner: false, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(params.vaultPda), isSigner: false, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.participantPda), isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Builds Anchor `slash_missed_day(day_index: u16)` instruction (10 bytes).
 */
export async function buildAnchorSlashMissedDayInstruction(params: {
  callerPublicKey: string;
  participantUserPublicKey: string;
  treasuryPublicKey: string;
  poolPda: string;
  vaultPda: string;
  participantPda: string;
  token: TokenType;
  dayIndex: number;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('slash_missed_day');
  const mintPk = new PublicKey(TOKEN_CONFIGS[params.token].mint);
  const tokenProgramId = getTokenProgramIdForToken(params.token);
  const [treasuryAta, userAta] = await Promise.all([
    deriveAssociatedTokenAddress(new PublicKey(params.treasuryPublicKey), mintPk, tokenProgramId),
    deriveAssociatedTokenAddress(new PublicKey(params.participantUserPublicKey), mintPk, tokenProgramId),
  ]);

  const data = new Uint8Array(10);
  data.set(disc, 0);
  data.set(writeU16Le(Math.max(1, Math.min(365, Math.floor(params.dayIndex)))), 8);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: new PublicKey(params.callerPublicKey), isSigner: true, isWritable: false },
      { pubkey: new PublicKey(params.poolPda), isSigner: false, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(params.vaultPda), isSigner: false, isWritable: true },
      { pubkey: treasuryAta, isSigner: false, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.participantPda), isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Builds Anchor `settle_and_claim` instruction (8 bytes).
 */
export async function buildAnchorSettleAndClaimInstruction(params: {
  userPublicKey: string;
  treasuryPublicKey: string;
  poolPda: string;
  vaultPda: string;
  participantPda: string;
  token: TokenType;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('settle_and_claim');
  const userPk = new PublicKey(params.userPublicKey);
  const mintPk = new PublicKey(TOKEN_CONFIGS[params.token].mint);
  const tokenProgramId = getTokenProgramIdForToken(params.token);
  const [userAta, treasuryAta] = await Promise.all([
    deriveAssociatedTokenAddress(userPk, mintPk, tokenProgramId),
    deriveAssociatedTokenAddress(new PublicKey(params.treasuryPublicKey), mintPk, tokenProgramId),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: userPk, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(params.poolPda), isSigner: false, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(params.vaultPda), isSigner: false, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: treasuryAta, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(params.participantPda), isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(disc),
  });
}

/**
 * Builds Anchor `sweep_to_treasury` instruction (8 bytes).
 */
export async function buildAnchorSweepToTreasuryInstruction(params: {
  callerPublicKey: string;
  treasuryPublicKey: string;
  poolPda: string;
  vaultPda: string;
  token: TokenType;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('sweep_to_treasury');
  const mintPk = new PublicKey(TOKEN_CONFIGS[params.token].mint);
  const tokenProgramId = getTokenProgramIdForToken(params.token);
  const treasuryAta = await deriveAssociatedTokenAddress(
    new PublicKey(params.treasuryPublicKey),
    mintPk,
    tokenProgramId
  );

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: new PublicKey(params.callerPublicKey), isSigner: true, isWritable: false },
      { pubkey: new PublicKey(params.poolPda), isSigner: false, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(params.vaultPda), isSigner: false, isWritable: true },
      { pubkey: treasuryAta, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(disc),
  });
}

// =========================================================================
// MODULE 3: GEODROPS AR HUNTS PDAs & ANCHOR CPI BUILDERS
// =========================================================================

export async function deriveGeoDropPdas(params: {
  creatorPublicKey: string;
  huntNumericId: number | bigint;
  hunterPublicKey?: string;
}): Promise<{
  huntPda: PublicKey;
  tokenVaultPda: PublicKey;
  solVaultPda: PublicKey;
  claimReceiptPda: PublicKey | null;
}> {
  const programId = getSafeProgramPublicKey();
  const creatorPk = new PublicKey(params.creatorPublicKey);
  const huntIdBytes = writeU64Le(params.huntNumericId);

  const [huntPda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode('geodrop'), creatorPk.toBytes(), huntIdBytes],
    programId
  );
  const [tokenVaultPda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode('geodrop_vault'), huntPda.toBytes()],
    programId
  );
  const [solVaultPda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode('geodrop_sol_vault'), huntPda.toBytes()],
    programId
  );

  let claimReceiptPda: PublicKey | null = null;
  if (params.hunterPublicKey) {
    const hunterPk = new PublicKey(params.hunterPublicKey);
    const [receiptPk] = await PublicKey.findProgramAddress(
      [new TextEncoder().encode('geodrop_claim'), huntPda.toBytes(), hunterPk.toBytes()],
      programId
    );
    claimReceiptPda = receiptPk;
  }

  return { huntPda, tokenVaultPda, solVaultPda, claimReceiptPda };
}

export async function buildAnchorCreateTokenGeoDropInstruction(params: {
  creatorPublicKey: string;
  huntNumericId: number | bigint;
  oraclePubkeyHex: string;
  token: TokenType;
  rewardPerChestBaseUnits: bigint;
  totalChests: number;
  expiresAtUnixTs: number;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('create_token_geodrop_hunt');
  const creatorPk = new PublicKey(params.creatorPublicKey);
  const mintPk = new PublicKey(TOKEN_CONFIGS[params.token].mint);
  const tokenProgramId = getTokenProgramIdForToken(params.token);
  const { huntPda, tokenVaultPda } = await deriveGeoDropPdas({
    creatorPublicKey: params.creatorPublicKey,
    huntNumericId: params.huntNumericId,
  });
  const creatorAta = await deriveAssociatedTokenAddress(creatorPk, mintPk, tokenProgramId);
  const oracleBytes = hexToUint8Array(params.oraclePubkeyHex).slice(0, 32);
  const paddedOracle = new Uint8Array(32);
  paddedOracle.set(oracleBytes);

  const data = new Uint8Array(8 + 8 + 32 + 8 + 2 + 8);
  let offset = 0;
  data.set(disc, offset); offset += 8;
  data.set(writeU64Le(params.huntNumericId), offset); offset += 8;
  data.set(paddedOracle, offset); offset += 32;
  data.set(writeU64Le(params.rewardPerChestBaseUnits), offset); offset += 8;
  data.set(writeU16Le(params.totalChests), offset); offset += 2;
  data.set(writeI64Le(params.expiresAtUnixTs), offset);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: creatorPk, isSigner: true, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: huntPda, isSigner: false, isWritable: true },
      { pubkey: tokenVaultPda, isSigner: false, isWritable: true },
      { pubkey: creatorAta, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function buildAnchorCreateSolGeoDropInstruction(params: {
  creatorPublicKey: string;
  huntNumericId: number | bigint;
  oraclePubkeyHex: string;
  rewardPerChestLamports: bigint;
  totalChests: number;
  expiresAtUnixTs: number;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('create_sol_geodrop_hunt');
  const creatorPk = new PublicKey(params.creatorPublicKey);
  const { huntPda, solVaultPda } = await deriveGeoDropPdas({
    creatorPublicKey: params.creatorPublicKey,
    huntNumericId: params.huntNumericId,
  });
  const oracleBytes = hexToUint8Array(params.oraclePubkeyHex).slice(0, 32);
  const paddedOracle = new Uint8Array(32);
  paddedOracle.set(oracleBytes);

  const data = new Uint8Array(8 + 8 + 32 + 8 + 2 + 8);
  let offset = 0;
  data.set(disc, offset); offset += 8;
  data.set(writeU64Le(params.huntNumericId), offset); offset += 8;
  data.set(paddedOracle, offset); offset += 32;
  data.set(writeU64Le(params.rewardPerChestLamports), offset); offset += 8;
  data.set(writeU16Le(params.totalChests), offset); offset += 2;
  data.set(writeI64Le(params.expiresAtUnixTs), offset);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: creatorPk, isSigner: true, isWritable: true },
      { pubkey: huntPda, isSigner: false, isWritable: true },
      { pubkey: solVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function buildAnchorClaimTokenGeoDropInstruction(params: {
  hunterPublicKey: string;
  creatorPublicKey: string;
  huntNumericId: number | bigint;
  token: TokenType;
  attestationExpiresAtUnixTs: number;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('claim_token_geodrop');
  const hunterPk = new PublicKey(params.hunterPublicKey);
  const mintPk = new PublicKey(TOKEN_CONFIGS[params.token].mint);
  const tokenProgramId = getTokenProgramIdForToken(params.token);
  const { huntPda, tokenVaultPda, claimReceiptPda } = await deriveGeoDropPdas({
    creatorPublicKey: params.creatorPublicKey,
    huntNumericId: params.huntNumericId,
    hunterPublicKey: params.hunterPublicKey,
  });
  const hunterAta = await deriveAssociatedTokenAddress(hunterPk, mintPk, tokenProgramId);

  const data = new Uint8Array(16);
  data.set(disc, 0);
  data.set(writeI64Le(params.attestationExpiresAtUnixTs), 8);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: hunterPk, isSigner: true, isWritable: true },
      { pubkey: huntPda, isSigner: false, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: tokenVaultPda, isSigner: false, isWritable: true },
      { pubkey: hunterAta, isSigner: false, isWritable: true },
      { pubkey: claimReceiptPda!, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function buildAnchorClaimSolGeoDropInstruction(params: {
  hunterPublicKey: string;
  creatorPublicKey: string;
  huntNumericId: number | bigint;
  attestationExpiresAtUnixTs: number;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('claim_sol_geodrop');
  const hunterPk = new PublicKey(params.hunterPublicKey);
  const { huntPda, solVaultPda, claimReceiptPda } = await deriveGeoDropPdas({
    creatorPublicKey: params.creatorPublicKey,
    huntNumericId: params.huntNumericId,
    hunterPublicKey: params.hunterPublicKey,
  });

  const data = new Uint8Array(16);
  data.set(disc, 0);
  data.set(writeI64Le(params.attestationExpiresAtUnixTs), 8);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: hunterPk, isSigner: true, isWritable: true },
      { pubkey: huntPda, isSigner: false, isWritable: true },
      { pubkey: solVaultPda, isSigner: false, isWritable: true },
      { pubkey: claimReceiptPda!, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function buildAnchorReclaimTokenGeoDropInstruction(params: {
  creatorPublicKey: string;
  huntNumericId: number | bigint;
  token: TokenType;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('reclaim_token_geodrop');
  const creatorPk = new PublicKey(params.creatorPublicKey);
  const mintPk = new PublicKey(TOKEN_CONFIGS[params.token].mint);
  const tokenProgramId = getTokenProgramIdForToken(params.token);
  const { huntPda, tokenVaultPda } = await deriveGeoDropPdas({
    creatorPublicKey: params.creatorPublicKey,
    huntNumericId: params.huntNumericId,
  });
  const creatorAta = await deriveAssociatedTokenAddress(creatorPk, mintPk, tokenProgramId);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: creatorPk, isSigner: true, isWritable: true },
      { pubkey: huntPda, isSigner: false, isWritable: true },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: tokenVaultPda, isSigner: false, isWritable: true },
      { pubkey: creatorAta, isSigner: false, isWritable: true },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(disc),
  });
}

export async function buildAnchorReclaimSolGeoDropInstruction(params: {
  creatorPublicKey: string;
  huntNumericId: number | bigint;
}): Promise<TransactionInstruction> {
  const programId = getSafeProgramPublicKey();
  const disc = await computeAnchorDiscriminator('reclaim_sol_geodrop');
  const creatorPk = new PublicKey(params.creatorPublicKey);
  const { huntPda, solVaultPda } = await deriveGeoDropPdas({
    creatorPublicKey: params.creatorPublicKey,
    huntNumericId: params.huntNumericId,
  });

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: creatorPk, isSigner: true, isWritable: true },
      { pubkey: huntPda, isSigner: false, isWritable: true },
      { pubkey: solVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(disc),
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

/**
 * Builds a real value-bearing Solana Devnet transaction that transfers either:
 * - Real Devnet SPL USDC (`CreateAssociatedTokenAccountIdempotent` + `TransferChecked`), OR
 * - Real native Devnet SOL (`SystemProgram.transfer` with exact lamports)
 * directly to `directTransfer.destination` (`ACTAKE_ESCROW_WALLET` or `ACTAKE_TREASURY_WALLET`),
 * paired with Actake's verifiable Memo receipt.
 */
export async function buildActakeEscrowTransferTransaction(params: {
  payerPublicKey: string;
  recentBlockhash: string;
  instructionType: 'create_pool' | 'join_pool' | 'claim_payout' | 'slash_personal';
  escrowPda: string;
  escrowWallet?: string | null;
  treasuryWallet?: string | null;
  token: TokenType;
  amount: number;
  directTransfer: ResolvedDirectTransferPlan;
  metadata?: Record<string, string | number>;
}): Promise<Transaction> {
  const payer = new PublicKey(params.payerPublicKey);
  const destinationPk = new PublicKey(params.directTransfer.destination);
  const tx = new Transaction({
    feePayer: payer,
    recentBlockhash: params.recentBlockhash as NonNullable<Transaction['recentBlockhash']>,
  });

  if (
    params.directTransfer.asset === 'USDC' &&
    params.directTransfer.baseUnits &&
    params.directTransfer.baseUnits > 0n
  ) {
    const mintPk = new PublicKey(params.directTransfer.mint || TOKEN_CONFIGS.USDC.mint);
    const decimals = params.directTransfer.decimals ?? TOKEN_CONFIGS.USDC.decimals;
    const [sourceAta, destAta] = await Promise.all([
      deriveAssociatedTokenAddress(payer, mintPk),
      deriveAssociatedTokenAddress(destinationPk, mintPk),
    ]);

    // Idempotently ensure the Escrow or Treasury wallet has its USDC ATA initialized
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(payer, destAta, destinationPk, mintPk)
    );
    // Transfer real SPL USDC directly from sender ATA to Escrow/Treasury ATA
    tx.add(
      createSplTransferCheckedInstruction(
        sourceAta,
        mintPk,
        destAta,
        payer,
        params.directTransfer.baseUnits,
        decimals
      )
    );
  } else {
    const lamports = Math.max(5_000, Math.round(params.directTransfer.lamports || 0));
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: destinationPk,
        lamports,
      })
    );
  }

  const validEscrow = parsePublicSolanaAddress(params.escrowWallet) || CONFIGURED_CLIENT_ESCROW_WALLET;
  const validTreasury =
    parsePublicSolanaAddress(params.treasuryWallet) || CONFIGURED_CLIENT_TREASURY_WALLET;

  const memoPayload = JSON.stringify({
    program: IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED ? ACTAKE_ESCROW_PROGRAM_ID : 'actake_escrow',
    mode: IS_CUSTOM_ANCHOR_ESCROW_DEPLOYED ? 'anchor_devnet' : 'devnet_direct_transfer',
    ix: params.instructionType,
    pda: params.escrowPda,
    destination: destinationPk.toBase58(),
    settledAsset: params.directTransfer.asset,
    settledAmount: params.directTransfer.displayAmount,
    usdValue: params.directTransfer.usdEquivalent,
    ...(validEscrow ? { escrowWallet: validEscrow } : {}),
    ...(validTreasury ? { treasuryWallet: validTreasury } : {}),
    token: params.token,
    feePct: TOKEN_CONFIGS[params.token].protocolFeePct,
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
