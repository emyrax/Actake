import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  Box,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  Flame,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
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
import { EscrowVault3D } from './EscrowVault3D';

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
  onRefreshDevnet: () => void;
  onOpenMissions: () => void;
  onOpenAlarmSettings: () => void;
  onOpenPollarFund: () => void;
  onTriggerTestAlarm: (stake: StakeCommitment) => void;
  onExpandVault3D: () => void;
  onOpenSquadLobby: (poolId: string) => void;
  onAdjustVaultBalance: (kind: 'fund' | 'withdraw', amount: number, token: TokenType) => void;
  onClaimVerifiedStake?: (stake: StakeCommitment) => Promise<void>;
  claimingStakeId?: string | null;
}

type TimeOfDayFilter = 'all' | 'morning' | 'midday' | 'afternoon';

function AlarmIllustrationSvg() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 drop-shadow-[0_10px_18px_rgba(241,106,46,0.22)]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="alarmBody" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF8D57" />
          <stop offset="100%" stopColor="#E45826" />
        </linearGradient>
      </defs>
      {/* Ears / Bells */}
      <circle cx="30" cy="30" r="14" fill="#18181B" />
      <circle cx="90" cy="30" r="14" fill="#18181B" />
      <path d="M24 22 L38 36 M96 22 L82 36" stroke="#F16A2E" strokeWidth="4" strokeLinecap="round" />
      {/* Feet */}
      <line x1="36" y1="96" x2="28" y2="108" stroke="#18181B" strokeWidth="6" strokeLinecap="round" />
      <line x1="84" y1="96" x2="92" y2="108" stroke="#18181B" strokeWidth="6" strokeLinecap="round" />
      {/* Clock Body */}
      <circle cx="60" cy="64" r="38" fill="url(#alarmBody)" />
      <circle cx="60" cy="64" r="30" fill="#FFFFFF" />
      {/* Tick marks */}
      <line x1="60" y1="40" x2="60" y2="44" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="60" y1="84" x2="60" y2="88" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="36" y1="64" x2="40" y2="64" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="80" y1="64" x2="84" y2="64" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
      {/* Hands */}
      <line x1="60" y1="64" x2="60" y2="48" stroke="#111114" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="60" y1="64" x2="73" y2="64" stroke="#F16A2E" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="64" r="3.5" fill="#111114" />
      {/* Motion rings */}
      <path d="M12 42 Q8 30 18 20" fill="none" stroke="#F16A2E" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <path d="M108 42 Q112 30 102 20" fill="none" stroke="#F16A2E" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

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
  onRefreshDevnet,
  onOpenMissions,
  onOpenAlarmSettings,
  onOpenPollarFund,
  onTriggerTestAlarm,
  onExpandVault3D,
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
  const [vaultNotice, setVaultNotice] = useState<string | null>(null);

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
  const combinedVaultUsd = earnedUsdcBalance + totalLockedUsd;

  const selectedSoundLabel =
    ALARM_SOUNDS.find((a) => a.id === alarmSettings.selectedSound)?.label || 'Siren';

  const handleVaultSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultModalMode || vaultAmount <= 0) return;
    const maxAvail = vaultToken === 'USDC' ? earnedUsdcBalance : earnedSkrBalance;
    const safeAmt =
      vaultModalMode === 'withdraw' ? Math.min(vaultAmount, Math.max(0, maxAvail)) : vaultAmount;
    if (vaultModalMode === 'withdraw' && safeAmt <= 0) {
      setVaultNotice(`No available ${vaultToken} balance to withdraw.`);
      return;
    }
    onAdjustVaultBalance(vaultModalMode, safeAmt, vaultToken);
    setVaultNotice(
      vaultModalMode === 'fund'
        ? `Deposited $${safeAmt.toFixed(2)} ${vaultToken} into your Actake staking vault.`
        : `Withdrew $${safeAmt.toFixed(2)} ${vaultToken} back to your connected Solana wallet.`
    );
    setVaultModalMode(null);
    window.setTimeout(() => setVaultNotice(null), 3600);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Greeting Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-[#111114] text-white font-display font-bold text-sm flex items-center justify-center shadow-sm shrink-0">
            {walletLabel.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight">
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
            className="min-h-[42px] px-3.5 py-2 rounded-full bg-white text-xs font-semibold text-[#111114] shadow-[0_4px_14px_rgba(24,20,18,0.06)] hover:bg-[#FFF9F5] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
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
            className="min-h-[42px] min-w-[42px] px-3.5 py-2 rounded-full bg-white text-xs font-semibold text-[#111114] shadow-[0_4px_14px_rgba(24,20,18,0.06)] hover:bg-[#FFF9F5] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#111114]" />
            <span className="hidden sm:inline">Alarms</span>
          </button>
        </div>
      </div>

      {vaultNotice && (
        <div className="rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] px-4 py-3 text-xs font-medium text-[#166534] flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
            {vaultNotice}
          </span>
          <button type="button" onClick={() => setVaultNotice(null)} className="text-[#166534]/70">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
            className="min-h-[40px] px-4 py-2 rounded-full bg-[#14532D] hover:bg-[#16A34A] disabled:opacity-60 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
          >
            {claimingStakeId === verifiedUnclaimedStakes[0].id
              ? 'Settling on Devnet...'
              : 'Claim Payout'}
          </button>
        </div>
      )}

      {/* Hero Section: Vault Balance & Fund/Withdraw Card + Featured Daily Challenge Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left Hero: Obsidian Vault Balance + Fund / Withdraw Controls */}
        <div className="lg:col-span-5 relative overflow-hidden rounded-[28px] bg-[#141416] text-white p-6 flex flex-col justify-between gap-5 shadow-[0_16px_36px_rgba(17,17,20,0.18)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 -right-16 w-52 h-52 rounded-full actake-orb-glow opacity-30 blur-2xl"
          />

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-white/60">Total Vault Balance</div>
              <div className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums mt-1">
                ${combinedVaultUsd.toFixed(2)}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-white/75 tabular-nums">
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
              onClick={onExpandVault3D}
              className="min-h-[38px] px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/18 text-[11px] font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Box className="w-3.5 h-3.5 text-[#F16A2E]" />
              <span>3D Vault</span>
            </button>
          </div>

          {/* 4-Action Sleek Circular Button Strip (Fund, Withdraw, Stake, Squads) */}
          <div className="relative z-10 grid grid-cols-4 gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => {
                setVaultAmount(25);
                setVaultToken('USDC');
                setVaultModalMode('fund');
              }}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="w-12 h-12 rounded-full bg-[#F16A2E] group-hover:bg-[#E05920] text-white flex items-center justify-center transition-colors shadow-sm">
                <ArrowDownLeft className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-semibold text-white/85">Fund</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setVaultAmount(Math.min(25, Math.max(5, Math.floor(earnedUsdcBalance))));
                setVaultToken('USDC');
                setVaultModalMode('withdraw');
              }}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="w-12 h-12 rounded-full bg-white/12 group-hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                <ArrowUpRight className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-semibold text-white/85">Withdraw</span>
            </button>

            <button
              type="button"
              onClick={onOpenMissions}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="w-12 h-12 rounded-full bg-white group-hover:bg-[#FFF4EE] text-[#111114] flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-semibold text-white/85">New Stake</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenSquadLobby('squad-7am-club')}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="w-12 h-12 rounded-full bg-white/12 group-hover:bg-white/20 text-white flex items-center justify-center transition-colors">
                <Users className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-semibold text-white/85">Community</span>
            </button>
          </div>
        </div>

        {/* Right Hero: Featured "Daily Challenge" Card (Haptive-inspired warm card with Stake-to-Verify Deadline) */}
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
                        Do your plan before{' '}
                        <span className="font-bold text-[#111114]">{clockFmt.full}</span> ({dayText}
                        ) · <span className="text-[#F16A2E] font-semibold">In {cd.compact}</span>
                      </p>

                      {/* Overlapping Community Avatars */}
                      <div className="pt-1 flex items-center gap-3">
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

                    <AlarmIllustrationSvg />
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
                      className="min-h-[42px] px-4 py-2 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
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
                  or workout move when your alarm rings.
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
              <AlarmIllustrationSvg />
            </div>
          )}
        </div>
      </div>

      {/* 7-Day Vertical Pill Streak Calendar (Matching Haptive Peach/Orange Pill Strip) */}
      <section className="space-y-2">
        <div className="grid grid-cols-7 gap-2 sm:gap-3">
          {weekDays.map((day) => (
            <div key={`${day.dayLabel}-${day.dateNum}`} className="flex flex-col items-center">
              <span className="text-[11px] font-semibold text-[#6B6663] mb-1.5">
                {day.dayLabel}
              </span>

              {/* Small active pointer triangle above today's orange pill */}
              <div className="h-2 flex items-center justify-center mb-1">
                {day.isToday && (
                  <span
                    aria-hidden="true"
                    className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-[#111114]"
                  />
                )}
              </div>

              <div
                className={`w-full max-w-[68px] rounded-full py-2.5 px-1.5 flex flex-col items-center justify-between gap-2 min-h-[82px] transition-all ${
                  day.isToday
                    ? 'bg-[#F38452] text-white shadow-[0_10px_22px_rgba(241,106,46,0.34)]'
                    : 'bg-white text-[#111114] shadow-[0_4px_14px_rgba(24,20,18,0.04)]'
                }`}
              >
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-display text-sm font-bold tabular-nums ${
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
                        : 'text-[#A09A96]'
                  }`}
                >
                  {day.isToday ? 'Today' : day.completed ? 'Done' : 'Plan'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Time-of-Day Filter Bar ("Available Hours") + Active Stakes + 3D Escrow Vault */}
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
              className="text-xs font-bold text-[#F16A2E] hover:text-[#D5551B] inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Habit Stake</span>
            </button>
          </div>

          {/* Interactive Time-of-Day Pill Buttons (White vs Solid Obsidian Black) */}
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
                  className={`min-h-[40px] px-5 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#111114] text-white shadow-sm'
                      : 'bg-white text-[#111114] hover:bg-[#FFF9F5] shadow-[0_4px_12px_rgba(24,20,18,0.04)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Habit Stake Cards */}
          {filteredStakes.length === 0 ? (
            <div className="actake-card p-6 text-center space-y-3">
              <p className="text-sm text-[#6B6663]">
                No locked habit deadlines in this time slot.
              </p>
              <button
                type="button"
                onClick={onOpenMissions}
                className="min-h-[40px] px-4 py-2 rounded-full bg-[#111114] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-[#F16A2E]" />
                <span>Schedule New Stake</span>
              </button>
            </div>
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

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F6EFEA]">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="inline-flex items-center gap-1.5 text-xs text-[#6B6663] truncate">
                          <Volume2 className="w-3.5 h-3.5 text-[#F16A2E] shrink-0" />
                          <span className="truncate">Random AI proof unlocks at {fmt.full}</span>
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
                        className="min-h-[34px] px-3.5 py-1 rounded-full bg-[#FFF2EA] hover:bg-[#F16A2E] text-[#F16A2E] hover:text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
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

        {/* Right Column: Interactive 3D Solana Escrow Vault + Live Community Proof Pulse */}
        <div className="lg:col-span-5 space-y-5">
          <EscrowVault3D
            vaultState={activeStakes.some((a) => a.stake.status === 'ringing') ? 'ringing' : 'locked'}
            totalLockedUsd={totalLockedUsd}
            activeStakesCount={activeStakes.length}
            onToggleExpand={onExpandVault3D}
            className="h-[290px] sm:h-[320px] w-full rounded-[28px]"
          />

          {globalActivity && globalActivity.recentCheckins.length > 0 && (
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
                <button
                  type="button"
                  onClick={() => onOpenSquadLobby('squad-7am-club')}
                  className="text-xs font-semibold text-[#F16A2E] hover:underline whitespace-nowrap"
                >
                  Inspect Lobby
                </button>
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

      {/* Fund / Withdraw Vault Sheet Modal (Pollar Ramp & QR + Local Devnet Vault) */}
      {vaultModalMode && (
        <div className="fixed inset-0 z-50 bg-[#111114]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-extrabold text-[#111114]">
                {vaultModalMode === 'fund' ? 'Fund Wallet with Pollar' : 'Withdraw / Send Funds'}
              </h3>
              <button
                type="button"
                onClick={() => setVaultModalMode(null)}
                className="w-9 h-9 rounded-full bg-[#FFF4EE] flex items-center justify-center text-[#111114]"
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
                    className="min-h-[42px] px-3 py-2 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
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
                    className="min-h-[42px] px-3 py-2 rounded-full bg-white/14 hover:bg-white/22 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
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
                  className="w-full min-h-[42px] px-4 py-2 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
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
                    onClick={() => setVaultToken(tok)}
                    className={`min-h-[42px] rounded-full text-xs font-bold transition-colors ${
                      vaultToken === tok
                        ? 'bg-[#111114] text-white'
                        : 'bg-[#FFF4EE] text-[#111114]'
                    }`}
                  >
                    {tok === 'SKR' ? 'SKR (0% Fee)' : 'USDC (SPL)'}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B6663] mb-1.5">
                  Amount ({vaultToken})
                </label>
                <input
                  type="number"
                  min={1}
                  step="any"
                  required
                  value={vaultAmount}
                  onChange={(e) => setVaultAmount(Math.max(1, Number(e.target.value)))}
                  className="w-full rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] px-4 py-3 font-mono text-lg font-bold text-[#111114] focus:outline-none focus:border-[#F16A2E]"
                />
                <div className="flex gap-2 mt-2">
                  {[10, 25, 50, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setVaultAmount(preset)}
                      className="flex-1 py-1.5 rounded-full bg-[#FFF4EE] hover:bg-[#FFE5D6] text-xs font-mono font-semibold text-[#111114]"
                    >
                      ${preset}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full min-h-[46px] rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold transition-colors"
              >
                {vaultModalMode === 'fund'
                  ? `Add $${vaultAmount.toFixed(2)} ${vaultToken} to Devnet Vault`
                  : `Withdraw $${vaultAmount.toFixed(2)} ${vaultToken}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
