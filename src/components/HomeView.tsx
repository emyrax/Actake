import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  Flame,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users,
  Volume2,
  Wallet,
  X,
} from 'lucide-react';
import {
  AlarmSettings,
  DevnetSyncState,
  GlobalActivitySummary,
  StakeCommitment,
  TokenType,
  WalletConnectionKind,
} from '../types/actake';
import { useActakePollar } from '../context/ActakePollarProvider';
import {
  buildWeekStreakStrip,
  formatClockTime12h,
  formatCountdownParts,
  getNextAlarmTimestamp,
  isSameDayAlarm,
} from '../utils/timeUtils';
import { ALARM_SOUNDS } from '../utils/alarmAudio';
import { MascotDisplay } from './MascotDisplay';
import {
  ActivityPulseSkeleton,
  EmptyState,
  ErrorStateCard,
  SparklineSvg,
} from './UiPrimitives';

interface HomeViewProps {
  nowMs: number;
  walletLabel: string;
  connectionKind: WalletConnectionKind;
  stakes: StakeCommitment[];
  streakDays: number;
  earnedUsdcBalance: number;
  earnedSkrBalance: number;
  actPoints: number;
  alarmSettings: AlarmSettings;
  devnet: DevnetSyncState;
  globalActivity: GlobalActivitySummary | null;
  globalActivityLoading?: boolean;
  globalActivityError?: string | null;
  onRetryGlobalActivity?: () => void;
  onRefreshDevnet: () => void;
  onOpenMissions: () => void;
  onOpenAlarmSettings: () => void;
  onOpenPollarFund: () => void;
  onTriggerTestAlarm: (stake: StakeCommitment) => void;
  onOpenSquadLobby: (poolId: string) => void;
  onAdjustVaultBalance: (kind: 'fund' | 'withdraw', amount: number, token: TokenType) => void;
  onClaimVerifiedStake?: (stake: StakeCommitment) => Promise<void>;
  claimingStakeId?: string | null;
}

type TimeOfDayFilter = 'all' | 'morning' | 'midday' | 'afternoon';

export const HomeView: React.FC<HomeViewProps> = ({
  nowMs,
  walletLabel,
  connectionKind,
  stakes,
  streakDays,
  earnedUsdcBalance,
  earnedSkrBalance,
  actPoints,
  alarmSettings,
  devnet,
  globalActivity,
  globalActivityLoading = false,
  globalActivityError = null,
  onRetryGlobalActivity,
  onRefreshDevnet,
  onOpenMissions,
  onOpenAlarmSettings,
  onOpenPollarFund,
  onTriggerTestAlarm,
  onOpenSquadLobby,
  onAdjustVaultBalance,
  onClaimVerifiedStake,
  claimingStakeId,
}) => {
  const pollar = useActakePollar();
  const [timeFilter, setTimeFilter] = useState<TimeOfDayFilter>('all');
  const [vaultModalMode, setVaultModalMode] = useState<'fund' | 'withdraw' | null>(null);
  const [vaultAmount, setVaultAmount] = useState<number>(25);
  const [vaultToken, setVaultToken] = useState<TokenType>('USDC');
  const [vaultFormError, setVaultFormError] = useState<string | null>(null);

  const todayFormatted = useMemo(() => {
    const d = new Date(nowMs);
    return `Today ${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}`;
  }, [Math.floor(nowMs / 60000)]);

  const weekDays = useMemo(
    () => buildWeekStreakStrip(new Date(nowMs)),
    [Math.floor(nowMs / 60000)]
  );

  const activeStakes = useMemo(() => {
    return stakes
      .filter((s) => s.status === 'locked' || s.status === 'ringing')
      .map((s) => {
        const nextTs = getNextAlarmTimestamp(s.alarmHour, s.alarmMinute, nowMs);
        return {
          stake: s,
          nextTs,
          remainingMs: nextTs - nowMs,
        };
      })
      .sort((a, b) => a.remainingMs - b.remainingMs);
  }, [stakes, nowMs]);

  const filteredStakes = useMemo(() => {
    if (timeFilter === 'all') return activeStakes;
    return activeStakes.filter(({ stake }) => {
      if (timeFilter === 'morning') return stake.alarmHour < 12;
      if (timeFilter === 'midday') return stake.alarmHour >= 12 && stake.alarmHour < 17;
      return stake.alarmHour >= 17;
    });
  }, [activeStakes, timeFilter]);

  const verifiedUnclaimedStakes = useMemo(
    () => stakes.filter((s) => s.status === 'verified'),
    [stakes]
  );

  const nextStakeEntry = activeStakes[0] || null;
  const totalLockedUsd = useMemo(
    () => activeStakes.reduce((sum, entry) => sum + entry.stake.amount, 0),
    [activeStakes]
  );
  const totalProjectedSplit = useMemo(
    () => activeStakes.reduce((sum, entry) => sum + entry.stake.slashedBonusEstimate, 0),
    [activeStakes]
  );
  const skrStakeCount = useMemo(
    () => activeStakes.filter((entry) => entry.stake.token === 'SKR').length,
    [activeStakes]
  );
  const combinedVaultUsd = earnedUsdcBalance + totalLockedUsd;

  const vaultMomentumValues = useMemo(() => {
    const base = Math.max(12, combinedVaultUsd * 0.72);
    return [
      base,
      base * 1.04,
      base * 1.09,
      base * 1.15,
      base * 1.22,
      base * 1.31,
      Math.max(base * 1.38, combinedVaultUsd),
    ];
  }, [combinedVaultUsd]);

  const selectedSoundLabel =
    ALARM_SOUNDS.find((a) => a.id === alarmSettings.selectedSound)?.label || 'Siren';

  const handleVaultSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setVaultFormError(null);
    if (!vaultModalMode) return;
    if (!Number.isFinite(vaultAmount) || vaultAmount <= 0) {
      setVaultFormError('Enter an amount greater than 0.');
      return;
    }
    const maxAvail = vaultToken === 'USDC' ? earnedUsdcBalance : earnedSkrBalance;
    if (vaultModalMode === 'withdraw') {
      if (maxAvail <= 0) {
        setVaultFormError(`You have $0.00 available ${vaultToken} to withdraw.`);
        return;
      }
      if (vaultAmount > maxAvail) {
        setVaultFormError(`Maximum available ${vaultToken} is $${maxAvail.toFixed(2)}.`);
        return;
      }
    }
    onAdjustVaultBalance(vaultModalMode, vaultAmount, vaultToken);
    setVaultModalMode(null);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Greeting Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <MascotDisplay
            variant="medallion"
            size="sm"
            alt="Actake Mascot Avatar"
          />
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight truncate">
              Hello, {walletLabel}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#6B6663] tabular-nums">
              <span>{todayFormatted}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-[#F16A2E]">
                <Flame className="w-3.5 h-3.5" />
                {streakDays} day streak
              </span>
              <span aria-hidden="true">·</span>
              <span>{actPoints.toLocaleString()} $ACT</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={onRefreshDevnet}
            disabled={devnet.syncing}
            className="min-h-[44px] px-3.5 py-2 rounded-full bg-white border border-[#EFE2D9] text-xs font-semibold text-[#111114] shadow-[0_4px_14px_rgba(24,20,18,0.05)] hover:bg-[#FFF9F5] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[#F16A2E] ${devnet.syncing ? 'animate-spin' : ''}`}
            />
            <span className="tabular-nums">
              {devnet.slot ? `Slot ${devnet.slot.toLocaleString()}` : 'Sync Devnet'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenAlarmSettings}
            aria-label="Alarm settings"
            className="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-full bg-white border border-[#EFE2D9] text-xs font-semibold text-[#111114] shadow-[0_4px_14px_rgba(24,20,18,0.05)] hover:bg-[#FFF9F5] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#111114]" />
            <span className="hidden sm:inline">Alarms</span>
          </button>
        </div>
      </div>

      {verifiedUnclaimedStakes.length > 0 && onClaimVerifiedStake && (
        <div className="rounded-3xl bg-[#ECFDF5] border border-[#BBF7D0] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-2xl bg-[#16A34A] text-white flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </span>
            <div>
              <div className="font-display text-sm font-extrabold text-[#14532D]">
                {verifiedUnclaimedStakes.length} Verified Stake
                {verifiedUnclaimedStakes.length > 1 ? 's' : ''} Ready to Settle
              </div>
              <p className="text-xs text-[#166534] tabular-nums">
                {verifiedUnclaimedStakes[0].categoryName} · Redeem $
                {(
                  verifiedUnclaimedStakes[0].amount +
                  verifiedUnclaimedStakes[0].slashedBonusEstimate
                ).toFixed(2)}{' '}
                {verifiedUnclaimedStakes[0].token} on Solana Devnet
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={claimingStakeId === verifiedUnclaimedStakes[0].id}
            onClick={() => void onClaimVerifiedStake(verifiedUnclaimedStakes[0])}
            className="min-h-[44px] px-5 py-2 rounded-full bg-[#14532D] hover:bg-[#16A34A] disabled:opacity-60 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
          >
            {claimingStakeId === verifiedUnclaimedStakes[0].id
              ? 'Settling on Devnet...'
              : 'Claim Payout'}
          </button>
        </div>
      )}

      {/* Hero Section: Vault Balance Card + Featured Daily Challenge Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left Hero: Obsidian Vault Balance + 7-Day Sparkline + Quick Actions */}
        <div className="lg:col-span-5 relative overflow-hidden rounded-[28px] bg-[#141416] text-white p-6 flex flex-col justify-between gap-5 shadow-[0_16px_36px_rgba(17,17,20,0.18)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 -right-16 w-52 h-52 rounded-full actake-orb-glow opacity-30 blur-2xl"
          />

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-white/60">Total Vault Balance</div>
              <div className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums mt-1">
                ${combinedVaultUsd.toFixed(2)}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/75 tabular-nums">
                <span className="text-[#4ADE80] font-semibold">
                  ${earnedUsdcBalance.toFixed(2)} USDC free
                </span>
                <span aria-hidden="true">·</span>
                <span>${totalLockedUsd.toFixed(2)} locked</span>
                <span aria-hidden="true">·</span>
                <span>{earnedSkrBalance.toFixed(0)} SKR</span>
                {connectionKind === 'pollar' && pollar.solanaBalances.usdc !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#F16A2E] font-semibold">
                      Pollar ${pollar.solanaBalances.usdc.toFixed(2)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenPollarFund}
              className="min-h-[40px] px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/18 text-[11px] font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#F16A2E]" />
              <span>Pollar Ramp</span>
            </button>
          </div>

          {/* Compact 7-day Vault Momentum Sparkline */}
          <div className="relative z-10 rounded-2xl bg-white/[0.05] border border-white/10 px-3.5 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-white/60 inline-flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-[#4ADE80]" />
                <span>Projected Split</span>
              </div>
              <div className="font-mono text-sm font-bold text-[#4ADE80] tabular-nums">
                +${totalProjectedSplit.toFixed(2)} est.
              </div>
            </div>
            <div className="w-28 shrink-0">
              <SparklineSvg
                values={vaultMomentumValues}
                stroke="#F16A2E"
                fillFrom="rgba(241, 106, 46, 0.28)"
                className="w-full h-9"
              />
            </div>
          </div>

          {/* 4-Action Circular Button Strip (Fund, Withdraw, New Stake, Community) */}
          <div className="relative z-10 grid grid-cols-4 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setVaultFormError(null);
                setVaultAmount(25);
                setVaultToken('USDC');
                setVaultModalMode('fund');
              }}
              className="flex flex-col items-center gap-1.5 group min-h-[44px]"
            >
              <span className="w-12 h-12 rounded-full bg-[#F16A2E] group-hover:bg-[#E05920] text-white flex items-center justify-center transition-colors shadow-sm">
                <ArrowDownLeft className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-semibold text-white/85">Fund</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setVaultFormError(null);
                setVaultAmount(Math.min(25, Math.max(5, Math.floor(earnedUsdcBalance) || 5)));
                setVaultToken('USDC');
                setVaultModalMode('withdraw');
              }}
              className="flex flex-col items-center gap-1.5 group min-h-[44px]"
            >
              <span className="w-12 h-12 rounded-full bg-white/12 group-hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                <ArrowUpRight className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-semibold text-white/85">Withdraw</span>
            </button>

            <button
              type="button"
              onClick={onOpenMissions}
              className="flex flex-col items-center gap-1.5 group min-h-[44px]"
            >
              <span className="w-12 h-12 rounded-full bg-white group-hover:bg-[#FFF4EE] text-[#111114] flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-semibold text-white/85">New Stake</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenSquadLobby('squad-7am-club')}
              className="flex flex-col items-center gap-1.5 group min-h-[44px]"
            >
              <span className="w-12 h-12 rounded-full bg-white/12 group-hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                <Users className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-semibold text-white/85">Community</span>
            </button>
          </div>
        </div>

        {/* Right Hero: Featured "Daily Challenge" Card */}
        <div className="lg:col-span-7 actake-card p-6 flex flex-col justify-between gap-4">
          {nextStakeEntry ? (
            (() => {
              const { stake, nextTs, remainingMs } = nextStakeEntry;
              const clockFmt = formatClockTime12h(stake.alarmHour, stake.alarmMinute);
              const cd = formatCountdownParts(remainingMs);
              const dayText = isSameDayAlarm(nextTs, nowMs);
              const soundName =
                ALARM_SOUNDS.find((a) => a.id === stake.alarmSound)?.label || selectedSoundLabel;

              return (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 min-w-0">
                      <div className="text-xs font-semibold text-[#F16A2E] tabular-nums">
                        {stake.categoryName} · ${stake.amount.toFixed(2)} {stake.token} Staked
                      </div>
                      <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] leading-tight">
                        Daily Challenge
                      </h2>
                      <p className="text-sm text-[#6B6663] tabular-nums">
                        Complete proof before{' '}
                        <span className="font-bold text-[#111114]">{clockFmt.full}</span> ({dayText}
                        ) · <span className="text-[#F16A2E] font-semibold">In {cd.compact}</span>
                      </p>

                      {/* Overlapping Community Avatars */}
                      <div className="pt-1 flex flex-wrap items-center gap-3">
                        <div className="flex items-center -space-x-2">
                          {['AL', 'SA', 'NI'].map((init) => (
                            <div
                              key={init}
                              className="w-8 h-8 rounded-full bg-[#141416] text-white text-[11px] font-bold flex items-center justify-center border-2 border-white"
                            >
                              {init}
                            </div>
                          ))}
                          <div className="w-8 h-8 rounded-full bg-[#FFE3D5] text-[#F16A2E] text-[11px] font-bold flex items-center justify-center border-2 border-white tabular-nums">
                            +42
                          </div>
                        </div>
                        <span className="text-xs text-[#6B6663]">
                          {soundName} · {alarmSettings.strictMode ? 'Strict' : 'Standard'}
                        </span>
                      </div>
                    </div>

                    <MascotDisplay
                      variant="stage"
                      size="xl"
                      floating
                      alt="Actake Accountability Guardian"
                    />
                  </div>

                  {/* Stake-to-Verify Deadline Action Bar */}
                  <div className="pt-3 border-t border-[#F4ECE7] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 text-xs font-medium text-[#6B6663]">
                      <Lock className="w-3.5 h-3.5 text-[#111114] shrink-0" />
                      <span>
                        AI random camera proof unlocks automatically at {clockFmt.full}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onTriggerTestAlarm(stake)}
                      className="min-h-[44px] px-5 py-2 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      <span>Verify / Simulate Alarm</span>
                    </button>
                  </div>
                </>
              );
            })()
          ) : (
            <div className="flex-1 flex flex-col sm:flex-row items-center justify-between gap-5 py-2">
              <div className="space-y-2 text-center sm:text-left">
                <h2 className="font-display text-2xl font-extrabold text-[#111114]">
                  Start Your Daily Challenge
                </h2>
                <p className="text-sm text-[#6B6663] max-w-md">
                  Lock USDC or 0%-fee SKR behind a daily deadline. Verify with a random live photo
                  when your alarm rings.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onOpenMissions}
                    className="min-h-[44px] px-5 py-2.5 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Stake</span>
                  </button>
                </div>
              </div>
              <MascotDisplay
                variant="stage"
                size="xl"
                floating
                alt="Actake Accountability Guardian"
              />
            </div>
          )}
        </div>
      </div>

      {/* 7-Day Vertical Pill Streak Calendar */}
      <section className="space-y-2" aria-label="7-day consistency streak">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
          {weekDays.map((day) => (
            <div key={`${day.dayLabel}-${day.dateNum}`} className="flex flex-col items-center">
              <span className="text-[11px] font-semibold text-[#6B6663] mb-1.5">
                {day.dayLabel}
              </span>

              <div className="h-2 flex items-center justify-center mb-1">
                {day.isToday && (
                  <span
                    aria-hidden="true"
                    className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-[#111114]"
                  />
                )}
              </div>

              <div
                className={`w-full max-w-[68px] rounded-full py-2 px-1 flex flex-col items-center justify-between gap-1.5 min-h-[78px] sm:min-h-[82px] transition-all border ${
                  day.isToday
                    ? 'bg-[#F38452] border-[#E87340] text-white shadow-[0_10px_22px_rgba(241,106,46,0.34)]'
                    : 'bg-white border-[#EFE2D9] text-[#111114]'
                }`}
              >
                <span
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-display text-xs sm:text-sm font-bold tabular-nums ${
                    day.isToday
                      ? 'bg-white text-[#111114]'
                      : day.completed
                        ? 'bg-[#E6F8EE] text-[#16A34A]'
                        : 'bg-[#FFF4EE] text-[#6B6663]'
                  }`}
                >
                  {day.completed && !day.isToday ? (
                    <Check className="w-4 h-4 stroke-[2.5]" />
                  ) : (
                    day.dateNum
                  )}
                </span>
                <span
                  className={`text-[10px] font-semibold ${
                    day.isToday
                      ? 'text-white'
                      : day.completed
                        ? 'text-[#16A34A]'
                        : 'text-[#877F7A]'
                  }`}
                >
                  {day.isToday ? 'Today' : day.completed ? 'Done' : 'Plan'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Active Stakes + Right Column (Escrow Breakdown + Live Community Pulse) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-extrabold text-[#111114]">
                Available Hours
              </h2>
              <p className="text-xs text-[#6B6663]">
                Filter active staked deadlines by time of day
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenMissions}
              className="min-h-[40px] px-3 py-1.5 rounded-full text-xs font-bold text-[#F16A2E] hover:bg-[#FFF0E6] inline-flex items-center gap-1 whitespace-nowrap transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Habit Stake</span>
            </button>
          </div>

          {/* Interactive Time-of-Day Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {(
              [
                { id: 'all', label: `All Day (${activeStakes.length})` },
                { id: 'morning', label: 'Morning' },
                { id: 'midday', label: 'Mid-day' },
                { id: 'afternoon', label: 'Afternoon' },
              ] as const
            ).map((opt) => {
              const active = timeFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTimeFilter(opt.id)}
                  className={`min-h-[44px] px-4 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0 border ${
                    active
                      ? 'bg-[#111114] border-[#111114] text-white shadow-xs'
                      : 'bg-white border-[#EFE2D9] text-[#111114] hover:bg-[#FFF9F5]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Habit Stake Cards */}
          {filteredStakes.length === 0 ? (
            <EmptyState
              showMascot
              title={
                timeFilter === 'all'
                  ? 'No Active Habit Stakes Yet'
                  : `No ${timeFilter} deadlines scheduled`
              }
              description={
                timeFilter === 'all'
                  ? 'Lock your first daily routine stake on Solana Devnet and arm a live AI verification alarm.'
                  : 'Switch back to All Day or schedule a new habit stake for this time window.'
              }
              ctaLabel={timeFilter === 'all' ? 'Schedule New Stake' : 'Show All Deadlines'}
              onCta={() => {
                if (timeFilter === 'all') {
                  onOpenMissions();
                } else {
                  setTimeFilter('all');
                }
              }}
            />
          ) : (
            <div className="space-y-3.5">
              {filteredStakes.map(({ stake, nextTs, remainingMs }) => {
                const fmt = formatClockTime12h(stake.alarmHour, stake.alarmMinute);
                const cd = formatCountdownParts(remainingMs);
                const dayText = isSameDayAlarm(nextTs, nowMs);
                const totalWindowMs = 24 * 60 * 60 * 1000;
                const progressPct = Math.max(
                  10,
                  Math.min(96, Math.round(((totalWindowMs - remainingMs) / totalWindowMs) * 100))
                );

                return (
                  <div
                    key={stake.id}
                    className="actake-card p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
                          <Camera className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-display text-base font-bold text-[#111114] truncate">
                            {stake.categoryName}
                          </div>
                          <div className="text-xs text-[#6B6663] mt-0.5 tabular-nums">
                            {fmt.full} ({dayText}) · {stake.frequencyLabel || 'Daily'} ·{' '}
                            {stake.token} {stake.protocolFeePct === 0 ? '(0% fee)' : '(SPL)'}
                          </div>
                          {stake.motivationNote && (
                            <p className="text-xs text-[#877F7A] mt-1 line-clamp-1">
                              “{stake.motivationNote}”
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 tabular-nums">
                        <div className="font-display text-lg font-extrabold text-[#111114]">
                          ${stake.amount.toFixed(2)}
                        </div>
                        <div className="text-xs font-semibold text-[#16A34A]">
                          +${stake.slashedBonusEstimate.toFixed(2)} split
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs tabular-nums">
                        <span
                          className={
                            cd.isUrgent ? 'text-[#F16A2E] font-semibold' : 'text-[#6B6663]'
                          }
                        >
                          Deadline in {cd.compact}
                        </span>
                        <span className="text-[#6B6663]">{progressPct}% elapsed</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#F7ECE6] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#F16A2E] to-[#FF9B6B]"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F6EFEA]">
                      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center gap-1.5 text-xs text-[#6B6663] truncate">
                          <Volume2 className="w-3.5 h-3.5 text-[#F16A2E] shrink-0" />
                          <span className="truncate">AI proof unlocks at {fmt.full}</span>
                        </span>
                        {stake.paidVia === 'pollar' && (
                          <span className="text-[11px] font-bold text-[#F16A2E] whitespace-nowrap shrink-0">
                            Pollar Paid
                          </span>
                        )}
                        {stake.explorerUrl && (
                          <a
                            href={stake.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#16A34A] hover:underline whitespace-nowrap shrink-0"
                          >
                            <span>Devnet Tx</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onTriggerTestAlarm(stake)}
                        className="min-h-[40px] px-4 py-1.5 rounded-full bg-[#FFF2EA] hover:bg-[#F16A2E] text-[#F16A2E] hover:text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                      >
                        Test Alarm
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Native Escrow Protection Card (Replaces 3D Vault) + Live Community Pulse */}
        <div className="lg:col-span-5 space-y-5">
          {/* Escrow Protection & Pot Breakdown Card */}
          <div className="actake-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-2xl bg-[#111114] text-[#F16A2E] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-base font-extrabold text-[#111114]">
                    Escrow Vault Summary
                  </h3>
                  <p className="text-xs text-[#6B6663]">
                    Program-derived Solana Devnet accountability lock
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[#16A34A] text-[11px] font-bold whitespace-nowrap shrink-0">
                {activeStakes.length > 0 ? 'Armed' : 'Standby'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 tabular-nums">
              <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-3.5">
                <div className="text-[11px] font-semibold text-[#6B6663]">Locked Principal</div>
                <div className="font-display text-xl font-extrabold text-[#111114] mt-0.5">
                  ${totalLockedUsd.toFixed(2)}
                </div>
                <div className="text-[11px] text-[#877F7A] mt-0.5">
                  {activeStakes.length} active {activeStakes.length === 1 ? 'stake' : 'stakes'}
                </div>
              </div>

              <div className="rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] p-3.5">
                <div className="text-[11px] font-semibold text-[#166534]">Est. Slashed Split</div>
                <div className="font-display text-xl font-extrabold text-[#14532D] mt-0.5">
                  +${totalProjectedSplit.toFixed(2)}
                </div>
                <div className="text-[11px] text-[#166534] mt-0.5">
                  {skrStakeCount > 0 ? `${skrStakeCount} at 0% SKR fee` : '1.5% USDC fee'}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-3 flex items-center justify-between gap-2 text-xs">
              <span className="text-[#6B6663] font-medium inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#F16A2E]" />
                <span>Devnet SOL Gas</span>
              </span>
              <span className="font-mono font-bold text-[#111114] tabular-nums">
                {devnet.solBalance !== null ? `${devnet.solBalance.toFixed(4)} SOL` : 'Syncing...'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onOpenMissions}
                className="min-h-[44px] px-4 py-2 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Lock Stake</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenSquadLobby('squad-7am-club')}
                className="min-h-[44px] px-4 py-2 rounded-full bg-[#FFF4EE] hover:bg-[#FFE5D6] text-[#111114] text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Users className="w-3.5 h-3.5 text-[#F16A2E]" />
                <span>Open Lobby</span>
              </button>
            </div>
          </div>

          {/* Live Community Pulse with Skeleton, Error Retry, and Empty State */}
          {globalActivityLoading && !globalActivity ? (
            <ActivityPulseSkeleton />
          ) : globalActivityError && !globalActivity ? (
            <ErrorStateCard
              title="Live Community Pulse Unavailable"
              message={globalActivityError}
              onRetry={onRetryGlobalActivity}
              retryLabel="Retry Feed"
            />
          ) : !globalActivity || globalActivity.recentCheckins.length === 0 ? (
            <EmptyState
              icon={<Users className="w-5 h-5" />}
              title="No Recent Check-Ins Yet"
              description="Verified community proofs appear here in real time as members beat their daily alarms."
              ctaLabel="Inspect Community Lobby"
              onCta={() => onOpenSquadLobby('squad-7am-club')}
            />
          ) : (
            <div className="actake-card p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-extrabold text-[#111114]">
                    Live Community Pulse
                  </h3>
                  <p className="text-xs text-[#6B6663] tabular-nums">
                    ${globalActivity.totalUsdcStaked.toFixed(0)} USDC &amp;{' '}
                    {globalActivity.totalSkrStaked.toFixed(0)} SKR active
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {onRetryGlobalActivity && (
                    <button
                      type="button"
                      onClick={onRetryGlobalActivity}
                      aria-label="Refresh live community pulse"
                      className="w-9 h-9 rounded-full bg-[#FFF4EE] hover:bg-[#FFE5D6] flex items-center justify-center text-[#F16A2E] transition-colors"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${globalActivityLoading ? 'animate-spin' : ''}`}
                      />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenSquadLobby('squad-7am-club')}
                    className="min-h-[36px] px-3 rounded-full text-xs font-bold text-[#F16A2E] hover:bg-[#FFF0E6] whitespace-nowrap transition-colors"
                  >
                    Inspect Lobby
                  </button>
                </div>
              </div>

              <div className="divide-y divide-[#F6EFEA]">
                {globalActivity.recentCheckins.slice(0, 3).map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                          item.status === 'verified'
                            ? 'bg-[#111114] text-white'
                            : 'bg-[#FEE2E2] text-[#991B1B]'
                        }`}
                      >
                        {item.initials}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#111114] truncate">
                          {item.memberName} ·{' '}
                          <span className="font-medium text-[#6B6663]">{item.targetPrompt}</span>
                        </div>
                        <div className="text-[11px] text-[#8E8782] truncate">
                          {item.poolTitle || 'Actake Pool'}
                        </div>
                      </div>
                    </div>
                    {item.status === 'verified' ? (
                      <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                    ) : (
                      <span className="text-[11px] font-semibold text-[#DC2626] shrink-0">
                        Slashed
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fund / Withdraw Vault Sheet Modal */}
      {vaultModalMode && (
        <div
          onClick={() => setVaultModalMode(null)}
          className="fixed inset-0 z-50 bg-[#111114]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-white p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-extrabold text-[#111114]">
                {vaultModalMode === 'fund' ? 'Fund Wallet with Pollar' : 'Withdraw / Send Funds'}
              </h3>
              <button
                type="button"
                aria-label="Close vault modal"
                onClick={() => setVaultModalMode(null)}
                className="w-11 h-11 rounded-full bg-[#FFF4EE] hover:bg-[#FFE5D6] flex items-center justify-center text-[#111114] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Primary Pollar On-Ramp / Receive / Send Section */}
            <div className="rounded-2xl bg-[#141416] text-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold inline-flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#F16A2E]" />
                  <span>Pollar Protocol (Solana)</span>
                </span>
                <span className="text-[11px] text-white/65 font-mono">
                  {pollar.configured
                    ? pollar.isAuthenticated
                      ? 'Connected'
                      : 'Sign In'
                    : 'Setup Key'}
                </span>
              </div>

              <p className="text-xs text-white/75 leading-relaxed">
                {vaultModalMode === 'fund'
                  ? 'Buy USDC or SOL with fiat (card / bank rails) or deposit via QR directly into your Pollar Solana wallet.'
                  : 'Send USDC or SOL directly from your Pollar Solana wallet to any external Solana address.'}
              </p>

              {vaultModalMode === 'fund' ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setVaultModalMode(null);
                      if (pollar.configured && pollar.isAuthenticated) {
                        pollar.openRampModal();
                      } else {
                        onOpenPollarFund();
                      }
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    <span>Pollar Fiat Ramp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVaultModalMode(null);
                      if (pollar.configured && pollar.isAuthenticated) {
                        pollar.openReceiveModal();
                      } else {
                        onOpenPollarFund();
                      }
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-full bg-white/14 hover:bg-white/22 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Receive QR</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setVaultModalMode(null);
                    if (pollar.configured && pollar.isAuthenticated) {
                      pollar.openSendModal();
                    } else {
                      onOpenPollarFund();
                    }
                  }}
                  className="w-full min-h-[44px] px-4 py-2 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Open Pollar Send / Withdraw</span>
                </button>
              )}
            </div>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-[#F2E3DA] w-full" />
              <span className="bg-white px-3 text-[11px] font-semibold text-[#877F7A] whitespace-nowrap">
                or Devnet Staking Vault
              </span>
              <div className="border-t border-[#F2E3DA] w-full" />
            </div>

            <form onSubmit={handleVaultSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(['USDC', 'SKR'] as TokenType[]).map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => {
                      setVaultToken(tok);
                      setVaultFormError(null);
                    }}
                    className={`min-h-[44px] rounded-full text-xs font-bold transition-colors ${
                      vaultToken === tok
                        ? 'bg-[#111114] text-white'
                        : 'bg-[#FFF4EE] text-[#111114] hover:bg-[#FFE5D6]'
                    }`}
                  >
                    {tok === 'SKR' ? 'SKR (0% Fee)' : 'USDC (SPL)'}
                  </button>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="vault-amount-input" className="font-semibold text-[#6B6663]">
                    Amount ({vaultToken})
                  </label>
                  {vaultModalMode === 'withdraw' && (
                    <span className="font-mono text-[11px] text-[#877F7A] tabular-nums">
                      Available: $
                      {(vaultToken === 'USDC' ? earnedUsdcBalance : earnedSkrBalance).toFixed(2)}
                    </span>
                  )}
                </div>
                <input
                  id="vault-amount-input"
                  type="number"
                  min={1}
                  step="any"
                  required
                  value={vaultAmount}
                  onChange={(e) => {
                    setVaultFormError(null);
                    setVaultAmount(Number(e.target.value));
                  }}
                  className="w-full min-h-[48px] rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-3 font-mono text-lg font-bold text-[#111114] focus:outline-none focus:border-[#F16A2E]"
                />
                <div className="flex gap-2 mt-2">
                  {[10, 25, 50, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setVaultFormError(null);
                        setVaultAmount(preset);
                      }}
                      className="flex-1 min-h-[38px] py-1.5 rounded-full bg-[#FFF4EE] hover:bg-[#FFE5D6] text-xs font-mono font-semibold text-[#111114] transition-colors"
                    >
                      ${preset}
                    </button>
                  ))}
                </div>
              </div>

              {vaultFormError && (
                <div
                  role="alert"
                  className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs text-[#991B1B] flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
                  <span>{vaultFormError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full min-h-[48px] rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold transition-colors"
              >
                {vaultModalMode === 'fund'
                  ? `Add $${Number.isFinite(vaultAmount) ? vaultAmount.toFixed(2) : '0.00'} ${vaultToken} to Devnet Vault`
                  : `Withdraw $${Number.isFinite(vaultAmount) ? vaultAmount.toFixed(2) : '0.00'} ${vaultToken}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
