import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  Cpu,
  ExternalLink,
  Flame,
  Info,
  Loader2,
  Lock,
  MapPin,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  ContestantStatsRecord,
  HistoryEntry,
  OnChainTransactionDetails,
  StakeCommitment,
  StatsSummaryResponse,
  TokenType,
} from '../types/actake';
import {
  buildDevnetExplorerAddressUrl,
  buildDevnetExplorerTxUrl,
  buildDevnetSolscanTxUrl,
  fetchOnChainTransactionDetails,
  TOKEN_CONFIGS,
} from '../solana/actakeEscrow';
import { MascotDisplay } from './MascotDisplay';
import { EmptyState } from './UiPrimitives';

interface HistoryViewProps {
  history: HistoryEntry[];
  stakes: StakeCommitment[];
  streakDays: number;
  solPriceUsd?: number | null;
  walletPubkey?: string | null;
  walletName?: string | null;
  onOpenHunt?: (huntId: string) => void;
}

interface UnifiedHistoryRecord {
  id: string;
  dateIso: string;
  kind: 'habit' | 'hunt';
  huntId?: string;
  landmarkName?: string;
  habitTitle: string;
  subtitle: string;
  token: TokenType;
  principal: number;
  bonus: number;
  totalPayout: number;
  protocolFeePct: number;
  txSignature: string;
  explorerUrl: string;
  status: 'claimed' | 'slashed' | 'locked' | 'verified';
  escrowPda?: string;
  source: 'history' | 'stake' | 'server-hunt' | 'server-checkin' | 'server-settlement';
}

type HistoryFilterTab = 'ALL' | 'HUNTS' | TokenType | 'STAKES' | 'SLASHED';

const shortenWallet = (pk: string): string =>
  pk.length > 12 ? `${pk.slice(0, 4)}...${pk.slice(-4)}` : pk;

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  stakes,
  streakDays,
  solPriceUsd = null,
  walletPubkey = null,
  onOpenHunt,
}) => {
  const [tokenFilter, setTokenFilter] = useState<HistoryFilterTab>('ALL');
  const [historySearch, setHistorySearch] = useState('');
  const [contestantSearch, setContestantSearch] = useState('');
  const [selectedContestantWallet, setSelectedContestantWallet] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<UnifiedHistoryRecord | null>(null);
  const [txDetails, setTxDetails] = useState<OnChainTransactionDetails | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // Real-synced community stats + server-synced hunt claims & pool history
  const [statsSummary, setStatsSummary] = useState<StatsSummaryResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const chartScrollRef = useRef<HTMLDivElement | null>(null);
  const userBarRef = useRef<HTMLButtonElement | null>(null);

  const fetchStatsSummary = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const qs = walletPubkey ? `?wallet=${encodeURIComponent(walletPubkey)}` : '';
      const resp = await fetch(`/api/stats/summary${qs}`);
      const data = (await resp.json()) as StatsSummaryResponse & { error?: string };
      if (!resp.ok || !Array.isArray(data.contestants)) {
        throw new Error(data.error || 'Unable to sync live stats.');
      }
      setStatsSummary(data);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Unable to sync live stats.');
    } finally {
      setStatsLoading(false);
    }
  }, [walletPubkey]);

  useEffect(() => {
    void fetchStatsSummary();
  }, [fetchStatsSummary]);

  // Merge local history, local stakes, AND server-synced hunt claims, settlements, and check-ins
  const allRecords = useMemo<UnifiedHistoryRecord[]>(() => {
    const seenSigs = new Set<string>();
    const seenHuntIds = new Set<string>();
    const merged: UnifiedHistoryRecord[] = [];

    // 1. Local history receipts (habits + locally recorded hunt claims)
    for (const h of history) {
      const isHunt =
        h.kind === 'hunt' ||
        Boolean(h.huntId) ||
        h.verifiedItem.toLowerCase().includes('ar geodrop');
      if (h.txSignature) seenSigs.add(h.txSignature);
      if (isHunt && h.huntId) seenHuntIds.add(h.huntId);
      const tokenFee = isHunt ? 0 : (TOKEN_CONFIGS[h.token]?.protocolFeePct ?? 0);
      merged.push({
        id: h.id,
        dateIso: h.dateIso,
        kind: isHunt ? 'hunt' : 'habit',
        huntId: h.huntId,
        landmarkName: h.landmarkName,
        habitTitle: h.habitTitle,
        subtitle: h.verifiedItem,
        token: h.token,
        principal: h.principal,
        bonus: h.bonus,
        totalPayout: h.totalPayout,
        protocolFeePct: tokenFee,
        txSignature: h.txSignature,
        explorerUrl: h.explorerUrl || buildDevnetExplorerTxUrl(h.txSignature),
        status: h.status,
        source: 'history',
      });
    }

    // 2. Server-synced AR GeoDrop Hunt Claims for this wallet
    for (const claim of statsSummary?.userHuntClaims ?? []) {
      if (seenSigs.has(claim.claimTxSignature) || seenHuntIds.has(claim.huntId)) continue;
      seenSigs.add(claim.claimTxSignature);
      seenHuntIds.add(claim.huntId);
      merged.push({
        id: `srv-hunt-${claim.id}`,
        dateIso: claim.claimedAt,
        kind: 'hunt',
        huntId: claim.huntId,
        landmarkName: claim.landmarkName,
        habitTitle: claim.huntTitle,
        subtitle: `AR GeoDrop · ${claim.landmarkName}`,
        token: claim.tokenSymbol,
        principal: 0,
        bonus: claim.rewardAmount,
        totalPayout: claim.rewardAmount,
        protocolFeePct: 0,
        txSignature: claim.claimTxSignature,
        explorerUrl: buildDevnetExplorerTxUrl(claim.claimTxSignature),
        status: 'claimed',
        source: 'server-hunt',
      });
    }

    // 3. Server-synced pool settlements for this wallet
    for (const s of statsSummary?.userServerSettlements ?? []) {
      if (!s.txSignature || seenSigs.has(s.txSignature)) continue;
      seenSigs.add(s.txSignature);
      merged.push({
        id: `srv-settle-${s.id}`,
        dateIso: s.settledAt,
        kind: 'habit',
        habitTitle: s.poolTitle,
        subtitle: 'Synced Pool Settlement',
        token: s.tokenSymbol,
        principal: s.principalAmount,
        bonus: s.slashedBonus,
        totalPayout: s.totalPayout,
        protocolFeePct: TOKEN_CONFIGS[s.tokenSymbol]?.protocolFeePct ?? 0,
        txSignature: s.txSignature,
        explorerUrl: buildDevnetExplorerTxUrl(s.txSignature),
        status: 'claimed',
        source: 'server-settlement',
      });
    }

    // 4. Server-synced verified pool check-ins for this wallet
    for (const chk of statsSummary?.userServerCheckins ?? []) {
      if (!chk.txSignature || seenSigs.has(chk.txSignature)) continue;
      seenSigs.add(chk.txSignature);
      merged.push({
        id: `srv-chk-${chk.id}`,
        dateIso: chk.createdAt,
        kind: 'habit',
        habitTitle: chk.poolTitle,
        subtitle: `Verified · ${chk.detectedItem}`,
        token: chk.tokenSymbol,
        principal: 0,
        bonus: 0,
        totalPayout: 0,
        protocolFeePct: 0,
        txSignature: chk.txSignature,
        explorerUrl: buildDevnetExplorerTxUrl(chk.txSignature),
        status: 'verified',
        source: 'server-checkin',
      });
    }

    // 5. Local active & historical stakes
    for (const s of stakes) {
      const sig = s.joinTxSignature;
      if (!sig || seenSigs.has(sig)) continue;
      seenSigs.add(sig);
      const mappedStatus: UnifiedHistoryRecord['status'] =
        s.status === 'claimed'
          ? 'claimed'
          : s.status === 'slashed'
            ? 'slashed'
            : s.status === 'verified'
              ? 'verified'
              : 'locked';
      merged.push({
        id: `stake-rec-${s.id}`,
        dateIso: new Date(s.createdAt).toISOString(),
        kind: 'habit',
        habitTitle: s.categoryName,
        subtitle:
          mappedStatus === 'verified'
            ? 'Verified · Awaiting Claim'
            : mappedStatus === 'locked'
              ? s.squadName
                ? `Active Escrow · ${s.squadName}`
                : 'Active Escrow Deposit'
              : s.squadName || 'Escrow Stake Receipt',
        token: s.token,
        principal: s.amount,
        bonus: mappedStatus === 'slashed' ? 0 : s.slashedBonusEstimate,
        totalPayout:
          mappedStatus === 'slashed' ? 0 : Number((s.amount + s.slashedBonusEstimate).toFixed(2)),
        protocolFeePct: s.protocolFeePct,
        txSignature: sig,
        explorerUrl: s.explorerUrl || buildDevnetExplorerTxUrl(sig),
        status: mappedStatus,
        escrowPda: s.escrowPda,
        source: 'stake',
      });
    }

    return merged.sort((a, b) => Date.parse(b.dateIso) - Date.parse(a.dateIso));
  }, [history, stakes, statsSummary]);

  const claimedHuntRecords = useMemo(
    () => allRecords.filter((r) => r.kind === 'hunt' && r.status === 'claimed'),
    [allRecords]
  );

  const totalHuntRewards = useMemo(
    () =>
      Number(claimedHuntRecords.reduce((acc, item) => acc + item.totalPayout, 0).toFixed(2)),
    [claimedHuntRecords]
  );

  const filtered = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return allRecords.filter((r) => {
      if (tokenFilter === 'HUNTS' && r.kind !== 'hunt') return false;
      if (tokenFilter === 'SLASHED' && r.status !== 'slashed') return false;
      if (tokenFilter === 'STAKES' && r.status !== 'locked' && r.status !== 'verified') {
        return false;
      }
      if ((tokenFilter === 'USDC' || tokenFilter === 'SKR') && r.token !== tokenFilter) {
        return false;
      }
      if (q) {
        const hay = `${r.habitTitle} ${r.subtitle} ${r.landmarkName || ''} ${r.txSignature} ${r.token}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRecords, tokenFilter, historySearch]);

  const totalEarned = useMemo(
    () =>
      filtered
        .filter((item) => item.status === 'claimed')
        .reduce((acc, item) => acc + item.totalPayout, 0),
    [filtered]
  );

  const totalBonus = useMemo(
    () =>
      filtered
        .filter((item) => item.status === 'claimed' && item.kind !== 'hunt')
        .reduce((acc, item) => acc + item.bonus, 0),
    [filtered]
  );

  const totalSlashed = useMemo(
    () =>
      filtered
        .filter((item) => item.status === 'slashed')
        .reduce((acc, item) => acc + item.principal, 0),
    [filtered]
  );

  // Realistic, real-synced user completion rate across habits + claimed AR hunts
  const userRealActivityStats = useMemo(() => {
    const settledHabitRecords = allRecords.filter(
      (r) => r.kind === 'habit' && (r.status === 'claimed' || r.status === 'verified' || r.status === 'slashed')
    );
    const passedHabits = settledHabitRecords.filter((r) => r.status !== 'slashed').length;
    const slashedHabits = settledHabitRecords.filter((r) => r.status === 'slashed').length;
    const localClaimedHunts = claimedHuntRecords.length;

    const serverCheckins = statsSummary?.userStats.checkinsCompleted ?? 0;
    const serverHuntsClaimed = statsSummary?.userStats.huntsClaimed ?? 0;
    const serverHuntsJoined = statsSummary?.userStats.huntsJoined ?? 0;

    const totalPassed = Math.max(passedHabits, serverCheckins) + Math.max(localClaimedHunts, serverHuntsClaimed);
    const totalExpected = Math.max(
      totalPassed + slashedHabits,
      Math.max(settledHabitRecords.length, serverCheckins) + Math.max(localClaimedHunts, serverHuntsJoined)
    );

    const completionPct =
      totalExpected > 0 ? Math.max(0, Math.min(100, Math.round((totalPassed / totalExpected) * 100))) : 0;

    const totalEarnedAll = Number(
      allRecords
        .filter((r) => r.status === 'claimed')
        .reduce((acc, r) => acc + r.totalPayout, 0)
        .toFixed(2)
    );

    return {
      completionPct,
      checkinsCompleted: Math.max(passedHabits, serverCheckins),
      huntsClaimed: Math.max(localClaimedHunts, serverHuntsClaimed),
      huntsJoined: Math.max(localClaimedHunts, serverHuntsJoined),
      slashedCount: slashedHabits,
      totalEarnedAll,
      effectiveStreak: Math.max(streakDays, statsSummary?.userStats.streakDays ?? 0),
    };
  }, [allRecords, claimedHuntRecords.length, statsSummary, streakDays]);

  // Real-synced contestant list merged with the user's live local + server stats and re-ranked
  const rankedContestants = useMemo<ContestantStatsRecord[]>(() => {
    const serverList = statsSummary?.contestants ?? [];
    const cloned = serverList.map((c) => ({ ...c }));

    const currentWallet = walletPubkey || 'current-user';
    const existingIdx = cloned.findIndex(
      (c) => c.isCurrentUser || (walletPubkey && c.walletPubkey === walletPubkey)
    );

    const mergedUserRecord: ContestantStatsRecord =
      existingIdx >= 0
        ? {
            ...cloned[existingIdx],
            isCurrentUser: true,
            displayName: 'You',
            initials: 'YO',
            completionPct:
              userRealActivityStats.checkinsCompleted + userRealActivityStats.huntsClaimed > 0 ||
              userRealActivityStats.slashedCount > 0
                ? userRealActivityStats.completionPct
                : cloned[existingIdx].completionPct,
            checkinsCompleted: Math.max(
              cloned[existingIdx].checkinsCompleted,
              userRealActivityStats.checkinsCompleted
            ),
            huntsClaimed: Math.max(
              cloned[existingIdx].huntsClaimed,
              userRealActivityStats.huntsClaimed
            ),
            huntsJoined: Math.max(
              cloned[existingIdx].huntsJoined,
              userRealActivityStats.huntsJoined
            ),
            streakDays: Math.max(
              cloned[existingIdx].streakDays,
              userRealActivityStats.effectiveStreak
            ),
            totalEarnedUsd: Math.max(
              cloned[existingIdx].totalEarnedUsd,
              userRealActivityStats.totalEarnedAll
            ),
            slashedCount: Math.max(
              cloned[existingIdx].slashedCount,
              userRealActivityStats.slashedCount
            ),
          }
        : {
            walletPubkey: currentWallet,
            displayName: 'You',
            initials: 'YO',
            isCurrentUser: true,
            rank: 1,
            completionPct: userRealActivityStats.completionPct,
            checkinsCompleted: userRealActivityStats.checkinsCompleted,
            expectedCheckins: Math.max(
              userRealActivityStats.checkinsCompleted + userRealActivityStats.slashedCount,
              stakes.length
            ),
            huntsClaimed: userRealActivityStats.huntsClaimed,
            huntsJoined: userRealActivityStats.huntsJoined,
            activePools: stakes.filter((s) => s.status === 'locked' || s.status === 'verified').length,
            streakDays: userRealActivityStats.effectiveStreak,
            totalEarnedUsd: userRealActivityStats.totalEarnedAll,
            slashedCount: userRealActivityStats.slashedCount,
            lastActiveAt: allRecords[0]?.dateIso || null,
          };

    if (existingIdx >= 0) {
      cloned[existingIdx] = mergedUserRecord;
    } else {
      cloned.push(mergedUserRecord);
    }

    return cloned
      .sort((a, b) => {
        if (b.completionPct !== a.completionPct) return b.completionPct - a.completionPct;
        const bCompleted = b.checkinsCompleted + b.huntsClaimed;
        const aCompleted = a.checkinsCompleted + a.huntsClaimed;
        if (bCompleted !== aCompleted) return bCompleted - aCompleted;
        if (b.totalEarnedUsd !== a.totalEarnedUsd) return b.totalEarnedUsd - a.totalEarnedUsd;
        if (b.streakDays !== a.streakDays) return b.streakDays - a.streakDays;
        if (a.isCurrentUser && !b.isCurrentUser) return -1;
        if (!a.isCurrentUser && b.isCurrentUser) return 1;
        return a.displayName.localeCompare(b.displayName);
      })
      .map((c, idx) => ({ ...c, rank: idx + 1 }));
  }, [statsSummary, walletPubkey, userRealActivityStats, stakes, allRecords]);

  const currentUserEntry = useMemo(
    () => rankedContestants.find((c) => c.isCurrentUser) || null,
    [rankedContestants]
  );

  const filteredContestants = useMemo(() => {
    const q = contestantSearch.trim().toLowerCase();
    if (!q) return rankedContestants;
    return rankedContestants.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.walletPubkey.toLowerCase().includes(q) ||
        `#${c.rank}`.includes(q) ||
        (c.isCurrentUser && ('you'.includes(q) || 'me'.includes(q)))
    );
  }, [rankedContestants, contestantSearch]);

  const selectedContestant = useMemo(() => {
    if (selectedContestantWallet) {
      const found = rankedContestants.find((c) => c.walletPubkey === selectedContestantWallet);
      if (found) return found;
    }
    return currentUserEntry || rankedContestants[0] || null;
  }, [rankedContestants, selectedContestantWallet, currentUserEntry]);

  const communityAvgPct = useMemo(() => {
    const active = rankedContestants.filter(
      (c) => c.checkinsCompleted > 0 || c.huntsClaimed > 0 || c.activePools > 0 || c.huntsJoined > 0
    );
    if (active.length === 0) return 0;
    return Math.round(active.reduce((acc, c) => acc + c.completionPct, 0) / active.length);
  }, [rankedContestants]);

  // Real-synced 28-Day Activity Heatmap (verified habit check-ins + claimed AR hunts by real date)
  const heatmapCells = useMemo<Array<{ level: number; count: number; dateLabel: string }>>(() => {
    const dayMs = 86_400_000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTs = todayStart.getTime();
    return Array.from({ length: 28 }, (_, idx) => {
      const daysAgo = 27 - idx;
      const cellStart = todayTs - daysAgo * dayMs;
      const cellEnd = cellStart + dayMs;
      const verifiedCount = allRecords.filter((r) => {
        if (r.status === 'slashed' || r.status === 'locked') return false;
        const ts = Date.parse(r.dateIso);
        return ts >= cellStart && ts < cellEnd;
      }).length;
      const dateLabel = new Date(cellStart).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      const level = verifiedCount >= 3 ? 3 : verifiedCount === 2 ? 2 : verifiedCount === 1 ? 1 : 0;
      return { level, count: verifiedCount, dateLabel };
    });
  }, [allRecords]);

  // Real-synced Category Status (includes Habit categories + AR GeoDrop Hunts)
  const categoryBreakdown = useMemo(() => {
    const counts = new Map<string, { label: string; total: number; passed: number }>();

    for (const r of allRecords) {
      if (r.kind === 'hunt') {
        const key = 'AR GeoDrop Hunts';
        const entry = counts.get(key) || { label: key, total: 0, passed: 0 };
        entry.total += 1;
        if (r.status === 'claimed') entry.passed += 1;
        counts.set(key, entry);
      } else {
        const entry = counts.get(r.habitTitle) || { label: r.habitTitle, total: 0, passed: 0 };
        entry.total += 1;
        if (r.status !== 'slashed') entry.passed += 1;
        counts.set(r.habitTitle, entry);
      }
    }

    if (counts.size === 0) return [];
    const palette = ['#16A34A', '#F16A2E', '#8B5CF6', '#0EA5E9', '#D97706'];
    return Array.from(counts.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((item, idx) => ({
        label: item.label,
        total: item.total,
        passed: item.passed,
        pct: Math.round((item.passed / Math.max(1, item.total)) * 100),
        color: palette[idx % palette.length],
      }));
  }, [allRecords]);

  const copyValue = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const scrollGraphBy = (delta: number) => {
    chartScrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const jumpToMyBar = () => {
    setContestantSearch('');
    if (currentUserEntry) {
      setSelectedContestantWallet(currentUserEntry.walletPubkey);
    }
    window.setTimeout(() => {
      userBarRef.current?.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }, 40);
  };

  const loadTransactionDetails = useCallback(async (signature: string) => {
    setTxLoading(true);
    setTxError(null);
    try {
      const details = await fetchOnChainTransactionDetails(signature);
      setTxDetails(details);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Unable to fetch on-chain status.');
      setTxDetails(null);
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedRecord) {
      setTxDetails(null);
      setTxError(null);
      setTxLoading(false);
      return;
    }
    void loadTransactionDetails(selectedRecord.txSignature);
  }, [selectedRecord, loadTransactionDetails]);

  const renderStatusMeta = (record: UnifiedHistoryRecord) => {
    if (record.kind === 'hunt') {
      return {
        label: `AR Hunt Claimed · ${record.token}`,
        color: 'text-[#16A34A]',
        bg: 'bg-[#ECFDF5] text-[#16A34A]',
      };
    }
    if (record.status === 'slashed') {
      return { label: 'Slashed Penalty', color: 'text-[#DC2626]', bg: 'bg-[#FEF2F2] text-[#DC2626]' };
    }
    if (record.status === 'locked') {
      return {
        label: `Locked · ${record.token}`,
        color: 'text-[#F16A2E]',
        bg: 'bg-[#FFF3EC] text-[#F16A2E]',
      };
    }
    if (record.status === 'verified') {
      return {
        label: `Verified · ${record.token}`,
        color: 'text-[#0284C7]',
        bg: 'bg-[#E0F2FE] text-[#0284C7]',
      };
    }
    return {
      label: `Redeemed · ${record.token}`,
      color: 'text-[#16A34A]',
      bg: 'bg-[#ECFDF5] text-[#16A34A]',
    };
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <MascotDisplay
            variant="medallion"
            size="md"
            floating
            alt="Actake Stats Mascot"
          />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#F16A2E]">Live Statistics &amp; Ledger</div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight">
              Stats &amp; History
            </h1>
            <p className="text-xs sm:text-sm text-[#6B6663] mt-0.5">
              Real-synced contestant rankings, claimed AR GeoDrops, and Solana Devnet receipts.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            disabled={statsLoading}
            onClick={() => void fetchStatsSummary()}
            className="min-h-[40px] px-3.5 py-2 rounded-full bg-white border border-[#EFE2D9] hover:border-[#F16A2E] text-xs font-bold text-[#111114] inline-flex items-center gap-1.5 shadow-[0_4px_14px_rgba(24,20,18,0.04)] transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#F16A2E] ${statsLoading ? 'animate-spin' : ''}`} />
            <span>{statsLoading ? 'Syncing...' : 'Sync Stats'}</span>
          </button>

          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#111114] bg-white border border-[#EFE2D9] px-4 py-2.5 rounded-full shadow-[0_4px_14px_rgba(24,20,18,0.04)]">
            <Flame className="w-4 h-4 text-[#F16A2E]" />
            <span className="tabular-nums">
              {userRealActivityStats.effectiveStreak}-Day Streak
            </span>
          </div>
        </div>
      </div>

      {statsError && (
        <div className="rounded-2xl bg-[#FFF3EC] border border-[#F6C8B0] px-4 py-3 flex items-center justify-between gap-3 text-xs text-[#9A3412]">
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#F16A2E]" />
            <span>Showing local records · {statsError}</span>
          </span>
          <button
            type="button"
            onClick={() => void fetchStatsSummary()}
            className="font-bold underline hover:text-[#111114] shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* 4 Real-Synced KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 tabular-nums">
        <div className="actake-card p-4 flex items-center gap-3.5">
          <span className="w-11 h-11 rounded-2xl bg-[#FFF3EC] text-[#F16A2E] flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#6B6663]">Total Earned</div>
            <div className="font-display text-2xl font-extrabold text-[#111114]">
              ${totalEarned.toFixed(2)}
            </div>
            <div className="text-[11px] text-[#877F7A]">
              Across {filtered.length} synced record{filtered.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        <div className="actake-card p-4 flex items-center gap-3.5">
          <span className="w-11 h-11 rounded-2xl bg-[#ECFDF5] text-[#16A34A] flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#6B6663]">AR Hunts Claimed</div>
            <div className="font-display text-2xl font-extrabold text-[#111114]">
              {userRealActivityStats.huntsClaimed}
            </div>
            <div className="text-[11px] text-[#16A34A] font-semibold">
              {totalHuntRewards > 0 ? `+$${totalHuntRewards.toFixed(2)} hunt rewards` : 'Explore AR GeoDrops'}
            </div>
          </div>
        </div>

        <div className="actake-card p-4 flex items-center gap-3.5">
          <span className="w-11 h-11 rounded-2xl bg-[#FFF7ED] text-[#EA580C] flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#6B6663]">Slashed Split Earned</div>
            <div className="font-display text-2xl font-extrabold text-[#16A34A]">
              +${totalBonus.toFixed(2)}
            </div>
            <div className="text-[11px] text-[#877F7A]">
              {totalSlashed > 0 ? `-$${totalSlashed.toFixed(2)} penalized` : 'Zero penalties'}
            </div>
          </div>
        </div>

        <div className="actake-card p-4 flex items-center gap-3.5">
          <span className="w-11 h-11 rounded-2xl bg-[#111114] text-white flex items-center justify-center shrink-0">
            <Award className="w-5 h-5 text-[#F16A2E]" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#6B6663]">Completion Rate</div>
            <div className="font-display text-2xl font-extrabold text-[#111114]">
              {userRealActivityStats.completionPct}%
            </div>
            <div className="text-[11px] text-[#877F7A]">
              {currentUserEntry
                ? `Rank #${currentUserEntry.rank} of ${rankedContestants.length}`
                : 'Habits & AR hunts'}
            </div>
          </div>
        </div>
      </div>

      {/* Top Analytics Split: Scrollable + Searchable Contestant Graph & Heatmap/Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 actake-card p-5 sm:p-6 flex flex-col justify-between gap-4 min-w-0">
          {/* Graph Header + Scroll / Jump-to-Me Controls */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#6B6663] inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#F16A2E]" />
                <span>Live Contestant Leaderboard</span>
              </div>
              <div className="flex items-baseline gap-2.5 mt-0.5 flex-wrap">
                <span className="font-display text-3xl sm:text-4xl font-extrabold text-[#111114] tabular-nums">
                  {userRealActivityStats.completionPct}%
                </span>
                <span className="text-xs font-semibold text-[#6B6663] tabular-nums">
                  Your score · Community avg {communityAvgPct}%
                </span>
              </div>
              <div className="text-xs text-[#877F7A] mt-0.5 tabular-nums">
                {rankedContestants.length} synced contestant{rankedContestants.length === 1 ? '' : 's'} across pools &amp; AR hunts · Scroll or search to inspect anyone
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {currentUserEntry && (
                <button
                  type="button"
                  onClick={jumpToMyBar}
                  className="min-h-[36px] px-3 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-[11px] font-bold transition-colors whitespace-nowrap"
                >
                  Jump to Me (#{currentUserEntry.rank})
                </button>
              )}
              <button
                type="button"
                aria-label="Scroll contestants left"
                onClick={() => scrollGraphBy(-240)}
                className="w-9 h-9 rounded-full bg-[#FFF7F2] border border-[#EFE2D9] hover:border-[#F16A2E] text-[#111114] flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Scroll contestants right"
                onClick={() => scrollGraphBy(240)}
                className="w-9 h-9 rounded-full bg-[#FFF7F2] border border-[#EFE2D9] hover:border-[#F16A2E] text-[#111114] flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search Bar for Contestants */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#877F7A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={contestantSearch}
                onChange={(e) => setContestantSearch(e.target.value)}
                placeholder="Search contestants by name, wallet, or rank (#1)..."
                className="w-full min-h-[42px] pl-10 pr-9 rounded-full bg-[#FAF7F3] border border-[#EFE2D9] focus:border-[#F16A2E] focus:bg-white focus:outline-none text-xs sm:text-sm text-[#111114] placeholder:text-[#877F7A] transition-colors"
              />
              {contestantSearch && (
                <button
                  type="button"
                  aria-label="Clear contestant search"
                  onClick={() => setContestantSearch('')}
                  className="w-7 h-7 rounded-full hover:bg-[#EFE2D9]/60 text-[#6B6663] flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="text-[11px] font-semibold text-[#877F7A] tabular-nums whitespace-nowrap px-1">
              Showing {filteredContestants.length} of {rankedContestants.length}
            </div>
          </div>

          {/* Horizontally Scrollable Contestant Bar Graph (scales to any number of users) */}
          {statsLoading && rankedContestants.length === 0 ? (
            <div className="h-56 flex items-center justify-center gap-2 text-xs text-[#6B6663]">
              <Loader2 className="w-4 h-4 animate-spin text-[#F16A2E]" />
              <span>Syncing real contestants...</span>
            </div>
          ) : filteredContestants.length === 0 ? (
            <div className="h-56 rounded-2xl bg-[#FAF7F3] border border-[#EFE2D9] flex flex-col items-center justify-center gap-2 px-4 text-center">
              <Users className="w-5 h-5 text-[#F16A2E]" />
              <div className="text-sm font-bold text-[#111114]">No matching contestants</div>
              <p className="text-xs text-[#6B6663]">
                No contestant matched &ldquo;{contestantSearch}&rdquo;. Try another name or wallet prefix.
              </p>
              <button
                type="button"
                onClick={() => setContestantSearch('')}
                className="mt-1 px-3.5 py-1.5 rounded-full bg-[#111114] text-white text-xs font-bold"
              >
                Show All Contestants
              </button>
            </div>
          ) : (
            <div
              ref={chartScrollRef}
              className="flex items-end gap-3 overflow-x-auto pb-2 pt-2 h-60 snap-x snap-mandatory scroll-smooth"
              style={{ scrollbarWidth: 'thin' }}
            >
              {filteredContestants.map((contestant) => {
                const isYou = contestant.isCurrentUser;
                const isSelected = selectedContestant?.walletPubkey === contestant.walletPubkey;
                const barFillHeight = Math.max(32, Math.min(100, contestant.completionPct));
                return (
                  <button
                    key={contestant.walletPubkey}
                    ref={isYou ? userBarRef : undefined}
                    type="button"
                    onClick={() => setSelectedContestantWallet(contestant.walletPubkey)}
                    className={`w-[68px] shrink-0 snap-start flex flex-col items-center h-full gap-1.5 group focus:outline-none`}
                  >
                    <span
                      className={`text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded-full ${
                        isYou
                          ? 'bg-[#111114] text-white'
                          : isSelected
                            ? 'bg-[#F16A2E] text-white'
                            : 'text-[#877F7A]'
                      }`}
                    >
                      #{contestant.rank}
                    </span>

                    <div
                      className={`relative w-[54px] flex-1 rounded-full bg-[#FFF1E8] overflow-hidden flex items-end p-1 transition-all ${
                        isSelected
                          ? 'ring-2 ring-[#F16A2E] ring-offset-2 ring-offset-white'
                          : 'group-hover:ring-2 group-hover:ring-[#F16A2E]/40'
                      }`}
                    >
                      <div
                        className={`w-full rounded-full flex flex-col items-center justify-between py-2 transition-all duration-300 ${
                          isYou
                            ? 'bg-gradient-to-t from-[#111114] to-[#2B2B33] text-white'
                            : 'bg-gradient-to-t from-[#F16A2E] to-[#FF915C] text-white'
                        }`}
                        style={{ height: `${barFillHeight}%` }}
                      >
                        <span className="text-[10px] font-mono font-bold tabular-nums leading-none">
                          {contestant.completionPct}%
                        </span>
                        <span
                          className={`w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center border-2 ${
                            isYou
                              ? 'bg-[#F16A2E] text-white border-white'
                              : 'bg-white text-[#111114] border-white/80'
                          }`}
                        >
                          {contestant.initials}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-semibold truncate w-full text-center ${
                        isYou || isSelected ? 'text-[#111114] font-bold' : 'text-[#6B6663]'
                      }`}
                      title={`${contestant.displayName} (${contestant.walletPubkey})`}
                    >
                      {isYou ? 'You' : contestant.displayName}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected Contestant Live Breakdown Strip */}
          {selectedContestant && (
            <div className="rounded-2xl bg-[#FAF7F3] border border-[#EFE2D9] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-9 h-9 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${
                    selectedContestant.isCurrentUser
                      ? 'bg-[#111114] text-white'
                      : 'bg-[#F16A2E] text-white'
                  }`}
                >
                  {selectedContestant.initials}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display text-sm font-extrabold text-[#111114] truncate">
                      {selectedContestant.isCurrentUser ? 'You' : selectedContestant.displayName}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-[#F16A2E]">
                      Rank #{selectedContestant.rank}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[#877F7A] truncate">
                    {shortenWallet(selectedContestant.walletPubkey)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center tabular-nums shrink-0">
                <div className="rounded-xl bg-white border border-[#EFE2D9] px-2.5 py-1.5">
                  <div className="text-[10px] text-[#877F7A]">Rate</div>
                  <div className="font-mono text-xs font-extrabold text-[#111114]">
                    {selectedContestant.completionPct}%
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-[#EFE2D9] px-2.5 py-1.5">
                  <div className="text-[10px] text-[#877F7A]">Proofs</div>
                  <div className="font-mono text-xs font-extrabold text-[#111114]">
                    {selectedContestant.checkinsCompleted}
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-[#EFE2D9] px-2.5 py-1.5">
                  <div className="text-[10px] text-[#877F7A]">Hunts</div>
                  <div className="font-mono text-xs font-extrabold text-[#16A34A]">
                    {selectedContestant.huntsClaimed}
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-[#EFE2D9] px-2.5 py-1.5">
                  <div className="text-[10px] text-[#877F7A]">Streak</div>
                  <div className="font-mono text-xs font-extrabold text-[#F16A2E]">
                    {selectedContestant.streakDays}d
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: 28-Day Real Activity Heatmap + Category Status */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <div className="actake-card p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-extrabold text-[#111114]">
                  28-Day Activity Heatmap
                </h2>
                <p className="text-xs text-[#6B6663]">
                  Verified habit proofs &amp; claimed AR GeoDrops
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-[#F16A2E] tabular-nums">
                4 wks
              </span>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {heatmapCells.map((cell, i) => {
                const bg =
                  cell.level === 3
                    ? 'bg-[#F16A2E]'
                    : cell.level === 2
                      ? 'bg-[#F9A882]'
                      : cell.level === 1
                        ? 'bg-[#FFE1D1]'
                        : 'bg-[#F5EFEA]';
                return (
                  <div
                    key={i}
                    title={`${cell.dateLabel}: ${cell.count > 0 ? `${cell.count} verified` : 'No activity'}`}
                    className={`aspect-square rounded-lg ${bg}`}
                  />
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#877F7A]">
              <span>4 weeks ago</span>
              <span className="inline-flex items-center gap-1.5">
                <span>Less</span>
                <span className="w-2.5 h-2.5 rounded-xs bg-[#F5EFEA]" />
                <span className="w-2.5 h-2.5 rounded-xs bg-[#FFE1D1]" />
                <span className="w-2.5 h-2.5 rounded-xs bg-[#F9A882]" />
                <span className="w-2.5 h-2.5 rounded-xs bg-[#F16A2E]" />
                <span>More</span>
              </span>
            </div>
          </div>

          <div className="actake-card p-5 space-y-3.5 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-extrabold text-[#111114]">
                Category Status
              </h2>
              <TrendingUp className="w-4 h-4 text-[#F16A2E]" />
            </div>
            {categoryBreakdown.length === 0 ? (
              <p className="text-xs text-[#6B6663] leading-relaxed">
                Complete a verified habit check-in or claim an AR GeoDrop hunt to populate your category performance.
              </p>
            ) : (
              <div className="space-y-3">
                {categoryBreakdown.map((cat) => (
                  <div key={cat.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-semibold text-[#111114] truncate">
                        {cat.label}
                      </span>
                      <span className="font-mono font-bold text-[#6B6663] tabular-nums shrink-0">
                        {cat.passed}/{cat.total} · {cat.pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#F7ECE6] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${cat.pct}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Transaction & Claimed Hunt History Section */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-extrabold text-[#111114]">
                Transaction &amp; Hunt History
              </h2>
              <p className="text-xs text-[#6B6663]">
                All habit stakes, payouts, and claimed AR GeoDrops synced with Solana Devnet
              </p>
            </div>

            <div className="inline-flex items-center p-1 rounded-full bg-white border border-[#EFE2D9] shadow-[0_4px_14px_rgba(24,20,18,0.04)] self-start overflow-x-auto max-w-full">
              {(['ALL', 'HUNTS', 'USDC', 'SKR', 'STAKES', 'SLASHED'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setTokenFilter(filter)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                    tokenFilter === filter
                      ? 'bg-[#111114] text-white'
                      : 'text-[#6B6663] hover:text-[#111114]'
                  }`}
                >
                  {filter === 'ALL'
                    ? 'All'
                    : filter === 'HUNTS'
                      ? `AR Hunts${claimedHuntRecords.length > 0 ? ` (${claimedHuntRecords.length})` : ''}`
                      : filter === 'STAKES'
                        ? 'Stakes'
                        : filter === 'SLASHED'
                          ? 'Penalties'
                          : filter}
                </button>
              ))}
            </div>
          </div>

          {/* Quick History Search */}
          {allRecords.length > 0 && (
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-[#877F7A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search history by habit, hunt, landmark, or tx..."
                className="w-full min-h-[42px] pl-10 pr-9 rounded-full bg-white border border-[#EFE2D9] focus:border-[#F16A2E] focus:outline-none text-xs sm:text-sm text-[#111114] placeholder:text-[#877F7A] transition-colors"
              />
              {historySearch && (
                <button
                  type="button"
                  aria-label="Clear history search"
                  onClick={() => setHistorySearch('')}
                  className="w-7 h-7 rounded-full hover:bg-[#EFE2D9]/60 text-[#6B6663] flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={tokenFilter === 'HUNTS' ? <Compass className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
            title={
              historySearch
                ? 'No Matching History Records'
                : tokenFilter === 'HUNTS'
                  ? 'No Claimed AR Hunts Yet'
                  : tokenFilter === 'ALL'
                    ? 'No Transactions or Hunts Yet'
                    : `No ${
                        tokenFilter === 'SLASHED'
                          ? 'Penalty'
                          : tokenFilter === 'STAKES'
                            ? 'Active Stake'
                            : tokenFilter
                      } Transactions`
            }
            description={
              historySearch
                ? `Nothing matched "${historySearch}". Clear the search to view your synced ledger.`
                : tokenFilter === 'HUNTS'
                  ? 'Unlock a GeoDrop chest on the Hunts map and your claimed reward receipt will automatically sync here.'
                  : tokenFilter === 'ALL'
                    ? 'Lock a habit stake, verify a live check-in, or claim an AR GeoDrop to record a synced Solana Devnet receipt here.'
                    : 'No receipts match this filter yet. Switch back to All to inspect your full ledger.'
            }
            ctaLabel={tokenFilter !== 'ALL' || historySearch ? 'Show All History' : undefined}
            onCta={
              tokenFilter !== 'ALL' || historySearch
                ? () => {
                    setTokenFilter('ALL');
                    setHistorySearch('');
                  }
                : undefined
            }
          />
        ) : (
          <>
            {/* Responsive Mobile Card List */}
            <div className="md:hidden space-y-3">
              {filtered.map((entry) => {
                const isHunt = entry.kind === 'hunt';
                const isSlashed = entry.status === 'slashed';
                const isLocked = entry.status === 'locked' || entry.status === 'verified';
                const statusMeta = renderStatusMeta(entry);
                const dateFmt = new Date(entry.dateIso).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedRecord(entry)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedRecord(entry);
                      }
                    }}
                    className="actake-card p-4 space-y-3 hover:border-[#F16A2E] transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${statusMeta.bg}`}
                        >
                          {isHunt ? (
                            <MapPin className="w-4 h-4" />
                          ) : isSlashed ? (
                            <XCircle className="w-4 h-4" />
                          ) : isLocked ? (
                            <Lock className="w-4 h-4" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="font-display text-sm font-bold text-[#111114] truncate">
                            {entry.habitTitle}
                          </div>
                          <div className="text-xs text-[#6B6663] truncate">{entry.subtitle}</div>
                          <div className="text-[11px] text-[#877F7A] mt-0.5 tabular-nums">
                            {dateFmt} · {statusMeta.label}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 tabular-nums">
                        <div
                          className={`font-mono text-sm font-extrabold ${
                            isSlashed
                              ? 'text-[#DC2626]'
                              : isLocked
                                ? 'text-[#111114]'
                                : 'text-[#16A34A]'
                          }`}
                        >
                          {isSlashed
                            ? `-$${entry.principal.toFixed(2)}`
                            : isLocked
                              ? `$${entry.principal.toFixed(2)}`
                              : `+$${entry.totalPayout.toFixed(2)}`}
                        </div>
                        <div className="font-mono text-[10px] text-[#877F7A]">
                          {isHunt
                            ? `AR Drop · ${entry.token}`
                            : isLocked
                              ? `Est. +$${entry.bonus.toFixed(2)}`
                              : `$${entry.principal.toFixed(2)} + $${entry.bonus.toFixed(2)}`}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-[#F6EFEA] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyValue(entry.txSignature, `row-${entry.id}`);
                        }}
                        className="min-h-[36px] inline-flex items-center gap-1.5 font-mono text-xs text-[#6B6663] hover:text-[#111114]"
                      >
                        <span>{entry.txSignature.slice(0, 12)}...</span>
                        {copiedKey === `row-${entry.id}` ? (
                          <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <span className="min-h-[36px] inline-flex items-center gap-1 text-xs font-bold text-[#F16A2E]">
                        <span>Details</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Clean Desktop Ledger Table */}
            <div className="hidden md:block actake-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#F4ECE7] text-xs font-semibold text-[#6B6663] bg-[#FFF9F5]">
                      <th className="py-3.5 px-5">Date</th>
                      <th className="py-3.5 px-5">Activity &amp; Proof</th>
                      <th className="py-3.5 px-5">Status</th>
                      <th className="py-3.5 px-5 text-right">Breakdown</th>
                      <th className="py-3.5 px-5 text-right">Net Amount</th>
                      <th className="py-3.5 px-5 text-right">On-Chain Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F6EFEA] text-sm">
                    {filtered.map((entry) => {
                      const isHunt = entry.kind === 'hunt';
                      const isSlashed = entry.status === 'slashed';
                      const isLocked = entry.status === 'locked' || entry.status === 'verified';
                      const statusMeta = renderStatusMeta(entry);
                      const dateFmt = new Date(entry.dateIso).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      });
                      return (
                        <tr
                          key={entry.id}
                          onClick={() => setSelectedRecord(entry)}
                          className="hover:bg-[#FFF9F5] transition-colors cursor-pointer"
                        >
                          <td className="py-4 px-5 text-xs text-[#6B6663] whitespace-nowrap tabular-nums">
                            {dateFmt}
                          </td>
                          <td className="py-4 px-5">
                            <div className="font-bold text-[#111114]">{entry.habitTitle}</div>
                            <div className="text-xs text-[#6B6663] inline-flex items-center gap-1 mt-0.5">
                              {isHunt ? (
                                <MapPin className="w-3.5 h-3.5 text-[#16A34A]" />
                              ) : isSlashed ? (
                                <XCircle className="w-3.5 h-3.5 text-[#DC2626]" />
                              ) : isLocked ? (
                                <Lock className="w-3.5 h-3.5 text-[#F16A2E]" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
                              )}
                              <span>{entry.subtitle}</span>
                            </div>
                          </td>
                          <td className="py-4 px-5 text-xs font-semibold whitespace-nowrap">
                            <span className={statusMeta.color}>{statusMeta.label}</span>
                          </td>
                          <td className="py-4 px-5 text-right font-mono text-xs text-[#6B6663] whitespace-nowrap tabular-nums">
                            {isHunt
                              ? `GeoDrop Reward (${entry.token})`
                              : `$${entry.principal.toFixed(2)} + $${entry.bonus.toFixed(2)}`}
                          </td>
                          <td
                            className={`py-4 px-5 text-right font-mono font-bold whitespace-nowrap tabular-nums ${
                              isSlashed
                                ? 'text-[#DC2626]'
                                : isLocked
                                  ? 'text-[#111114]'
                                  : 'text-[#16A34A]'
                            }`}
                          >
                            {isSlashed
                              ? `-$${entry.principal.toFixed(2)}`
                              : isLocked
                                ? `$${entry.principal.toFixed(2)}`
                                : `+$${entry.totalPayout.toFixed(2)}`}
                          </td>
                          <td className="py-4 px-5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyValue(entry.txSignature, `row-${entry.id}`);
                                }}
                                className="inline-flex items-center gap-1 font-mono text-xs text-[#6B6663] hover:text-[#111114]"
                                title="Copy Solana transaction signature"
                              >
                                <span>{entry.txSignature.slice(0, 10)}...</span>
                                {copiedKey === `row-${entry.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRecord(entry);
                                }}
                                className="px-2.5 py-1 rounded-full bg-[#FFF3EC] hover:bg-[#F16A2E] text-[#F16A2E] hover:text-white text-[11px] font-bold transition-colors"
                              >
                                Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Expanded Real-Time On-Chain Transaction Details Modal */}
      {selectedRecord && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tx-details-modal-title"
          onClick={() => setSelectedRecord(null)}
          className="fixed inset-0 z-50 bg-[#111114]/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-[28px] sm:rounded-[28px] bg-[#FFF8F4] border border-[#EFE2D9] p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#F16A2E]">
                  {selectedRecord.kind === 'hunt' ? (
                    <MapPin className="w-3.5 h-3.5" />
                  ) : (
                    <Receipt className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {selectedRecord.kind === 'hunt'
                      ? 'AR GeoDrop Claim Receipt'
                      : 'Transaction Details'}
                  </span>
                </div>
                <h3
                  id="tx-details-modal-title"
                  className="font-display text-xl font-extrabold text-[#111114] mt-0.5 truncate"
                >
                  {selectedRecord.habitTitle}
                </h3>
                <p className="text-xs text-[#6B6663] mt-0.5">
                  {selectedRecord.subtitle} ·{' '}
                  {new Date(selectedRecord.dateIso).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close transaction details"
                onClick={() => setSelectedRecord(null)}
                className="w-10 h-10 rounded-full bg-white border border-[#EFE2D9] hover:bg-[#FFF0E6] flex items-center justify-center text-[#111114] transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Real-Time On-Chain Confirmation Status Card */}
            <div className="rounded-2xl bg-[#141416] text-white p-4 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#4ADE80]" />
                  <span>Live Solana Devnet Status</span>
                </span>
                <button
                  type="button"
                  disabled={txLoading}
                  onClick={() => void loadTransactionDetails(selectedRecord.txSignature)}
                  className="min-h-[32px] px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/18 text-[11px] font-bold text-white inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
                >
                  <RefreshCw className={`w-3 h-3 text-[#F16A2E] ${txLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {txLoading ? (
                <div className="py-3 flex items-center gap-2.5 text-xs text-white/80">
                  <Loader2 className="w-4 h-4 animate-spin text-[#F16A2E]" />
                  <span>Fetching real-time confirmation status &amp; gas fees from Devnet...</span>
                </div>
              ) : txError ? (
                <div className="rounded-xl bg-red-500/15 border border-red-400/30 p-3 flex items-start gap-2 text-xs text-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-300" />
                  <span>{txError}</span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        txDetails?.err
                          ? 'bg-red-500/20 text-red-300'
                          : txDetails?.confirmationStatus === 'finalized'
                            ? 'bg-[#16A34A]/25 text-[#4ADE80]'
                            : txDetails?.confirmationStatus === 'confirmed'
                              ? 'bg-[#16A34A]/20 text-[#86EFAC]'
                              : txDetails?.confirmationStatus === 'processed'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-white/12 text-white/75'
                      }`}
                    >
                      {txDetails?.err ? (
                        <XCircle className="w-3.5 h-3.5" />
                      ) : txDetails?.foundOnChain ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Info className="w-3.5 h-3.5" />
                      )}
                      <span className="capitalize">
                        {txDetails?.err
                          ? 'On-Chain Error'
                          : txDetails?.foundOnChain
                            ? txDetails.confirmationStatus
                            : 'Synced Receipt · Pending Devnet Index'}
                      </span>
                    </span>

                    {txDetails?.slot !== null && txDetails?.slot !== undefined && (
                      <span className="font-mono text-[11px] text-white/70 tabular-nums">
                        Slot #{txDetails.slot.toLocaleString()}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                    <div className="rounded-xl bg-white/[0.06] px-2.5 py-2">
                      <div className="text-[10px] text-white/55 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Block Time</span>
                      </div>
                      <div className="font-mono font-bold text-[11px] text-white mt-0.5">
                        {txDetails?.blockTime
                          ? new Date(txDetails.blockTime * 1000).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })
                          : '—'}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/[0.06] px-2.5 py-2">
                      <div className="text-[10px] text-white/55">Confirmations</div>
                      <div className="font-mono font-bold text-[11px] text-white mt-0.5">
                        {txDetails?.confirmationStatus === 'finalized'
                          ? 'Max (Final)'
                          : txDetails?.confirmations !== null && txDetails?.confirmations !== undefined
                            ? `${txDetails.confirmations}`
                            : txDetails?.foundOnChain
                              ? 'Confirmed'
                              : '—'}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/[0.06] px-2.5 py-2">
                      <div className="text-[10px] text-white/55 inline-flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        <span>Compute</span>
                      </div>
                      <div className="font-mono font-bold text-[11px] text-white mt-0.5">
                        {txDetails?.computeUnitsConsumed !== null &&
                        txDetails?.computeUnitsConsumed !== undefined
                          ? `${txDetails.computeUnitsConsumed.toLocaleString()} CU`
                          : '—'}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Transaction Fee & Payout Breakdown */}
            {(() => {
              const isHunt = selectedRecord.kind === 'hunt';
              const protocolFeeAmount = Number(
                ((selectedRecord.principal * selectedRecord.protocolFeePct) / 100).toFixed(4)
              );
              const networkFeeSol = txDetails?.networkFeeSol ?? null;
              const networkFeeLamports = txDetails?.networkFeeLamports ?? null;
              const networkFeeUsd =
                networkFeeSol !== null && solPriceUsd !== null
                  ? networkFeeSol * solPriceUsd
                  : null;
              const isSlashed = selectedRecord.status === 'slashed';

              return (
                <div className="rounded-2xl bg-white border border-[#EFE2D9] p-4 space-y-2.5 text-xs tabular-nums">
                  <div className="font-display text-sm font-extrabold text-[#111114] pb-1 border-b border-[#F6EFEA]">
                    {isHunt ? 'AR GeoDrop Reward Breakdown' : 'Transaction & Fee Breakdown'}
                  </div>

                  {isHunt ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#6B6663]">AR GeoDrop Chest Reward</span>
                      <span className="font-mono font-bold text-[#16A34A]">
                        +${selectedRecord.totalPayout.toFixed(2)} {selectedRecord.token}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#6B6663]">Staked Principal ({selectedRecord.token})</span>
                        <span className="font-mono font-bold text-[#111114]">
                          ${selectedRecord.principal.toFixed(2)} {selectedRecord.token}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#6B6663]">
                          {isSlashed ? 'Slashed Penalty' : 'Slashed Pool Split Bonus'}
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            isSlashed ? 'text-[#DC2626]' : 'text-[#16A34A]'
                          }`}
                        >
                          {isSlashed
                            ? `-$${selectedRecord.principal.toFixed(2)} ${selectedRecord.token}`
                            : `+$${selectedRecord.bonus.toFixed(2)} ${selectedRecord.token}`}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#6B6663]">
                          Actake Protocol Fee ({selectedRecord.protocolFeePct}%)
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            selectedRecord.protocolFeePct === 0 ? 'text-[#16A34A]' : 'text-[#111114]'
                          }`}
                        >
                          {selectedRecord.protocolFeePct === 0
                            ? '$0.00 (0% SKR Perk)'
                            : `$${protocolFeeAmount.toFixed(2)} ${selectedRecord.token}`}
                        </span>
                      </div>
                    </>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#6B6663]">Solana Network Gas Fee</span>
                    <span className="font-mono font-bold text-[#111114] text-right">
                      {networkFeeSol !== null ? (
                        <>
                          {networkFeeSol.toFixed(6)} SOL
                          {networkFeeLamports !== null && (
                            <span className="text-[10px] font-normal text-[#877F7A] ml-1">
                              ({networkFeeLamports.toLocaleString()} lamports
                              {networkFeeUsd !== null ? ` · ≈ $${networkFeeUsd.toFixed(5)}` : ''})
                            </span>
                          )}
                        </>
                      ) : txLoading ? (
                        'Checking...'
                      ) : (
                        '~0.000005 SOL (base)'
                      )}
                    </span>
                  </div>

                  <div className="pt-2.5 mt-1 border-t border-[#F4ECE7] flex items-center justify-between gap-2">
                    <span className="font-bold text-[#111114]">
                      {isHunt
                        ? 'Net GeoDrop Payout'
                        : selectedRecord.status === 'locked'
                          ? 'Total Locked in Escrow'
                          : selectedRecord.status === 'verified'
                            ? 'Claimable Payout'
                            : isSlashed
                              ? 'Net Slashed'
                              : 'Net Settled Payout'}
                    </span>
                    <span
                      className={`font-mono text-sm font-extrabold ${
                        isSlashed ? 'text-[#DC2626]' : 'text-[#16A34A]'
                      }`}
                    >
                      {isSlashed
                        ? `-$${selectedRecord.principal.toFixed(2)} ${selectedRecord.token}`
                        : selectedRecord.status === 'locked'
                          ? `$${selectedRecord.principal.toFixed(2)} ${selectedRecord.token}`
                          : `+$${selectedRecord.totalPayout.toFixed(2)} ${selectedRecord.token}`}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Signature, Fee Payer & On-Chain Metadata */}
            <div className="rounded-2xl bg-white border border-[#EFE2D9] p-4 space-y-3 text-xs">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-[#6B6663]">
                  Solana Transaction Signature
                </div>
                <button
                  type="button"
                  onClick={() => void copyValue(selectedRecord.txSignature, 'modal-sig')}
                  className="w-full min-h-[40px] rounded-xl bg-[#FFF8F4] border border-[#F2E3DA] hover:border-[#F16A2E] px-3 py-2 flex items-center justify-between gap-2 text-left transition-colors"
                >
                  <span className="font-mono text-[11px] text-[#111114] break-all">
                    {selectedRecord.txSignature}
                  </span>
                  {copiedKey === 'modal-sig' ? (
                    <Check className="w-4 h-4 text-[#16A34A] shrink-0" />
                  ) : (
                    <Copy className="w-4 h-4 text-[#6B6663] shrink-0" />
                  )}
                </button>
              </div>

              {txDetails?.feePayer && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#6B6663]">Fee Payer</span>
                  <a
                    href={buildDevnetExplorerAddressUrl(txDetails.feePayer)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] font-bold text-[#F16A2E] hover:underline inline-flex items-center gap-1"
                  >
                    <span>
                      {txDetails.feePayer.slice(0, 6)}...{txDetails.feePayer.slice(-6)}
                    </span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {selectedRecord.escrowPda && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#6B6663]">Escrow Pool PDA</span>
                  <a
                    href={buildDevnetExplorerAddressUrl(selectedRecord.escrowPda)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] font-bold text-[#111114] hover:text-[#F16A2E] inline-flex items-center gap-1"
                  >
                    <span>
                      {selectedRecord.escrowPda.slice(0, 6)}...{selectedRecord.escrowPda.slice(-6)}
                    </span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {txDetails?.programs && txDetails.programs.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#6B6663]">Programs Invoked</span>
                  <span className="font-mono text-[11px] text-[#111114] truncate max-w-[220px]">
                    {txDetails.programs.join(', ')}
                  </span>
                </div>
              )}

              {txDetails?.memoText && (
                <div className="rounded-xl bg-[#FFF8F4] border border-[#F2E3DA] p-2.5 space-y-0.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#877F7A]">
                    On-Chain Memo Payload
                  </div>
                  <div className="font-mono text-[11px] text-[#111114] break-all">
                    {txDetails.memoText}
                  </div>
                </div>
              )}
            </div>

            {/* Explorer & Hunt Links Footer */}
            <div className="space-y-2.5">
              {selectedRecord.kind === 'hunt' && selectedRecord.huntId && onOpenHunt && (
                <button
                  type="button"
                  onClick={() => {
                    const targetId = selectedRecord.huntId!;
                    setSelectedRecord(null);
                    onOpenHunt(targetId);
                  }}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-full bg-[#F16A2E] hover:bg-[#D95922] text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Compass className="w-4 h-4" />
                  <span>Open Hunt on Map</span>
                </button>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <a
                  href={txDetails?.explorerUrl || selectedRecord.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[46px] px-4 py-2.5 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Solana Explorer</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href={buildDevnetSolscanTxUrl(selectedRecord.txSignature)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[46px] px-4 py-2.5 rounded-full bg-white border border-[#EFE2D9] hover:border-[#F16A2E] text-[#111114] text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Solscan (Devnet)</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#F16A2E]" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
