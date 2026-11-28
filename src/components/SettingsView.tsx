import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  BellRing,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  HelpCircle,
  Landmark,
  ListChecks,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Vault,
  Volume2,
  Wallet,
} from 'lucide-react';
import {
  AlarmSettings,
  OnChainWalletBalanceSnapshot,
  StakeCommitment,
  TreasurySummaryReport,
  WalletSession,
} from '../types/actake';
import { shortenAddress } from '../solana/walletManager';
import { formatClockTime12h } from '../utils/timeUtils';
import { ALARM_SOUNDS } from '../utils/alarmAudio';
import { MascotDisplay } from './MascotDisplay';
import { ConfirmDialog } from './UiPrimitives';
import { MASCOT_THEME_OPTIONS, useMascotTheme } from '../context/MascotThemeContext';

interface SettingsViewProps {
  wallet: WalletSession;
  stakes: StakeCommitment[];
  alarmSettings: AlarmSettings;
  streakDays: number;
  actPoints: number;
  treasurySummary: TreasurySummaryReport | null;
  treasurySummaryLoading: boolean;
  treasurySummaryError: string | null;
  onRefreshTreasurySummary: () => void;
  onOpenWalletSheet: () => void;
  onOpenReadinessDrawer: () => void;
  onOpenAlarmSettings: () => void;
  onOpenCreateStake: () => void;
  onTriggerTestAlarm: (stake: StakeCommitment) => void;
  onDisconnectWallet: () => void;
}

const FAQ_ITEMS = [
  {
    q: 'Why does the camera target stay hidden until my alarm rings?',
    a: 'Actake generates a cryptographically randomized everyday object or workout move at alarm time so nobody can pre-stage a photo the night before.',
  },
  {
    q: 'How does the 0% Protocol Fee SKR perk work?',
    a: 'Staking with Token-2022 $SKR waives the 1.5% USDC protocol fee and awards 2x $ACT points on every verified check-in.',
  },
  {
    q: 'What happens if I sleep through my deadline?',
    a: 'Missed stakes are slashed from the escrow pool and split proportionally among squadmates who verified before the cutoff.',
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  wallet,
  stakes,
  alarmSettings,
  streakDays,
  actPoints,
  treasurySummary,
  treasurySummaryLoading,
  treasurySummaryError,
  onRefreshTreasurySummary,
  onOpenWalletSheet,
  onOpenReadinessDrawer,
  onOpenAlarmSettings,
  onOpenCreateStake,
  onTriggerTestAlarm,
  onDisconnectWallet,
}) => {
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'escrow' | 'treasury' | null>(null);
  const { mascotTheme, setMascotTheme } = useMascotTheme();

  const handleCopyAddress = async (kind: 'escrow' | 'treasury', address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedKey(kind);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === kind ? null : current));
      }, 1600);
    } catch {
      // ignore clipboard errors in restricted frames
    }
  };

  const escrowSnapshot: OnChainWalletBalanceSnapshot | null =
    treasurySummary?.onChain?.escrow ?? null;
  const treasurySnapshot: OnChainWalletBalanceSnapshot | null =
    treasurySummary?.onChain?.treasury ?? null;
  const solPriceUsd = treasurySummary?.onChain?.solPriceUsd ?? null;
  const slashLedgerCount =
    treasurySummary?.recentEntries?.filter(
      (e) => e.entryType === 'solo_slash' || e.entryType === 'zero_winner_slash'
    ).length ?? 0;
  const feeLedgerCount =
    treasurySummary?.recentEntries?.filter((e) => e.entryType === 'protocol_fee').length ?? 0;

  const activeStakes = stakes.filter((s) => s.status === 'locked' || s.status === 'ringing');
  const soundLabel =
    ALARM_SOUNDS.find((a) => a.id === alarmSettings.selectedSound)?.label || 'Siren';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* Profile Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <MascotDisplay
            variant="medallion"
            size="md"
            alt="Actake Profile Mascot"
          />
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#6B6663]">Connected Profile</div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight truncate">
              {wallet.walletName}
            </h1>
            <div className="text-xs font-mono text-[#6B6663] tabular-nums truncate">
              {shortenAddress(wallet.publicKey, 6)} · {streakDays}d streak ·{' '}
              {actPoints.toLocaleString()} $ACT
            </div>
          </div>
        </div>
      </div>

      {/* Mascot Visual Theme Toggle */}
      <section className="actake-card p-5 space-y-3.5" aria-labelledby="mascot-theme-heading">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              id="mascot-theme-heading"
              className="font-display text-sm font-extrabold text-[#111114]"
            >
              Mascot Visual Theme
            </h2>
            <p className="text-xs text-[#6B6663]">
              Choose how your Actake accountability buddy renders across the app
            </p>
          </div>
          <span className="text-xs font-semibold text-[#F16A2E] whitespace-nowrap shrink-0">
            {MASCOT_THEME_OPTIONS.find((opt) => opt.id === mascotTheme)?.label}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-labelledby="mascot-theme-heading"
          className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 rounded-2xl bg-[#FFF4EE] border border-[#E2D0C4]/70"
        >
          {MASCOT_THEME_OPTIONS.map((option) => {
            const selected = mascotTheme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMascotTheme(option.id)}
                className={`min-h-[56px] px-3 py-2.5 rounded-xl flex items-center gap-3 text-left transition-all duration-150 ${
                  selected
                    ? 'bg-[#111114] text-white shadow-sm'
                    : 'bg-transparent text-[#111114] hover:bg-white/80'
                }`}
              >
                <MascotDisplay
                  variant={selected ? 'obsidian' : 'medallion'}
                  size="xs"
                  themeOverride={option.id}
                  alt={`${option.label} preview`}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-xs font-bold leading-tight whitespace-nowrap truncate">
                    {option.label}
                  </div>
                  <div
                    className={`text-[11px] leading-snug line-clamp-1 mt-0.5 ${
                      selected ? 'text-white/75' : 'text-[#6B6663]'
                    }`}
                  >
                    {option.id === 'modern-minimalist'
                      ? 'Clean vector'
                      : option.id === 'retro-pixel'
                        ? '8-bit sprite'
                        : 'Studio render'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Seeker SKR 0% Fee Perk Banner */}
      <div className="actake-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <MascotDisplay
            variant="stage"
            size="lg"
            floating
            alt="Actake Seeker SKR Perk Mascot"
          />
          <div className="space-y-1.5 min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F16A2E]">
              <Sparkles className="w-4 h-4" />
              <span>Seeker Token-2022 Perk</span>
            </div>
            <div className="font-display text-2xl font-extrabold text-[#111114]">
              0% Protocol Fee on $SKR
            </div>
            <p className="text-xs text-[#6B6663] leading-relaxed">
              Stake with $SKR to waive protocol fees and earn 2x $ACT rewards on every verified
              deadline.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenCreateStake}
          className="min-h-[44px] px-5 py-2.5 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          Stake with $SKR
        </button>
      </div>

      {/* Group 1: Account & Diagnostics */}
      <section className="space-y-2.5">
        <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#877F7A] px-1">
          Account &amp; Diagnostics
        </h2>

        <button
          type="button"
          onClick={onOpenWalletSheet}
          className="w-full min-h-[68px] actake-card px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FFF9F5] transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-[#111114]">
                Profile &amp; Solana Wallet Vault
              </div>
              <div className="text-xs text-[#6B6663] truncate">
                Inspect connected pubkey, Devnet slot, Pollar Ramp &amp; MWA sessions
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#877F7A] shrink-0" />
        </button>

        <button
          type="button"
          onClick={onOpenReadinessDrawer}
          className="w-full min-h-[68px] actake-card px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FFF9F5] transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-[#ECFDF5] text-[#16A34A] flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-[#111114]">
                Devnet Setup &amp; Escrow Diagnostics
              </div>
              <div className="text-xs text-[#6B6663] truncate">
                Verify Supabase, RPC, Pollar API, copy Oracle pubkey &amp; airdrop Devnet SOL
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#877F7A] shrink-0" />
        </button>

        {/* Live On-Chain Escrow & Fee Treasury Balance Cards */}
        <div className="pt-2 space-y-2.5">
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <div className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#877F7A]">
                Live Escrow &amp; Treasury Vaults
              </div>
              <div className="text-[11px] text-[#6B6663] font-mono tabular-nums">
                Solana Devnet on-chain balances
                {solPriceUsd ? ` · SOL $${solPriceUsd.toFixed(2)}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={onRefreshTreasurySummary}
              disabled={treasurySummaryLoading}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white border border-[#E2D0C4]/80 hover:border-[#F16A2E] text-[#111114] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#F16A2E] ${treasurySummaryLoading ? 'animate-spin' : ''}`}
              />
              <span>{treasurySummaryLoading ? 'Syncing' : 'Refresh'}</span>
            </button>
          </div>

          {treasurySummaryError && !treasurySummary ? (
            <div className="actake-card p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <AlertCircle className="w-5 h-5 text-[#D97706] shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#111114]">
                    Unable to load live Devnet vault balances
                  </div>
                  <div className="text-xs text-[#6B6663] truncate">{treasurySummaryError}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onRefreshTreasurySummary}
                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold shrink-0 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : treasurySummaryLoading && !treasurySummary ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[0, 1].map((idx) => (
                <div key={idx} className="actake-card p-5 space-y-4 animate-pulse">
                  <div className="h-4 w-36 rounded bg-[#F2E5DC]" />
                  <div className="h-8 w-28 rounded bg-[#F2E5DC]" />
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#F4ECE7]">
                    <div className="h-8 rounded bg-[#F7EEE8]" />
                    <div className="h-8 rounded bg-[#F7EEE8]" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: Actake Escrow Vault */}
              <div className="actake-card p-5 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-10 h-10 rounded-xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
                        <Vault className="w-5 h-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-display text-sm font-extrabold text-[#111114] truncate">
                          Actake Escrow Vault
                        </div>
                        <div className="text-[11px] text-[#6B6663]">
                          Holds active stake deposits
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-semibold shrink-0 ${
                        escrowSnapshot?.reachable
                          ? 'text-[#16A34A]'
                          : escrowSnapshot
                            ? 'text-[#D97706]'
                            : 'text-[#D97706]'
                      }`}
                    >
                      {escrowSnapshot?.reachable
                        ? 'Live Devnet'
                        : escrowSnapshot
                          ? 'RPC Retry'
                          : 'Unconfigured'}
                    </span>
                  </div>

                  {escrowSnapshot ? (
                    <>
                      <div>
                        <div className="font-mono text-2xl font-extrabold text-[#111114] tabular-nums tracking-tight">
                          {escrowSnapshot.totalUsdEstimate !== null
                            ? `$${escrowSnapshot.totalUsdEstimate.toFixed(2)}`
                            : `${escrowSnapshot.solBalance.toFixed(4)} SOL`}
                        </div>
                        <div className="text-[11px] text-[#6B6663]">
                          Combined Devnet USD estimate
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#F4ECE7]">
                        <div>
                          <div className="text-[11px] text-[#877F7A] font-medium">Devnet USDC</div>
                          <div className="font-mono text-sm font-bold text-[#111114] tabular-nums">
                            ${escrowSnapshot.usdcBalance.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-[#877F7A] font-medium">Devnet SOL</div>
                          <div className="font-mono text-sm font-bold text-[#111114] tabular-nums">
                            {escrowSnapshot.solBalance.toFixed(4)}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="pt-2 text-xs text-[#6B6663] leading-relaxed">
                      Set <span className="font-mono text-[#111114]">ACTAKE_ESCROW_WALLET</span> in
                      your environment variables to route stake deposits on-chain.
                    </div>
                  )}
                </div>

                {escrowSnapshot && (
                  <div className="pt-3 border-t border-[#F4ECE7] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyAddress('escrow', escrowSnapshot.address)}
                      className="min-h-[34px] inline-flex items-center gap-1.5 font-mono text-xs text-[#6B6663] hover:text-[#111114] transition-colors truncate"
                      title={escrowSnapshot.address}
                    >
                      <span className="tabular-nums">
                        {shortenAddress(escrowSnapshot.address, 6)}
                      </span>
                      {copiedKey === 'escrow' ? (
                        <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-[#877F7A] shrink-0" />
                      )}
                    </button>
                    <a
                      href={escrowSnapshot.solscanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[34px] inline-flex items-center gap-1 text-xs font-bold text-[#F16A2E] hover:text-[#111114] whitespace-nowrap transition-colors"
                    >
                      <span>View on Solscan</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>

              {/* Card 2: Actake Fee Treasury */}
              <div className="actake-card p-5 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-10 h-10 rounded-xl bg-[#ECFDF5] text-[#16A34A] flex items-center justify-center shrink-0">
                        <Landmark className="w-5 h-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-display text-sm font-extrabold text-[#111114] truncate">
                          Actake Fee Treasury
                        </div>
                        <div className="text-[11px] text-[#6B6663]">
                          50% solo slashes &amp; 1.5% USDC fees
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-semibold shrink-0 ${
                        treasurySnapshot?.reachable
                          ? 'text-[#16A34A]'
                          : treasurySnapshot
                            ? 'text-[#D97706]'
                            : 'text-[#D97706]'
                      }`}
                    >
                      {treasurySnapshot?.reachable
                        ? 'Live Devnet'
                        : treasurySnapshot
                          ? 'RPC Retry'
                          : 'Unconfigured'}
                    </span>
                  </div>

                  {treasurySnapshot ? (
                    <>
                      <div>
                        <div className="font-mono text-2xl font-extrabold text-[#111114] tabular-nums tracking-tight">
                          {treasurySnapshot.totalUsdEstimate !== null
                            ? `$${treasurySnapshot.totalUsdEstimate.toFixed(2)}`
                            : `${treasurySnapshot.solBalance.toFixed(4)} SOL`}
                        </div>
                        <div className="text-[11px] text-[#6B6663] tabular-nums">
                          {slashLedgerCount} slash{slashLedgerCount === 1 ? '' : 'es'} ·{' '}
                          {feeLedgerCount} fee settlement{feeLedgerCount === 1 ? '' : 's'} logged
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#F4ECE7]">
                        <div>
                          <div className="text-[11px] text-[#877F7A] font-medium">Devnet USDC</div>
                          <div className="font-mono text-sm font-bold text-[#111114] tabular-nums">
                            ${treasurySnapshot.usdcBalance.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-[#877F7A] font-medium">Devnet SOL</div>
                          <div className="font-mono text-sm font-bold text-[#111114] tabular-nums">
                            {treasurySnapshot.solBalance.toFixed(4)}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="pt-2 text-xs text-[#6B6663] leading-relaxed">
                      Set <span className="font-mono text-[#111114]">ACTAKE_TREASURY_WALLET</span>{' '}
                      in your environment variables to collect slashed stakes and protocol fees.
                    </div>
                  )}
                </div>

                {treasurySnapshot && (
                  <div className="pt-3 border-t border-[#F4ECE7] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyAddress('treasury', treasurySnapshot.address)}
                      className="min-h-[34px] inline-flex items-center gap-1.5 font-mono text-xs text-[#6B6663] hover:text-[#111114] transition-colors truncate"
                      title={treasurySnapshot.address}
                    >
                      <span className="tabular-nums">
                        {shortenAddress(treasurySnapshot.address, 6)}
                      </span>
                      {copiedKey === 'treasury' ? (
                        <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-[#877F7A] shrink-0" />
                      )}
                    </button>
                    <a
                      href={treasurySnapshot.solscanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[34px] inline-flex items-center gap-1 text-xs font-bold text-[#F16A2E] hover:text-[#111114] whitespace-nowrap transition-colors"
                    >
                      <span>View on Solscan</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Group 2: Alarms & Habits */}
      <section className="space-y-2.5">
        <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#877F7A] px-1">
          Alarms &amp; Habits
        </h2>

        <div className="actake-card overflow-hidden">
          <button
            type="button"
            onClick={() => setHabitsOpen((v) => !v)}
            className="w-full min-h-[68px] px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FFF9F5] transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="w-11 h-11 rounded-2xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center shrink-0">
                <ListChecks className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-sm font-bold text-[#111114]">
                  Manage Habits ({activeStakes.length} active)
                </div>
                <div className="text-xs text-[#6B6663]">
                  Review deadlines, motivation notes, and trigger alarm tests
                </div>
              </div>
            </div>
            {habitsOpen ? (
              <ChevronDown className="w-4 h-4 text-[#877F7A] shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#877F7A] shrink-0" />
            )}
          </button>

          {habitsOpen && (
            <div className="px-5 pb-4 pt-1 border-t border-[#F4ECE7] divide-y divide-[#F6EFEA]">
              {activeStakes.length === 0 ? (
                <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-[#6B6663]">
                    No active habit stakes right now. Lock your first daily deadline to arm an
                    alarm.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenCreateStake}
                    className="min-h-[40px] px-4 py-1.5 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create First Stake</span>
                  </button>
                </div>
              ) : (
                activeStakes.map((s) => {
                  const fmt = formatClockTime12h(s.alarmHour, s.alarmMinute);
                  return (
                    <div
                      key={s.id}
                      className="py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#111114] truncate">{s.categoryName}</div>
                        <div className="text-[#6B6663] tabular-nums">
                          {fmt.full} · ${s.amount.toFixed(2)} {s.token}
                          {s.motivationNote ? ` · “${s.motivationNote}”` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onTriggerTestAlarm(s)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-[#FFF2EA] hover:bg-[#F16A2E] text-[#F16A2E] hover:text-white font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        <span>Test</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenAlarmSettings}
          className="w-full min-h-[68px] actake-card px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FFF9F5] transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
              <Volume2 className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-[#111114]">
                Alarm Sound &amp; Strict Mode
              </div>
              <div className="text-xs text-[#6B6663]">
                {soundLabel} · {alarmSettings.strictMode ? 'Strict Lock Enabled' : 'Standard Mode'}{' '}
                · {Math.round(alarmSettings.volume * 100)}% volume
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#877F7A] shrink-0" />
        </button>
      </section>

      {/* Group 3: Support & Session */}
      <section className="space-y-2.5">
        <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#877F7A] px-1">
          Support &amp; Session
        </h2>

        <div className="actake-card overflow-hidden">
          <button
            type="button"
            onClick={() => setFaqOpen((v) => !v)}
            className="w-full min-h-[68px] px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FFF9F5] transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="w-11 h-11 rounded-2xl bg-[#ECFDF5] text-[#16A34A] flex items-center justify-center shrink-0">
                <HelpCircle className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-sm font-bold text-[#111114]">
                  Anti-Cheat &amp; Escrow FAQ
                </div>
                <div className="text-xs text-[#6B6663]">
                  How Gemini Vision, Ed25519 oracle proofs, and Solana slashing work
                </div>
              </div>
            </div>
            {faqOpen ? (
              <ChevronDown className="w-4 h-4 text-[#877F7A] shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#877F7A] shrink-0" />
            )}
          </button>

          {faqOpen && (
            <div className="px-5 pb-4 pt-2 border-t border-[#F4ECE7] space-y-3">
              {FAQ_ITEMS.map((item) => (
                <div key={item.q} className="space-y-1">
                  <div className="text-xs font-bold text-[#111114] inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    <span>{item.q}</span>
                  </div>
                  <p className="text-xs text-[#6B6663] leading-relaxed pl-5">{item.a}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setConfirmDisconnect(true)}
          className="w-full min-h-[68px] actake-card px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FEF2F2] transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-[#DC2626]">
                Disconnect Wallet &amp; Sign Out
              </div>
              <div className="text-xs text-[#6B6663]">
                End current SIWS session and return to onboarding
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#DC2626]/60 shrink-0" />
        </button>
      </section>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect Solana Wallet?"
        description="You will be signed out of your current Actake session and returned to onboarding. Your local stakes stay linked to this public key when you reconnect."
        confirmLabel="Disconnect"
        cancelLabel="Stay Signed In"
        destructive
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          setConfirmDisconnect(false);
          onDisconnectWallet();
        }}
      />
    </div>
  );
};
