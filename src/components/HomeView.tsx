import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BellRing,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Dumbbell,
  ExternalLink,
  Flame,
  Loader2,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sunrise,
  TrendingUp,
  Users,
  Volume2,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import {
  AlarmSettings,
  DevnetSyncState,
  GlobalActivitySummary,
  HabitCategory,
  HistoryEntry,
  StakeCommitment,
  TokenType,
  TreasuryConfigSummary,
  WalletConnectionKind,
} from '../types/actake';
import { useActakePollar } from '../context/ActakePollarProvider';
import {
  formatClockTime12h,
  formatCountdownParts,
  getNextAlarmTimestamp,
  isSameDayAlarm,
} from '../utils/timeUtils';
import { ALARM_SOUNDS } from '../utils/alarmAudio';
import { MascotDisplay } from './MascotDisplay';
import { ScrollableCalendarStrip } from './ScrollableCalendarStrip';
import {
  ActivityPulseSkeleton,
  ConfirmDialog,
  EmptyState,
  ErrorStateCard,
  SparklineSvg,
} from './UiPrimitives';

interface HomeViewProps {
  nowMs: number;
  walletLabel: string;
  walletAddress: string;
  connectionKind: WalletConnectionKind;
  categories: HabitCategory[];
  stakes: StakeCommitment[];
  history: HistoryEntry[];
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
  onOpenWalletSheet: () => void;
  onTriggerTestAlarm: (stake: StakeCommitment) => void;
  onOpenSquadLobby: (poolId: string) => void;
  onQuickCreateStake?: (params: {
    category: HabitCategory;
    amount: number;
    token: TokenType;
    alarmHour: number;
    alarmMinute: number;
    motivationNote?: string;
    frequencyLabel?: string;
  }) => Promise<void>;
  submittingStake?: boolean;
  onClaimVerifiedStake?: (stake: StakeCommitment) => Promise<void>;
  claimingStakeId?: string | null;
  onSlashPersonalStake?: (stake: StakeCommitment) => Promise<void>;
  slashingStakeId?: string | null;
  treasuryConfig?: TreasuryConfigSummary | null;
}

type TimeOfDayFilter = 'all' | 'morning' | 'midday' | 'afternoon';

interface HomeQuickStakePreset {
  id: string;
  title: string;
  categoryId: string;
  amount: number;
  token: TokenType;
  alarmHour: number;
  alarmMinute: number;
  frequencyLabel: string;
  motivationNote: string;
  feeLabel: string;
  icon: 'sunrise' | 'gym' | 'study';
}

const HOME_QUICK_STAKE_PRESETS: HomeQuickStakePreset[] = [
  {
    id: 'quick-home-wakeup-10',
    title: 'Morning Wakeup',
    categoryId: 'morning_wakeup',
    amount: 10,
    token: 'USDC',
    alarmHour: 6,
    alarmMinute: 30,
    frequencyLabel: 'Daily',
    motivationNote: 'Up by 6:30 AM — live camera proof before checking messages.',
    feeLabel: '1.5% fee',
    icon: 'sunrise',
  },
  {
    id: 'quick-home-gym-25',
    title: 'Gym & Fitness',
    categoryId: 'gym_fitness',
    amount: 25,
    token: 'USDC',
    alarmHour: 7,
    alarmMinute: 0,
    frequencyLabel: 'Daily',
    motivationNote: 'Daily workout check-in — show training gear or active set.',
    feeLabel: '1.5% fee',
    icon: 'gym',
  },
  {
    id: 'quick-home-study-25skr',
    title: 'Study Session',
    categoryId: 'reading_study',
    amount: 25,
    token: 'SKR',
    alarmHour: 21,
    alarmMinute: 0,
    frequencyLabel: 'Weekdays',
    motivationNote: 'Focused evening study session — open book or notebook at desk.',
    feeLabel: '0% fee',
    icon: 'study',
  },
];

export const HomeView: React.FC<HomeViewProps> = ({
  nowMs,
  walletLabel,
  walletAddress,
  connectionKind,
  categories,
  stakes,
  history,
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
  onOpenWalletSheet,
  onTriggerTestAlarm,
  onOpenSquadLobby,
  onQuickCreateStake,
  submittingStake = false,
  onClaimVerifiedStake,
  claimingStakeId,
  onSlashPersonalStake,
  slashingStakeId,
  treasuryConfig,
}) => {
  const pollar = useActakePollar();
  const [timeFilter, setTimeFilter] = useState<TimeOfDayFilter>('all');
  const [vaultModalMode, setVaultModalMode] = useState<'fund' | 'withdraw' | null>(null);
  const [copiedWalletAddr, setCopiedWalletAddr] = useState(false);
  const [pendingForfeitStake, setPendingForfeitStake] = useState<StakeCommitment | null>(null);
  const [quickActionsExpanded, setQuickActionsExpanded] = useState(false);
  const [balanceDisplayUnit, setBalanceDisplayUnit] = useState<'USDC' | 'SOL'>('USDC');
  const [activeQuickPresetId, setActiveQuickPresetId] = useState<string | null>(null);
  const [quickStakeError, setQuickStakeError] = useState<string | null>(null);
  const [exitingSlashed, setExitingSlashed] = useState<
    Record<string, { stake: StakeCommitment; originalIndex: number }>
  >({});
  const [recentSlashDebit, setRecentSlashDebit] = useState<{
    id: string;
    amount: number;
    token: TokenType;
  } | null>(null);

  const prevStakeStatusRef = useRef<Record<string, StakeCommitment['status']>>({});
  const prevVisibleIndexRef = useRef<Record<string, number>>({});
  const slashTimersRef = useRef<Record<string, number>>({});
  const debitTimerRef = useRef<number | null>(null);

  const todayFormatted = useMemo(() => {
    const d = new Date(nowMs);
    return `Today ${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}`;
  }, [Math.floor(nowMs / 60000)]);

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

  // Detect locked/ringing -> slashed transitions and keep the card mounted during the outflow animation
  useEffect(() => {
    const prevStatuses = prevStakeStatusRef.current;
    const newlySlashed: Array<{ stake: StakeCommitment; originalIndex: number }> = [];

    for (const s of stakes) {
      const prevStatus = prevStatuses[s.id];
      if ((prevStatus === 'locked' || prevStatus === 'ringing') && s.status === 'slashed') {
        const originalIndex = prevVisibleIndexRef.current[s.id] ?? 0;
        newlySlashed.push({ stake: s, originalIndex });
      }
    }

    const updatedStatuses: Record<string, StakeCommitment['status']> = {};
    for (const s of stakes) {
      updatedStatuses[s.id] = s.status;
    }
    prevStakeStatusRef.current = updatedStatuses;

    if (newlySlashed.length === 0) return;

    setExitingSlashed((prev) => {
      const next = { ...prev };
      for (const item of newlySlashed) {
        next[item.stake.id] = item;
      }
      return next;
    });

    const latest = newlySlashed[newlySlashed.length - 1];
    setRecentSlashDebit({
      id: latest.stake.id,
      amount: latest.stake.amount,
      token: latest.stake.token,
    });
    if (debitTimerRef.current !== null) {
      window.clearTimeout(debitTimerRef.current);
    }
    debitTimerRef.current = window.setTimeout(() => {
      setRecentSlashDebit(null);
      debitTimerRef.current = null;
    }, 1500);

    for (const item of newlySlashed) {
      const id = item.stake.id;
      if (slashTimersRef.current[id]) {
        window.clearTimeout(slashTimersRef.current[id]);
      }
      slashTimersRef.current[id] = window.setTimeout(() => {
        setExitingSlashed((prev) => {
          if (!prev[id]) return prev;
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
        delete slashTimersRef.current[id];
      }, 1380);
    }
  }, [stakes]);

  // Keep track of each active stake's visible index AFTER checking for newly slashed items
  useEffect(() => {
    const nextMap: Record<string, number> = {};
    filteredStakes.forEach((entry, idx) => {
      nextMap[entry.stake.id] = idx;
    });
    prevVisibleIndexRef.current = nextMap;
  }, [filteredStakes]);

  useEffect(() => {
    return () => {
      Object.values(slashTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      if (debitTimerRef.current !== null) {
        window.clearTimeout(debitTimerRef.current);
      }
    };
  }, []);

  const displayedStakes = useMemo(() => {
    const base = filteredStakes.map((entry) => ({
      ...entry,
      isSlashingOut: false,
    }));

    const exitingList = (
      Object.values(exitingSlashed) as Array<{
        stake: StakeCommitment;
        originalIndex: number;
      }>
    )
      .filter((item) => !base.some((b) => b.stake.id === item.stake.id))
      .sort((a, b) => a.originalIndex - b.originalIndex);

    if (exitingList.length === 0) return base;

    const merged = [...base];
    for (const item of exitingList) {
      const nextTs = getNextAlarmTimestamp(item.stake.alarmHour, item.stake.alarmMinute, nowMs);
      const insertAt = Math.max(0, Math.min(item.originalIndex, merged.length));
      merged.splice(insertAt, 0, {
        stake: item.stake,
        nextTs,
        remainingMs: nextTs - nowMs,
        isSlashingOut: true,
      });
    }
    return merged;
  }, [filteredStakes, exitingSlashed, nowMs]);

  const verifiedUnclaimedStakes = useMemo(
    () => stakes.filter((s) => s.status === 'verified'),
    [stakes]
  );

  const nextStakeEntry = activeStakes[0] || null;

  // Pollar RAMP & Pollar balances apply strictly when connected via Pollar or authenticated Pollar provider for this wallet
  const activePollarAddress = pollar.solanaWallet?.address || pollar.wallet?.address || null;
  const isPollarConnected =
    connectionKind === 'pollar' ||
    Boolean(
      pollar.configured &&
        pollar.isAuthenticated &&
        activePollarAddress &&
        activePollarAddress === walletAddress
    );

  // Live on-chain & Pollar free balances (starts at $0.00 on fresh wallets)
  const onChainFreeUsdc =
    isPollarConnected && pollar.solanaBalances.usdc !== null
      ? pollar.solanaBalances.usdc
      : devnet.usdcBalance ?? 0;
  const liveSolBalance =
    isPollarConnected && pollar.solanaBalances.sol !== null
      ? pollar.solanaBalances.sol
      : devnet.solBalance;
  const freeUsdcBalance = Number((onChainFreeUsdc + earnedUsdcBalance).toFixed(2));
  const freeSkrBalance = Number(((devnet.skrBalance ?? 0) + earnedSkrBalance).toFixed(2));

  // Real locked stakes separated accurately by asset (never mixing SKR 1:1 into USD)
  const lockedUsdcUsd = useMemo(
    () =>
      activeStakes
        .filter((entry) => entry.stake.token === 'USDC')
        .reduce((sum, entry) => sum + entry.stake.amount, 0),
    [activeStakes]
  );
  const lockedSkrAmount = useMemo(
    () =>
      activeStakes
        .filter((entry) => entry.stake.token === 'SKR')
        .reduce((sum, entry) => sum + entry.stake.amount, 0),
    [activeStakes]
  );
  const totalSkrBalance = Number((freeSkrBalance + lockedSkrAmount).toFixed(2));

  const totalProjectedUsdcSplit = useMemo(
    () =>
      activeStakes
        .filter((entry) => entry.stake.token === 'USDC')
        .reduce((sum, entry) => sum + entry.stake.slashedBonusEstimate, 0),
    [activeStakes]
  );
  const totalProjectedSkrSplit = useMemo(
    () =>
      activeStakes
        .filter((entry) => entry.stake.token === 'SKR')
        .reduce((sum, entry) => sum + entry.stake.slashedBonusEstimate, 0),
    [activeStakes]
  );
  const skrStakeCount = useMemo(
    () => activeStakes.filter((entry) => entry.stake.token === 'SKR').length,
    [activeStakes]
  );

  // Live SOL -> USDC market equivalent & 24h fluctuation
  const solValueUsdc =
    liveSolBalance !== null && devnet.solPriceUsd !== null
      ? Number((liveSolBalance * devnet.solPriceUsd).toFixed(2))
      : 0;
  const solChange24hPct = devnet.solChange24hPct;
  const solDelta24hUsdc =
    solValueUsdc > 0 && solChange24hPct !== null && 100 + solChange24hPct > 0
      ? Number((solValueUsdc - solValueUsdc / (1 + solChange24hPct / 100)).toFixed(2))
      : null;

  // Total Vault Balance strictly in USDC (free live USDC + locked USDC stakes + live SOL equivalent in USDC)
  const combinedVaultUsd = Number((freeUsdcBalance + lockedUsdcUsd + solValueUsdc).toFixed(2));
  const combinedVaultSol =
    devnet.solPriceUsd !== null && devnet.solPriceUsd > 0
      ? Number(
          ((freeUsdcBalance + lockedUsdcUsd) / devnet.solPriceUsd + (liveSolBalance ?? 0)).toFixed(4)
        )
      : liveSolBalance !== null && freeUsdcBalance === 0 && lockedUsdcUsd === 0
        ? Number(liveSolBalance.toFixed(4))
        : null;
  const balancesLoading = devnet.syncing || (isPollarConnected && pollar.solanaBalances.loading);
  const balanceSourceLabel =
    isPollarConnected && pollar.solanaBalances.usdc !== null
      ? 'Synced via Pollar'
      : 'Live on Devnet';

  // 7-day vault trend built strictly from real stake, payout history & live SOL 24h valuation
  const vaultMomentumValues = useMemo(() => {
    const dayMs = 86_400_000;
    const endOfToday = new Date(nowMs);
    endOfToday.setHours(23, 59, 59, 999);
    const endTs = endOfToday.getTime();
    const prevDaySolUsdc =
      solDelta24hUsdc !== null ? Math.max(0, Number((solValueUsdc - solDelta24hUsdc).toFixed(2))) : solValueUsdc;

    const buckets: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const cutoffTs = endTs - i * dayMs;
      const earnedUpToDay = history
        .filter((h) => h.token === 'USDC' && h.status === 'claimed' && Date.parse(h.dateIso) <= cutoffTs)
        .reduce((sum, h) => sum + h.bonus, 0);
      const lockedUpToDay = stakes
        .filter(
          (s) =>
            s.token === 'USDC' &&
            (s.status === 'locked' || s.status === 'ringing' || s.status === 'verified') &&
            s.createdAt <= cutoffTs
        )
        .reduce((sum, s) => sum + s.amount, 0);
      const solBaseline = i === 0 ? solValueUsdc : prevDaySolUsdc;
      buckets.push(Number((onChainFreeUsdc + earnedUpToDay + lockedUpToDay + solBaseline).toFixed(2)));
    }
    buckets[6] = combinedVaultUsd;
    return buckets;
  }, [
    history,
    stakes,
    onChainFreeUsdc,
    solValueUsdc,
    solDelta24hUsdc,
    combinedVaultUsd,
    Math.floor(nowMs / 3_600_000),
  ]);

  const selectedSoundLabel =
    ALARM_SOUNDS.find((a) => a.id === alarmSettings.selectedSound)?.label || 'Siren';

  const handleCopyWalletAddress = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopiedWalletAddr(true);
      window.setTimeout(() => setCopiedWalletAddr(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleInstantDepositUsdc = () => {
    setQuickStakeError(null);
    if (isPollarConnected) {
      onOpenPollarFund();
    } else {
      setVaultModalMode('fund');
    }
  };

  const handleInstantPresetStake = async (preset: HomeQuickStakePreset) => {
    if (!onQuickCreateStake) {
      onOpenMissions();
      return;
    }
    const matchedCategory =
      categories.find((cat) => cat.id === preset.categoryId) || categories[0];
    if (!matchedCategory) {
      onOpenMissions();
      return;
    }

    setQuickStakeError(null);
    setActiveQuickPresetId(preset.id);
    try {
      await onQuickCreateStake({
        category: matchedCategory,
        amount: preset.amount,
        token: preset.token,
        alarmHour: preset.alarmHour,
        alarmMinute: preset.alarmMinute,
        motivationNote: preset.motivationNote,
        frequencyLabel: preset.frequencyLabel,
      });
    } catch (err) {
      setQuickStakeError(
        err instanceof Error ? err.message : 'Unable to lock preset stake right now.'
      );
    } finally {
      setActiveQuickPresetId(null);
    }
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
              <div className="flex items-center gap-2 text-xs font-medium text-white/60">
                <span>Total Vault Balance</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-white/55">
                  {balancesLoading ? (
                    <RefreshCw className="w-2.5 h-2.5 animate-spin text-[#F16A2E]" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80]" />
                  )}
                  <span>{balanceSourceLabel}</span>
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums">
                  {balanceDisplayUnit === 'USDC'
                    ? `$${combinedVaultUsd.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : combinedVaultSol !== null
                      ? combinedVaultSol.toLocaleString(undefined, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                        })
                      : '—'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setBalanceDisplayUnit((prev) => (prev === 'USDC' ? 'SOL' : 'USDC'))
                  }
                  aria-label={
                    balanceDisplayUnit === 'USDC'
                      ? 'Switch total balance display to SOL'
                      : 'Switch total balance display to USDC'
                  }
                  title={
                    balanceDisplayUnit === 'USDC'
                      ? 'Switch total to SOL'
                      : 'Switch total to USDC'
                  }
                  className="min-h-[34px] px-2.5 py-1 rounded-full bg-white/12 hover:bg-white/22 border border-white/15 text-xs font-mono font-bold text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <span>{balanceDisplayUnit}</span>
                  <ArrowLeftRight className="w-3 h-3 text-[#F16A2E] shrink-0" />
                </button>
                {solChange24hPct !== null && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-mono font-bold tabular-nums ${
                      solChange24hPct >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'
                    }`}
                  >
                    <span>{solChange24hPct >= 0 ? '▲' : '▼'}</span>
                    <span>
                      {solChange24hPct >= 0 ? '+' : ''}
                      {solChange24hPct.toFixed(2)}%
                    </span>
                    {balanceDisplayUnit === 'USDC' && solDelta24hUsdc !== null && (
                      <span className="text-[11px] opacity-85 ml-0.5">
                        ({solDelta24hUsdc >= 0 ? '+' : '-'}$
                        {Math.abs(solDelta24hUsdc).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        )
                      </span>
                    )}
                    <span className="text-[10px] text-white/50 font-normal ml-0.5">24h</span>
                  </span>
                )}
              </div>
              {balanceDisplayUnit === 'SOL' && devnet.solPriceUsd !== null && (
                <div className="mt-0.5 text-[11px] font-mono text-white/60 tabular-nums">
                  ≈ $
                  {combinedVaultUsd.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  USDC · 1 SOL = ${devnet.solPriceUsd.toFixed(2)}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/75 tabular-nums">
                <span className="text-[#4ADE80] font-semibold">
                  ${freeUsdcBalance.toFixed(2)} USDC free
                </span>
                <span aria-hidden="true">·</span>
                <span>${lockedUsdcUsd.toFixed(2)} locked</span>
                <span aria-hidden="true">·</span>
                <span>
                  {totalSkrBalance === 0 ? '0' : totalSkrBalance.toFixed(2)} SKR
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-white/80 font-medium">
                  {liveSolBalance !== null
                    ? `${liveSolBalance.toFixed(4)} SOL${
                        devnet.solPriceUsd !== null
                          ? ` (≈ $${solValueUsdc.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })} USDC)`
                          : ''
                      }`
                    : '— SOL'}
                </span>
              </div>
            </div>

            {isPollarConnected && (
              <button
                type="button"
                onClick={onOpenPollarFund}
                className="min-h-[40px] px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/18 text-[11px] font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#F16A2E]" />
                <span>Pollar RAMP</span>
              </button>
            )}
          </div>

          {/* Compact 7-day Vault Momentum Sparkline (Real History & Active Stakes) */}
          <div className="relative z-10 rounded-2xl bg-white/[0.05] border border-white/10 px-3.5 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-white/60 inline-flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-[#4ADE80]" />
                <span>Projected Split</span>
              </div>
              <div className="font-mono text-sm font-bold text-[#4ADE80] tabular-nums">
                +${totalProjectedUsdcSplit.toFixed(2)} est.
                {totalProjectedSkrSplit > 0 && (
                  <span className="text-white/75 text-xs ml-1.5">
                    (+{totalProjectedSkrSplit.toFixed(2)} SKR)
                  </span>
                )}
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
              onClick={() => setVaultModalMode('fund')}
              className="flex flex-col items-center gap-1.5 group min-h-[44px]"
            >
              <span className="w-12 h-12 rounded-full bg-[#F16A2E] group-hover:bg-[#E05920] text-white flex items-center justify-center transition-colors shadow-sm">
                <ArrowDownLeft className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-semibold text-white/85">Fund</span>
            </button>

            <button
              type="button"
              onClick={() => setVaultModalMode('withdraw')}
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

      {/* Quick Actions Row (Collapsed by Default): Instant USDC Deposit + 1-Tap Preset Stakes */}
      <section aria-label="Quick Actions" className="space-y-3">
        <div className="actake-card overflow-hidden">
          <button
            type="button"
            aria-expanded={quickActionsExpanded}
            aria-controls="home-quick-actions-panel"
            onClick={() => setQuickActionsExpanded((prev) => !prev)}
            className="w-full min-h-[56px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#FFF9F5] transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-2xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-sm sm:text-base font-extrabold text-[#111114] tracking-tight">
                  Quick Actions
                </div>
                <p className="text-xs text-[#6B6663] truncate">
                  Deposit USDC · $10 Wakeup · $25 Gym · 25 SKR Study
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F16A2E] whitespace-nowrap shrink-0">
              <span>{quickActionsExpanded ? 'Hide' : 'Expand'}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  quickActionsExpanded ? 'rotate-180' : ''
                }`}
              />
            </span>
          </button>
        </div>

        {quickActionsExpanded && (
          <div id="home-quick-actions-panel" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-xs text-[#6B6663]">
                Deposit USDC or lock a common accountability preset in one tap
              </p>
              <button
                type="button"
                onClick={onOpenMissions}
                className="min-h-[40px] px-3 py-1.5 rounded-full text-xs font-bold text-[#F16A2E] hover:bg-[#FFF0E6] inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Custom Stake</span>
              </button>
            </div>

            {quickStakeError && (
              <div
                role="alert"
                className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 flex items-start justify-between gap-3 text-xs text-[#991B1B]"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold">Quick stake did not complete</div>
                    <p className="text-[#B91C1C] mt-0.5 break-words">{quickStakeError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss quick stake error"
                  onClick={() => setQuickStakeError(null)}
                  className="w-8 h-8 rounded-full hover:bg-[#FEE2E2] flex items-center justify-center text-[#991B1B] shrink-0 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Instant USDC Deposit Action Card */}
              <div className="actake-card p-4 flex flex-col justify-between gap-3.5">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="w-10 h-10 rounded-2xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
                      <ArrowDownLeft className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-display text-sm font-extrabold text-[#111114] truncate">
                        Deposit USDC
                      </div>
                      <div className="text-[11px] text-[#6B6663] mt-0.5 tabular-nums truncate">
                        ${freeUsdcBalance.toFixed(2)} free · {isPollarConnected ? 'Pollar RAMP' : 'Devnet SPL'}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleInstantDepositUsdc}
                  className="w-full min-h-[44px] px-4 py-2 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                  <span>{isPollarConnected ? 'Deposit via RAMP' : 'Deposit USDC'}</span>
                </button>
              </div>

              {/* 1-Tap Common Stake Preset Cards */}
              {HOME_QUICK_STAKE_PRESETS.map((preset) => {
                const clockFmt = formatClockTime12h(preset.alarmHour, preset.alarmMinute);
                const isLockingThis = activeQuickPresetId === preset.id;
                const disabled = submittingStake || activeQuickPresetId !== null;
                const amountText =
                  preset.token === 'USDC' ? `$${preset.amount} USDC` : `${preset.amount} SKR`;

                return (
                  <div
                    key={preset.id}
                    className="actake-card p-4 flex flex-col justify-between gap-3.5"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="w-10 h-10 rounded-2xl bg-[#F8F3EF] text-[#111114] flex items-center justify-center shrink-0">
                          {preset.icon === 'sunrise' && (
                            <Sunrise className="w-4.5 h-4.5 text-[#F16A2E]" />
                          )}
                          {preset.icon === 'gym' && <Dumbbell className="w-4.5 h-4.5 text-[#111114]" />}
                          {preset.icon === 'study' && (
                            <BookOpen className="w-4.5 h-4.5 text-[#0F766E]" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="font-display text-sm font-extrabold text-[#111114] truncate">
                            {preset.title}
                          </div>
                          <div className="text-[11px] text-[#6B6663] mt-0.5 tabular-nums truncate">
                            {clockFmt.full} · {preset.frequencyLabel} · {preset.feeLabel}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void handleInstantPresetStake(preset)}
                      className="w-full min-h-[44px] px-4 py-2 rounded-full bg-[#111114] hover:bg-[#F16A2E] disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums transition-colors"
                    >
                      {isLockingThis ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>Locking {amountText}...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 text-[#F16A2E] shrink-0" />
                          <span>Stake {amountText}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Horizontal X-Axis Scrollable Calendar with Auto Month Switching */}
      <ScrollableCalendarStrip
        nowMs={nowMs}
        streakDays={streakDays}
        activeStakeCount={activeStakes.length}
      />

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
          {displayedStakes.length === 0 ? (
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
              {displayedStakes.map(({ stake, nextTs, remainingMs, isSlashingOut }) => {
                const fmt = formatClockTime12h(stake.alarmHour, stake.alarmMinute);
                const cd = formatCountdownParts(remainingMs);
                const dayText = isSameDayAlarm(nextTs, nowMs);
                const totalWindowMs = 24 * 60 * 60 * 1000;
                const progressPct = Math.max(
                  10,
                  Math.min(96, Math.round(((totalWindowMs - remainingMs) / totalWindowMs) * 100))
                );
                const isPendingSlash = !isSlashingOut && slashingStakeId === stake.id;
                const shortTreasury = treasuryConfig?.treasuryWallet
                  ? `${treasuryConfig.treasuryWallet.slice(0, 4)}...${treasuryConfig.treasuryWallet.slice(-4)}`
                  : 'Actake Treasury';

                return (
                  <div
                    key={stake.id}
                    className={isSlashingOut ? 'actake-slash-row' : undefined}
                  >
                    <div className={isSlashingOut ? 'actake-slash-row-inner' : undefined}>
                      <div
                        className={`actake-card p-5 flex flex-col justify-between gap-4 relative transition-colors duration-300 ${
                          isSlashingOut
                            ? 'actake-slash-card pointer-events-none'
                            : isPendingSlash
                              ? 'border-[#FCA5A5] bg-[#FFF8F8]'
                              : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3.5 min-w-0">
                            <div
                              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors duration-300 ${
                                isSlashingOut
                                  ? 'bg-[#FEE2E2] text-[#DC2626]'
                                  : 'bg-[#FFF2EA] text-[#F16A2E]'
                              }`}
                            >
                              {isSlashingOut ? (
                                <ArrowUpRight className="w-5 h-5" />
                              ) : (
                                <Camera className="w-5 h-5" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`font-display text-base font-bold truncate transition-colors duration-300 ${
                                    isSlashingOut ? 'text-[#991B1B] line-through' : 'text-[#111114]'
                                  }`}
                                >
                                  {stake.categoryName}
                                </div>
                                {isSlashingOut && (
                                  <span className="px-2 py-0.5 rounded-full bg-[#DC2626] text-white text-[10px] font-bold uppercase tracking-wider shrink-0">
                                    Slashed
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[#6B6663] mt-0.5 tabular-nums">
                                {isSlashingOut ? (
                                  <span className="font-semibold text-[#B91C1C]">
                                    100% transferred out → {shortTreasury}
                                  </span>
                                ) : (
                                  <>
                                    {fmt.full} ({dayText}) · {stake.frequencyLabel || 'Daily'} ·{' '}
                                    {stake.token}{' '}
                                    {stake.protocolFeePct === 0 ? '(0% fee)' : '(SPL)'}
                                  </>
                                )}
                              </div>
                              {stake.motivationNote && !isSlashingOut && (
                                <p className="text-xs text-[#877F7A] mt-1 line-clamp-1">
                                  “{stake.motivationNote}”
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0 tabular-nums relative">
                            {isSlashingOut && (
                              <div
                                aria-live="polite"
                                className="actake-funds-outflow-chip absolute -top-2 right-0 z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#DC2626] text-white text-[11px] font-extrabold shadow-[0_8px_18px_rgba(220,38,38,0.35)] whitespace-nowrap"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  -${stake.amount.toFixed(2)} {stake.token}
                                </span>
                              </div>
                            )}
                            <div
                              className={`font-display text-lg font-extrabold transition-colors duration-300 ${
                                isSlashingOut ? 'text-[#DC2626] line-through opacity-75' : 'text-[#111114]'
                              }`}
                            >
                              {isSlashingOut ? `-$${stake.amount.toFixed(2)}` : `$${stake.amount.toFixed(2)}`}
                            </div>
                            <div
                              className={`text-xs font-semibold transition-colors duration-300 ${
                                isSlashingOut ? 'text-[#B91C1C]' : 'text-[#16A34A]'
                              }`}
                            >
                              {isSlashingOut
                                ? 'Sent to Treasury'
                                : `+$${stake.slashedBonusEstimate.toFixed(2)} split`}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs tabular-nums">
                            <span
                              className={
                                isSlashingOut
                                  ? 'text-[#DC2626] font-semibold inline-flex items-center gap-1'
                                  : cd.isUrgent
                                    ? 'text-[#F16A2E] font-semibold'
                                    : 'text-[#6B6663]'
                              }
                            >
                              {isSlashingOut ? (
                                <>
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                  <span>Draining escrow balance to Treasury...</span>
                                </>
                              ) : (
                                `Deadline in ${cd.compact}`
                              )}
                            </span>
                            <span className={isSlashingOut ? 'text-[#DC2626] font-bold' : 'text-[#6B6663]'}>
                              {isSlashingOut ? '$0.00 left' : `${progressPct}% elapsed`}
                            </span>
                          </div>
                          <div
                            className={`h-2 w-full rounded-full overflow-hidden ${
                              isSlashingOut ? 'bg-[#FEE2E2]' : 'bg-[#F7ECE6]'
                            }`}
                          >
                            <div
                              className={`h-full rounded-full ${
                                isSlashingOut
                                  ? 'w-full bg-gradient-to-r from-[#EF4444] to-[#B91C1C] actake-bar-drain'
                                  : 'bg-gradient-to-r from-[#F16A2E] to-[#FF9B6B]'
                              }`}
                              style={isSlashingOut ? undefined : { width: `${progressPct}%` }}
                            />
                          </div>
                        </div>

                        {isSlashingOut ? (
                          <div className="relative overflow-hidden rounded-2xl bg-[#FEE2E2]/80 border border-[#FECACA] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs text-[#991B1B] font-semibold">
                            <span
                              aria-hidden="true"
                              className="actake-transfer-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent"
                            />
                            <span className="relative inline-flex items-center gap-1.5 truncate">
                              <ArrowUpRight className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />
                              <span className="truncate">
                                Funds routed away from your account → {shortTreasury}
                              </span>
                            </span>
                            <span className="relative font-mono text-[11px] font-bold text-[#DC2626] shrink-0 tabular-nums">
                              -${stake.amount.toFixed(2)} {stake.token}
                            </span>
                          </div>
                        ) : (
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
                            <div className="flex items-center gap-2 shrink-0">
                              {onSlashPersonalStake && (
                                <button
                                  type="button"
                                  disabled={slashingStakeId === stake.id}
                                  onClick={() => setPendingForfeitStake(stake)}
                                  className="min-h-[40px] px-3 py-1.5 rounded-full border border-[#F3DDD5] hover:border-[#DC2626] text-[#877F7A] hover:text-[#DC2626] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                                >
                                  {slashingStakeId === stake.id ? 'Slashing...' : 'Forfeit'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onTriggerTestAlarm(stake)}
                                className="min-h-[40px] px-4 py-1.5 rounded-full bg-[#FFF2EA] hover:bg-[#F16A2E] text-[#F16A2E] hover:text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                              >
                                Test Alarm
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <ConfirmDialog
            open={Boolean(pendingForfeitStake)}
            title="Forfeit Personal Stake to Treasury?"
            description={
              pendingForfeitStake
                ? `Marking "${pendingForfeitStake.categoryName}" as missed routes 100% of $${pendingForfeitStake.amount.toFixed(2)} ${pendingForfeitStake.token} directly to the Actake Fee Treasury${
                    treasuryConfig?.treasuryWallet
                      ? ` (${treasuryConfig.treasuryWallet.slice(0, 6)}...${treasuryConfig.treasuryWallet.slice(-4)})`
                      : ''
                  } and logs a slashed receipt.`
                : ''
            }
            confirmLabel="Slash 100% to Treasury"
            cancelLabel="Keep Stake Active"
            destructive
            onCancel={() => setPendingForfeitStake(null)}
            onConfirm={() => {
              const target = pendingForfeitStake;
              setPendingForfeitStake(null);
              if (target && onSlashPersonalStake) {
                void onSlashPersonalStake(target);
              }
            }}
          />
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
              <div
                className={`rounded-2xl border p-3.5 transition-colors duration-300 relative ${
                  recentSlashDebit
                    ? 'bg-[#FEF2F2] border-[#FCA5A5]'
                    : 'bg-[#FFF8F4] border-[#F2E3DA]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="text-[11px] font-semibold text-[#6B6663]">Locked Principal</div>
                  {recentSlashDebit && (
                    <span
                      key={recentSlashDebit.id}
                      className="actake-debit-badge inline-flex items-center gap-0.5 text-[10px] font-extrabold text-[#DC2626] whitespace-nowrap"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                      -${recentSlashDebit.amount.toFixed(2)}
                    </span>
                  )}
                </div>
                <div
                  className={`font-display text-xl font-extrabold mt-0.5 transition-colors duration-300 ${
                    recentSlashDebit ? 'text-[#B91C1C]' : 'text-[#111114]'
                  }`}
                >
                  ${lockedUsdcUsd.toFixed(2)}
                </div>
                <div className="text-[11px] text-[#877F7A] mt-0.5">
                  {lockedSkrAmount > 0
                    ? `${lockedSkrAmount.toFixed(2)} SKR · ${activeStakes.length} active`
                    : `${activeStakes.length} active ${activeStakes.length === 1 ? 'stake' : 'stakes'}`}
                </div>
              </div>

              <div className="rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] p-3.5">
                <div className="text-[11px] font-semibold text-[#166534]">Est. Slashed Split</div>
                <div className="font-display text-xl font-extrabold text-[#14532D] mt-0.5">
                  +${totalProjectedUsdcSplit.toFixed(2)}
                </div>
                <div className="text-[11px] text-[#166534] mt-0.5">
                  {totalProjectedSkrSplit > 0
                    ? `+${totalProjectedSkrSplit.toFixed(2)} SKR · 0% fee`
                    : skrStakeCount > 0
                      ? `${skrStakeCount} at 0% SKR fee`
                      : '1.5% USDC fee'}
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

      {/* Real Fund / Withdraw Vault Sheet Modal (Pollar RAMP, Receive QR, Live Balances & Claim Settlement) */}
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
                {vaultModalMode === 'fund' ? 'Fund Solana Wallet' : 'Withdraw & Claim Payouts'}
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

            {/* Live Connected Balances Summary */}
            <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
              <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-3">
                <div className="text-[10px] font-semibold text-[#6B6663]">Free USDC</div>
                <div className="font-mono font-bold text-sm text-[#111114] mt-0.5">
                  ${freeUsdcBalance.toFixed(2)}
                </div>
              </div>
              <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-3">
                <div className="text-[10px] font-semibold text-[#6B6663]">Free SKR</div>
                <div className="font-mono font-bold text-sm text-[#111114] mt-0.5">
                  {freeSkrBalance.toFixed(2)}
                </div>
              </div>
              <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-3">
                <div className="text-[10px] font-semibold text-[#6B6663]">Devnet SOL</div>
                <div className="font-mono font-bold text-sm text-[#111114] mt-0.5">
                  {liveSolBalance !== null ? liveSolBalance.toFixed(4) : '—'}
                </div>
                {liveSolBalance !== null && devnet.solPriceUsd !== null && (
                  <div className="font-mono text-[10px] text-[#6B6663] mt-0.5">
                    ≈ ${solValueUsdc.toFixed(2)} USDC
                  </div>
                )}
              </div>
            </div>

            {/* Primary Pollar RAMP / Receive / Send Section (Pollar Wallets Only) */}
            {isPollarConnected && (
              <div className="rounded-2xl bg-[#141416] text-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold inline-flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#F16A2E]" />
                    <span>Pollar RAMP (Solana)</span>
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
                    ? 'Buy USDC or SOL with card/bank rails via Pollar RAMP, or deposit crypto directly to your Solana address.'
                    : 'Transfer available USDC or SOL out of your Pollar Solana wallet, or claim verified escrow stakes below.'}
                </p>

                {vaultModalMode === 'fund' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setVaultModalMode(null);
                        onOpenPollarFund();
                      }}
                      className="min-h-[44px] px-3 py-2 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      <span>Pollar RAMP</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (pollar.configured && pollar.isAuthenticated) {
                          setVaultModalMode(null);
                          pollar.openReceiveModal();
                        } else {
                          void handleCopyWalletAddress();
                        }
                      }}
                      className="min-h-[44px] px-3 py-2 rounded-full bg-white/14 hover:bg-white/22 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>
                        {pollar.configured && pollar.isAuthenticated
                          ? 'Receive QR'
                          : copiedWalletAddr
                            ? 'Address Copied'
                            : 'Copy Address'}
                      </span>
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
            )}

            {/* Verified Unclaimed Stakes (Withdraw Mode) OR Direct Deposit Address (Fund Mode) */}
            {vaultModalMode === 'withdraw' ? (
              verifiedUnclaimedStakes.length > 0 && onClaimVerifiedStake ? (
                <div className="rounded-2xl bg-[#ECFDF5] border border-[#BBF7D0] p-4 space-y-3">
                  <div className="text-xs font-extrabold text-[#14532D]">
                    {verifiedUnclaimedStakes.length} Verified Stake
                    {verifiedUnclaimedStakes.length > 1 ? 's' : ''} Ready to Claim
                  </div>
                  <p className="text-xs text-[#166534] tabular-nums">
                    {verifiedUnclaimedStakes[0].categoryName} · $
                    {(
                      verifiedUnclaimedStakes[0].amount +
                      verifiedUnclaimedStakes[0].slashedBonusEstimate
                    ).toFixed(2)}{' '}
                    {verifiedUnclaimedStakes[0].token}
                  </p>
                  <button
                    type="button"
                    disabled={claimingStakeId === verifiedUnclaimedStakes[0].id}
                    onClick={() => {
                      setVaultModalMode(null);
                      void onClaimVerifiedStake(verifiedUnclaimedStakes[0]);
                    }}
                    className="w-full min-h-[44px] rounded-full bg-[#14532D] hover:bg-[#16A34A] disabled:opacity-60 text-white text-xs font-bold transition-colors"
                  >
                    {claimingStakeId === verifiedUnclaimedStakes[0].id
                      ? 'Settling on Devnet...'
                      : 'Claim Escrow Payout Now'}
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-4 space-y-1.5 text-xs text-[#6B6663]">
                  <div className="font-bold text-[#111114]">
                    {lockedUsdcUsd > 0 || lockedSkrAmount > 0
                      ? `Locked in Active Stakes: $${lockedUsdcUsd.toFixed(2)} USDC${lockedSkrAmount > 0 ? ` · ${lockedSkrAmount.toFixed(2)} SKR` : ''}`
                      : 'No verified escrow payouts waiting to claim'}
                  </div>
                  <p className="leading-relaxed">
                    Staked principal and slashed pool splits unlock automatically after you pass live
                    AI camera verification before your deadline.
                  </p>
                </div>
              )
            ) : (
              <div className="rounded-2xl bg-[#FFF8F4] border border-[#F2E3DA] p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#111114]">Direct Solana Deposit Address</span>
                  <span className="text-[11px] font-mono text-[#16A34A] font-semibold">
                    solana:devnet
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyWalletAddress()}
                  className="w-full min-h-[44px] rounded-xl bg-white border border-[#EFE2D9] hover:border-[#F16A2E] px-3 py-2 flex items-center justify-between gap-2 text-left transition-colors"
                >
                  <span className="font-mono text-xs text-[#111114] truncate">{walletAddress}</span>
                  {copiedWalletAddr ? (
                    <Check className="w-4 h-4 text-[#16A34A] shrink-0" />
                  ) : (
                    <Copy className="w-4 h-4 text-[#6B6663] shrink-0" />
                  )}
                </button>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onRefreshDevnet();
                      if (pollar.isAuthenticated) {
                        void pollar.refreshWalletBalance(true);
                      }
                    }}
                    className="text-xs font-bold text-[#F16A2E] hover:underline inline-flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${balancesLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh Live Balances</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVaultModalMode(null);
                      onOpenWalletSheet();
                    }}
                    className="text-xs font-semibold text-[#6B6663] hover:text-[#111114]"
                  >
                    Switch Wallet
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
