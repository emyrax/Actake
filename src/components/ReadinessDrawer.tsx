import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Coins,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Globe,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';
import {
  DevnetSyncState,
  PlatformCompatibility,
  SystemReadinessReport,
  TreasurySummaryReport,
  WalletSession,
} from '../types/actake';
import {
  buildDevnetExplorerAddressUrl,
  requestDevnetSolAirdrop,
} from '../solana/actakeEscrow';
import { isPollarConfigured } from '../solana/pollarBridge';
import { useActakePollar } from '../context/ActakePollarProvider';
import { shortenAddress } from '../solana/walletManager';
import { DiagnosticsGridSkeleton, ErrorStateCard } from './UiPrimitives';

interface ReadinessDrawerProps {
  wallet: WalletSession;
  platform: PlatformCompatibility;
  devnet: DevnetSyncState;
  onRefreshDevnet: () => Promise<void> | void;
  onClose: () => void;
}

export const ReadinessDrawer: React.FC<ReadinessDrawerProps> = ({
  wallet,
  platform,
  devnet,
  onRefreshDevnet,
  onClose,
}) => {
  const [report, setReport] = useState<SystemReadinessReport | null>(null);
  const [treasurySummary, setTreasurySummary] = useState<TreasurySummaryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [airdropping, setAirdropping] = useState(false);
  const [airdropResult, setAirdropResult] = useState<{
    signature: string;
    explorerUrl: string;
    solAmount: number;
  } | null>(null);
  const [airdropError, setAirdropError] = useState<string | null>(null);

  const pollar = useActakePollar();
  const pollarConfigured = isPollarConfigured();
  const pollarOriginBlocked =
    pollarConfigured &&
    (pollar.configErrorCode === 'ORIGIN_NOT_ALLOWED' || pollar.configStatus === 'error');

  const fetchReadiness = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [readinessResp, treasuryResp] = await Promise.all([
        fetch('/api/system/readiness'),
        fetch('/api/treasury/summary'),
      ]);
      const data = await readinessResp.json();
      if (!readinessResp.ok) {
        throw new Error(data.error || 'Could not inspect server readiness.');
      }
      setReport(data as SystemReadinessReport);
      if (treasuryResp.ok) {
        const tData = (await treasuryResp.json()) as TreasurySummaryReport;
        setTreasurySummary(tData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch diagnostics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReadiness();
  }, [fetchReadiness]);

  const copyValue = async (label: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleRequestAirdrop = async () => {
    setAirdropping(true);
    setAirdropError(null);
    setAirdropResult(null);
    try {
      const res = await requestDevnetSolAirdrop(wallet.publicKey, 1);
      setAirdropResult(res);
      window.setTimeout(() => {
        void onRefreshDevnet();
      }, 1500);
    } catch (err) {
      setAirdropError(err instanceof Error ? err.message : 'Devnet airdrop failed.');
    } finally {
      setAirdropping(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="readiness-drawer-title"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[#111114]/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-[32px] sm:rounded-[32px] bg-[#FFF8F4] text-[#111114] shadow-2xl border border-[#F2E2D8]"
      >
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-[#FFF8F4]/95 backdrop-blur-md px-6 py-5 border-b border-[#F2E2D8] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#F16A2E]">Solana Devnet Diagnostics</div>
            <h2
              id="readiness-drawer-title"
              className="font-display text-xl font-extrabold text-[#111114] truncate"
            >
              Setup &amp; Anchor Escrow Readiness
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                void fetchReadiness();
                void onRefreshDevnet();
              }}
              disabled={loading}
              aria-label="Refresh diagnostics"
              className="w-11 h-11 rounded-full bg-white border border-[#F0E3DB] hover:bg-[#FFF2EA] flex items-center justify-center text-[#111114] transition-colors"
            >
              <RefreshCw className={`w-4 h-4 text-[#F16A2E] ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close diagnostics"
              className="w-11 h-11 rounded-full bg-[#111114] text-white hover:bg-[#F16A2E] flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <ErrorStateCard
              title="Diagnostics Check Failed"
              message={error}
              onRetry={() => void fetchReadiness()}
              retryLabel="Retry Check"
            />
          )}

          {/* Connected Wallet + Devnet SOL Airdrop Bar */}
          <div className="rounded-3xl bg-[#141416] text-white p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-white/60">
                  Connected Devnet Wallet ({wallet.connectionKind.toUpperCase()})
                </div>
                <div className="font-mono text-sm font-bold mt-0.5 flex flex-wrap items-center gap-2">
                  <span>{shortenAddress(wallet.publicKey, 8)}</span>
                  <a
                    href={buildDevnetExplorerAddressUrl(wallet.publicKey)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#F16A2E] hover:underline inline-flex items-center gap-1 text-xs font-sans font-semibold"
                  >
                    <span>Explorer</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="text-xs text-white/75 mt-1 tabular-nums">
                  Gas Balance:{' '}
                  <span className="font-mono font-bold text-[#4ADE80]">
                    {devnet.solBalance !== null ? `${devnet.solBalance.toFixed(4)} SOL` : 'Syncing...'}
                  </span>
                  {devnet.slot ? ` · Slot ${devnet.slot.toLocaleString()}` : ''}
                </div>
              </div>

              <button
                type="button"
                disabled={airdropping}
                onClick={() => void handleRequestAirdrop()}
                className="min-h-[44px] px-4 py-2 rounded-full bg-[#F16A2E] hover:bg-[#DF5B20] disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Coins className="w-4 h-4" />
                <span>{airdropping ? 'Requesting SOL...' : 'Airdrop 1 Devnet SOL'}</span>
              </button>
            </div>

            {airdropResult && (
              <div className="rounded-2xl bg-[#16A34A]/20 border border-[#4ADE80]/30 px-3.5 py-2.5 text-xs text-[#DCFCE7] flex flex-wrap items-center justify-between gap-2">
                <span>+{airdropResult.solAmount} SOL requested on Devnet!</span>
                <a
                  href={airdropResult.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline inline-flex items-center gap-1 text-white"
                >
                  <span>View Tx</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {airdropError && (
              <div className="rounded-2xl bg-[#DC2626]/20 border border-[#FCA5A5]/30 px-3.5 py-2.5 text-xs text-[#FECACA]">
                {airdropError}
              </div>
            )}
          </div>

          {/* Layout-Matched Skeleton Grid while Fetching */}
          {loading && !report ? (
            <DiagnosticsGridSkeleton />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Solana Devnet RPC */}
              <div className="actake-card p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-[#111114]">
                    <Globe className="w-4 h-4 text-[#F16A2E]" />
                    <span>Solana RPC</span>
                  </span>
                  <StatusText
                    ok={Boolean(report?.solanaRpc.reachable)}
                    okLabel={report?.solanaRpc.customEndpoint ? 'Custom RPC' : 'Devnet Default'}
                    warnLabel="Unreachable"
                  />
                </div>
                <p className="text-xs text-[#6B6663] tabular-nums">
                  {report?.solanaRpc.liveSlot
                    ? `Cluster: ${report.solanaRpc.cluster} · Slot ${report.solanaRpc.liveSlot.toLocaleString()} (${report.solanaRpc.latencyMs}ms)`
                    : 'Checking Solana Devnet endpoint...'}
                </p>
                {!report?.solanaRpc.customEndpoint && (
                  <p className="text-[11px] text-[#877F7A]">
                    Optional: Set <code className="font-mono">SOLANA_RPC_URL</code> in env vars for
                    higher rate limits.
                  </p>
                )}
              </div>

              {/* Supabase PostgreSQL */}
              <div className="actake-card p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-[#111114]">
                    <Database className="w-4 h-4 text-[#4F46E5]" />
                    <span>Supabase Database</span>
                  </span>
                  <StatusText
                    ok={Boolean(report?.supabase.reachable)}
                    okLabel="PostgreSQL Live"
                    warnLabel={report?.supabase.configured ? 'Run Schema SQL' : 'Memory Mode'}
                  />
                </div>
                <p className="text-xs text-[#6B6663]">
                  {report?.supabase.reachable
                    ? 'Pools, participants, check-ins, and settlements persist in Supabase.'
                    : report?.supabase.detail ||
                      'Add SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY in environment variables.'}
                </p>
                {report?.supabase.configured && !report?.supabase.reachable && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const resp = await fetch('/api/system/supabase-schema');
                        if (resp.ok) {
                          const sql = await resp.text();
                          await copyValue('supabaseSql', sql);
                        }
                      } catch {
                        // ignore
                      }
                    }}
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EEF2FF] hover:bg-[#4F46E5] text-[#4F46E5] hover:text-white text-[11px] font-bold transition-colors"
                  >
                    {copiedField === 'supabaseSql' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>SQL Copied! Paste in Supabase SQL Editor</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy supabase/schema.sql</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Pollar Protocol + MWA */}
              <div className="actake-card p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-[#111114]">
                    <Smartphone className="w-4 h-4 text-[#F16A2E]" />
                    <span>Pollar Protocol &amp; MWA</span>
                  </span>
                  <StatusText
                    ok={pollarConfigured && !pollarOriginBlocked}
                    okLabel="Pollar Live"
                    warnLabel={
                      !pollarConfigured
                        ? 'API Key Missing'
                        : pollar.configErrorCode === 'RATE_LIMITED'
                          ? 'Rate Limited'
                          : pollar.configErrorCode === 'ORIGIN_NOT_ALLOWED'
                            ? 'Whitelist Origin'
                            : 'Config Error'
                    }
                  />
                </div>
                <p className="text-xs text-[#6B6663]">
                  {platform.mwaSupported
                    ? 'Android Chrome MWA active. '
                    : 'MWA activates on Android Chrome. '}
                  {!pollarConfigured
                    ? 'Add VITE_POLLAR_API_KEY from dashboard.pollar.xyz (enable Solana).'
                    : pollar.configErrorCode === 'RATE_LIMITED'
                      ? 'Pollar temporarily throttled requests (429). Wait ~30 seconds and retry.'
                      : pollarOriginBlocked
                        ? 'Pollar returned 403 ORIGIN_NOT_ALLOWED. Whitelist this app origin in dashboard.pollar.xyz → Developers → Websites.'
                        : 'Pollar Sign-In, Fiat Ramp funding & Solana SPL payments enabled.'}
                </p>
                {pollarOriginBlocked &&
                  pollar.configErrorCode !== 'RATE_LIMITED' &&
                  pollar.currentOrigin && (
                    <button
                      type="button"
                      onClick={() => void copyValue('pollarOrigin', pollar.currentOrigin)}
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFF2EA] hover:bg-[#F16A2E] text-[#F16A2E] hover:text-white text-[11px] font-bold transition-colors"
                    >
                      {copiedField === 'pollarOrigin' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Origin Copied! Paste in Pollar Dashboard</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy App Origin URL</span>
                        </>
                      )}
                    </button>
                  )}
              </div>

              {/* Gemini Vision Oracle */}
              <div className="actake-card p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-[#111114]">
                    <Sparkles className="w-4 h-4 text-[#16A34A]" />
                    <span>Gemini Vision Oracle</span>
                  </span>
                  <StatusText
                    ok={Boolean(report?.gemini.configured)}
                    okLabel="Configured"
                    warnLabel="Missing Key"
                  />
                </div>
                <p className="text-xs text-[#6B6663]">
                  Server-side live photo verification &amp; randomized anti-cheat object/workout
                  generator.
                </p>
              </div>
            </div>
          )}

          {/* Dual-Wallet Escrow Vault & Fee Treasury Ledger */}
          {report && (
            <div className="actake-card p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-[#F16A2E]" />
                  <h3 className="font-display text-sm font-extrabold text-[#111114]">
                    Dual-Wallet Escrow Vault &amp; Fee Treasury
                  </h3>
                </div>
                <StatusText
                  ok={
                    Boolean(report.treasury?.escrowConfigured) &&
                    Boolean(report.treasury?.treasuryConfigured)
                  }
                  okLabel="Both Wallets Live"
                  warnLabel="Set Env Wallets"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Escrow Vault Wallet */}
                <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#111114]">Escrow Vault Wallet</span>
                    <StatusText
                      ok={Boolean(report.treasury?.escrowConfigured)}
                      okLabel="Active"
                      warnLabel="Not Set"
                    />
                  </div>
                  <p className="text-[11px] text-[#6B6663]">
                    Holds active USDC &amp; SKR stake deposits.
                  </p>
                  {report.treasury?.escrowWallet ? (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="font-mono text-[11px] text-[#111114] truncate">
                        {shortenAddress(report.treasury.escrowWallet, 6)}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            void copyValue('escrowWallet', report.treasury.escrowWallet || '')
                          }
                          className="font-bold text-[#F16A2E] hover:underline inline-flex items-center gap-1"
                        >
                          {copiedField === 'escrowWallet' ? (
                            <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedField === 'escrowWallet' ? 'Copied' : 'Copy'}</span>
                        </button>
                        <a
                          href={buildDevnetExplorerAddressUrl(report.treasury.escrowWallet)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#6B6663] hover:text-[#F16A2E]"
                          aria-label="Inspect Escrow Vault on Solana Explorer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="font-mono text-[11px] text-[#92400E] pt-1">
                      Set ACTAKE_ESCROW_WALLET in Vercel env vars
                    </p>
                  )}
                </div>

                {/* Fee Treasury Wallet */}
                <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#111114]">Fee Treasury Wallet</span>
                    <StatusText
                      ok={Boolean(report.treasury?.treasuryConfigured)}
                      okLabel="Active"
                      warnLabel="Not Set"
                    />
                  </div>
                  <p className="text-[11px] text-[#6B6663]">
                    Collects 1.5% USDC fees &amp; 50% solo slashes (50% back to owner).
                  </p>
                  {report.treasury?.treasuryWallet ? (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="font-mono text-[11px] text-[#111114] truncate">
                        {shortenAddress(report.treasury.treasuryWallet, 6)}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            void copyValue('treasuryWallet', report.treasury.treasuryWallet || '')
                          }
                          className="font-bold text-[#F16A2E] hover:underline inline-flex items-center gap-1"
                        >
                          {copiedField === 'treasuryWallet' ? (
                            <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedField === 'treasuryWallet' ? 'Copied' : 'Copy'}</span>
                        </button>
                        <a
                          href={buildDevnetExplorerAddressUrl(report.treasury.treasuryWallet)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#6B6663] hover:text-[#F16A2E]"
                          aria-label="Inspect Fee Treasury on Solana Explorer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="font-mono text-[11px] text-[#92400E] pt-1">
                      Set ACTAKE_TREASURY_WALLET in Vercel env vars
                    </p>
                  )}
                </div>
              </div>

              {treasurySummary && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-3 gap-2.5 text-xs">
                    <div className="rounded-2xl bg-white border border-[#F0E3DB] p-3">
                      <div className="text-[11px] text-[#6B6663]">Active Escrow</div>
                      <div className="font-mono font-extrabold text-sm text-[#111114] tabular-nums mt-0.5">
                        ${treasurySummary.totals.activeEscrowUsdc.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-[#877F7A] tabular-nums">
                        {treasurySummary.totals.activeEscrowSkr.toFixed(2)} SKR
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white border border-[#F0E3DB] p-3">
                      <div className="text-[11px] text-[#6B6663]">Protocol Fees</div>
                      <div className="font-mono font-extrabold text-sm text-[#16A34A] tabular-nums mt-0.5">
                        ${treasurySummary.totals.protocolFeesUsdc.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-[#877F7A]">1.5% USDC · 0% SKR</div>
                    </div>
                    <div className="rounded-2xl bg-white border border-[#F0E3DB] p-3">
                      <div className="text-[11px] text-[#6B6663]">Solo Slashes</div>
                      <div className="font-mono font-extrabold text-sm text-[#F16A2E] tabular-nums mt-0.5">
                        ${treasurySummary.totals.soloSlashedUsdc.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-[#877F7A] tabular-nums">
                        {treasurySummary.totals.soloSlashedSkr.toFixed(2)} SKR (50%)
                      </div>
                    </div>
                  </div>

                  {treasurySummary.recentEntries.length > 0 ? (
                    <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] divide-y divide-[#F2E3DA]">
                      {treasurySummary.recentEntries.slice(0, 5).map((entry) => (
                        <div
                          key={entry.id}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-[#111114] truncate">
                              {entry.poolTitle}
                            </div>
                            <div className="text-[11px] text-[#6B6663]">
                              {entry.entryType === 'solo_slash'
                                ? 'Solo Slash (50% Treasury / 50% Owner)'
                                : 'Protocol Fee (1.5%)'}{' '}
                              · {entry.status === 'swept' ? 'Swept' : 'Accrued'}
                            </div>
                          </div>
                          <div className="font-mono font-bold text-[#16A34A] tabular-nums shrink-0">
                            +${entry.amount.toFixed(2)} {entry.tokenSymbol}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#877F7A]">
                      No protocol fees or forfeited solo stakes recorded yet. Completed USDC payouts
                      and missed personal commitments appear here automatically.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Ed25519 Oracle Public Key & Anchor Escrow Program Section */}
          {report && (
            <div className="actake-card p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#F16A2E]" />
                  <h3 className="font-display text-sm font-extrabold text-[#111114]">
                    Ed25519 Oracle &amp; Anchor Escrow Contract
                  </h3>
                </div>
                <StatusText
                  ok={report.oracle.persistentKey}
                  okLabel="Persistent Seed"
                  warnLabel="Ephemeral Dev Key"
                />
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-3.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#6B6663]">
                      Oracle Public Key (Hex — pass to Anchor create_pool)
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyValue('oracleHex', report.oracle.publicKeyHex)}
                      className="min-h-[32px] inline-flex items-center gap-1 font-bold text-[#F16A2E] hover:underline"
                    >
                      {copiedField === 'oracleHex' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                          <span className="text-[#16A34A]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-[#111114] break-all">
                    {report.oracle.publicKeyHex}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#6B6663] inline-flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-[#4F46E5]" />
                      <span>Active Escrow Execution Mode</span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-[#111114]">
                      {report.escrowProgram.mode === 'anchor-escrow'
                        ? 'Deployed Anchor PDA Program'
                        : 'Devnet Ed25519 + Memo Broadcast'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-[#6B6663] truncate">
                      Program ID: {report.escrowProgram.programId}
                    </span>
                    <a
                      href={buildDevnetExplorerAddressUrl(report.escrowProgram.programId)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#F16A2E] hover:underline shrink-0"
                    >
                      <span>Explorer</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  {!report.escrowProgram.customDeployed && (
                    <p className="text-[11px] text-[#877F7A] leading-relaxed pt-1">
                      Smart contract source is ready at{' '}
                      <code className="font-mono">programs/actake_escrow/</code>. Deploy with{' '}
                      <code className="font-mono">anchor deploy --provider.cluster devnet</code>{' '}
                      and set <code className="font-mono">VITE_ACTAKE_ESCROW_PROGRAM_ID</code> to
                      switch from Devnet Memo receipts to full PDA token vaults.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-[#6B6663] pt-1">
                <ShieldCheck className="w-4 h-4 text-[#16A34A] shrink-0" />
                <span>
                  All private keys (<code className="font-mono">GEMINI_API_KEY</code>,{' '}
                  <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>,{' '}
                  <code className="font-mono">ORACLE_PRIVATE_KEY_HEX</code>) stay exclusively on the
                  server and are never exposed to the browser.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function StatusText({
  ok,
  okLabel,
  warnLabel,
}: {
  ok: boolean;
  okLabel: string;
  warnLabel: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold ${
        ok ? 'text-[#16A34A]' : 'text-[#D97706]'
      }`}
    >
      {ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
      )}
      <span>{ok ? okLabel : warnLabel}</span>
    </span>
  );
}
