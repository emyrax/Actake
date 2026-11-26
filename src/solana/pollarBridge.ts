import {
  PollarClient,
  type SendPaymentParams,
  type WalletBalanceRecord,
  type WalletBalanceState,
  type WalletInfo,
} from '@pollar/core';
import { solanaWalletStandardAdapters } from '@pollar/solana-wallet-standard-adapter';
import { ensureMwaRegistered } from './registerMwa';
import { TOKEN_CONFIGS } from './actakeEscrow';
import type { TokenType } from '../types/actake';

export function getPollarApiKey(): string {
  const key = import.meta.env.VITE_POLLAR_API_KEY;
  return typeof key === 'string' ? key.trim() : '';
}

export function getPollarBaseUrl(): string | undefined {
  const url = import.meta.env.VITE_POLLAR_BASE_URL;
  return typeof url === 'string' && url.trim().length > 0 ? url.trim() : undefined;
}

export function isPollarConfigured(): boolean {
  return getPollarApiKey().length >= 8;
}

interface PollarClientGuardState {
  key: string;
  client: PollarClient;
  balanceInFlight: Promise<void> | null;
  balanceCooldownUntil: number;
  configInFlight: Promise<Awaited<ReturnType<PollarClient['getAppConfig']>>> | null;
  configCachedValue: Awaited<ReturnType<PollarClient['getAppConfig']>> | undefined;
  configCachedUntil: number;
  recoveryInFlight: Promise<unknown> | null;
  recoveryCachedValue: unknown;
  recoveryCachedUntil: number;
  migrationInFlight: Promise<unknown> | null;
  migrationCachedValue: unknown;
  migrationCachedUntil: number;
}

const GLOBAL_POLLAR_KEY = '__ACTAKE_POLLAR_SINGLETON_V1__';

function getGlobalGuard(): PollarClientGuardState | null {
  if (typeof globalThis === 'undefined') return null;
  return (globalThis as Record<string, unknown>)[GLOBAL_POLLAR_KEY] as PollarClientGuardState | null ?? null;
}

function setGlobalGuard(state: PollarClientGuardState | null): void {
  if (typeof globalThis === 'undefined') return;
  (globalThis as Record<string, unknown>)[GLOBAL_POLLAR_KEY] = state;
}

/**
 * Clears cached rate-limit / balance / cosign windows (e.g. on logout or explicit retry).
 */
export function resetActakePollarRateGuards(options?: { includeConfig?: boolean }): void {
  const guard = getGlobalGuard();
  if (!guard) return;
  guard.balanceInFlight = null;
  guard.balanceCooldownUntil = 0;
  guard.recoveryInFlight = null;
  guard.recoveryCachedValue = undefined;
  guard.recoveryCachedUntil = 0;
  guard.migrationInFlight = null;
  guard.migrationCachedValue = undefined;
  guard.migrationCachedUntil = 0;
  if (options?.includeConfig) {
    guard.configInFlight = null;
    guard.configCachedValue = undefined;
    guard.configCachedUntil = 0;
  }
}

/**
 * Explicitly refreshes Pollar wallet balance while still enforcing in-flight
 * deduplication and a short safety window to avoid HTTP 429 bursts.
 */
export async function forceRefreshActakePollarBalance(): Promise<void> {
  const guard = getGlobalGuard();
  if (!guard) return;
  if (guard.balanceInFlight) return guard.balanceInFlight;
  // Reset normal cooldown for explicit user click, unless still inside a 5s safety gap
  const now = Date.now();
  if (guard.balanceCooldownUntil - now > 5_000) {
    guard.balanceCooldownUntil = 0;
  }
  await guard.client.refreshBalance();
}

/**
 * Returns a strict global singleton PollarClient bound to Actake's publishable
 * API key, with installed Solana Wallet Standard adapters and built-in
 * deduplication + backoff guards on balance, app config, and cosign reads so
 * Pollar's SDK endpoints cannot be burst into HTTP 429 RATE_LIMITED errors.
 */
export function createActakePollarClient(): PollarClient | null {
  const apiKey = getPollarApiKey();
  if (!apiKey) return null;

  const baseUrl = getPollarBaseUrl();
  const cacheKey = `${apiKey}|${baseUrl || 'default'}`;

  const existing = getGlobalGuard();
  if (existing && existing.key === cacheKey) {
    return existing.client;
  }

  ensureMwaRegistered();

  let solanaAdapters: ReturnType<typeof solanaWalletStandardAdapters> = [];
  try {
    solanaAdapters = solanaWalletStandardAdapters({
      groupLabel: 'Solana Wallet',
    });
  } catch (err) {
    console.warn('Solana Wallet Standard discovery for Pollar skipped:', err);
  }

  const client = new PollarClient({
    apiKey,
    baseUrl,
    walletAdapters: solanaAdapters,
    deviceLabel: 'Actake Web App',
    retry: { attempts: 1, baseDelayMs: 1200 },
    logLevel: 'warn',
  });

  const guard: PollarClientGuardState = {
    key: cacheKey,
    client,
    balanceInFlight: null,
    balanceCooldownUntil: 0,
    configInFlight: null,
    configCachedValue: undefined,
    configCachedUntil: 0,
    recoveryInFlight: null,
    recoveryCachedValue: undefined,
    recoveryCachedUntil: 0,
    migrationInFlight: null,
    migrationCachedValue: undefined,
    migrationCachedUntil: 0,
  };

  // Guard client.refreshBalance() directly so both Actake components AND
  // @pollar/react modals (WalletBalanceModal, SendModal, RampWidget) share
  // strict deduplication and 429/error backoff.
  const rawRefreshBalance = client.refreshBalance.bind(client);
  client.refreshBalance = async () => {
    if (!client.hasWallet()) return;
    if (guard.balanceInFlight) return guard.balanceInFlight;
    const now = Date.now();
    if (now < guard.balanceCooldownUntil) return;

    guard.balanceCooldownUntil = now + 15_000;
    const task = (async () => {
      try {
        await rawRefreshBalance();
        // PollarClient.refreshBalance catches HTTP errors internally and updates
        // walletBalanceState to step === 'error'. Back off 60s on failure/429.
        const state = client.getWalletBalanceState();
        if (state.step === 'error') {
          guard.balanceCooldownUntil = Date.now() + 60_000;
        } else {
          guard.balanceCooldownUntil = Date.now() + 15_000;
        }
      } catch {
        guard.balanceCooldownUntil = Date.now() + 60_000;
      } finally {
        guard.balanceInFlight = null;
      }
    })();

    guard.balanceInFlight = task;
    return task;
  };

  // Guard client.getAppConfig() so /applications/config is cached and deduplicated.
  const rawGetAppConfig = client.getAppConfig.bind(client);
  client.getAppConfig = async () => {
    const now = Date.now();
    if (guard.configCachedValue !== undefined && now < guard.configCachedUntil) {
      return guard.configCachedValue;
    }
    if (guard.configInFlight) return guard.configInFlight;

    const task = (async () => {
      try {
        const result = await rawGetAppConfig();
        guard.configCachedValue = result;
        // Cache successful config for 5 minutes; back off 20s on null/429 failure.
        guard.configCachedUntil = Date.now() + (result ? 300_000 : 20_000);
        return result;
      } catch {
        guard.configCachedValue = null;
        guard.configCachedUntil = Date.now() + 20_000;
        return null;
      } finally {
        guard.configInFlight = null;
      }
    })();

    guard.configInFlight = task;
    return task;
  };

  // Guard cosign recovery & custodyMigration reads fired by PollarProvider
  if (client.cosign?.recovery?.status) {
    const rawRecoveryStatus = client.cosign.recovery.status.bind(client.cosign.recovery);
    client.cosign.recovery.status = async () => {
      const now = Date.now();
      if (guard.recoveryCachedValue !== undefined && now < guard.recoveryCachedUntil) {
        return guard.recoveryCachedValue as Awaited<ReturnType<typeof rawRecoveryStatus>>;
      }
      if (guard.recoveryInFlight) {
        return guard.recoveryInFlight as ReturnType<typeof rawRecoveryStatus>;
      }
      const task = (async () => {
        try {
          const result = await rawRecoveryStatus();
          guard.recoveryCachedValue = result;
          guard.recoveryCachedUntil = Date.now() + 45_000;
          return result;
        } catch (err) {
          guard.recoveryCachedValue = null;
          guard.recoveryCachedUntil = Date.now() + 45_000;
          throw err;
        } finally {
          guard.recoveryInFlight = null;
        }
      })();
      guard.recoveryInFlight = task;
      return task;
    };
  }

  if (client.cosign?.custodyMigration) {
    const rawCustodyMigration = client.cosign.custodyMigration.bind(client.cosign);
    client.cosign.custodyMigration = async () => {
      const now = Date.now();
      if (guard.migrationCachedValue !== undefined && now < guard.migrationCachedUntil) {
        return guard.migrationCachedValue as Awaited<ReturnType<typeof rawCustodyMigration>>;
      }
      if (guard.migrationInFlight) {
        return guard.migrationInFlight as ReturnType<typeof rawCustodyMigration>;
      }
      const task = (async () => {
        try {
          const result = await rawCustodyMigration();
          guard.migrationCachedValue = result;
          guard.migrationCachedUntil = Date.now() + 45_000;
          return result;
        } catch (err) {
          guard.migrationCachedValue = null;
          guard.migrationCachedUntil = Date.now() + 45_000;
          throw err;
        } finally {
          guard.migrationInFlight = null;
        }
      })();
      guard.migrationInFlight = task;
      return task;
    };
  }

  setGlobalGuard(guard);
  return client;
}

/**
 * Extracts the authenticated user's Solana wallet from Pollar's multi-chain
 * wallet list, falling back to the primary wallet if Solana is not yet listed.
 */
export function extractSolanaWalletFromPollar(
  wallets: WalletInfo[],
  primaryWallet: WalletInfo | null
): WalletInfo | null {
  const solanaWallet = wallets.find((w) => w.chain === 'SOLANA');
  if (solanaWallet) return solanaWallet;
  if (primaryWallet?.chain === 'SOLANA') return primaryWallet;
  return primaryWallet || wallets[0] || null;
}

export interface PollarSolanaBalanceSummary {
  sol: number | null;
  usdc: number | null;
  skr: number | null;
  records: WalletBalanceRecord[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

export function summarizePollarSolanaBalances(
  state: WalletBalanceState
): PollarSolanaBalanceSummary {
  if (state.step === 'loading') {
    return { sol: null, usdc: null, skr: null, records: [], loaded: false, loading: true, error: null };
  }
  if (state.step === 'error') {
    return {
      sol: null,
      usdc: null,
      skr: null,
      records: [],
      loaded: false,
      loading: false,
      error: state.message,
    };
  }
  if (state.step !== 'loaded') {
    return { sol: null, usdc: null, skr: null, records: [], loaded: false, loading: false, error: null };
  }

  const allBalances = state.data.balances || [];
  const solanaRecords = allBalances.filter((b) => !b.chain || b.chain === 'SOLANA');
  const pool = solanaRecords.length > 0 ? solanaRecords : allBalances;

  const parseAmount = (rec?: WalletBalanceRecord): number | null => {
    if (!rec) return null;
    const raw = rec.available ?? rec.balance;
    if (raw === null || raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const solRec = pool.find((r) => r.code.toUpperCase() === 'SOL' || (r.chain === 'SOLANA' && r.type === 'native'));
  const usdcRec = pool.find((r) => r.code.toUpperCase() === 'USDC');
  const skrRec = pool.find((r) => r.code.toUpperCase() === 'SKR');

  return {
    sol: parseAmount(solRec),
    usdc: parseAmount(usdcRec),
    skr: parseAmount(skrRec),
    records: pool,
    loaded: true,
    loading: false,
    error: null,
  };
}

/**
 * Builds a Solana SendPaymentParams payload for Pollar's `sendPayment()`.
 * Converts human token amounts into integer SPL base units (6 decimals for USDC/SKR).
 */
export function buildPollarSolanaPaymentParams(params: {
  destination: string;
  amount: number;
  token: TokenType;
}): SendPaymentParams {
  const tokenCfg = TOKEN_CONFIGS[params.token];
  const decimals = tokenCfg.decimals;
  const baseUnits = Math.max(1, Math.round(params.amount * 10 ** decimals)).toString();

  return {
    chain: 'SOLANA',
    destination: params.destination,
    amount: baseUnits,
    mint: tokenCfg.mint,
  };
}

export function formatPollarProviderLabel(wallet: WalletInfo): string {
  if (wallet.custody === 'smart') return 'Pollar Passkey Wallet';
  if (wallet.custody === 'external') {
    const p = wallet.provider ? String(wallet.provider) : 'Solana Wallet';
    return `Pollar · ${p.charAt(0).toUpperCase()}${p.slice(1)}`;
  }
  const p = wallet.provider ? String(wallet.provider) : 'Embedded';
  return `Pollar (${p.charAt(0).toUpperCase()}${p.slice(1)})`;
}
