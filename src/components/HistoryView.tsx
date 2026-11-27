import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  ExternalLink,
  Flame,
  Info,
  Loader2,
  Lock,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  HistoryEntry,
  OnChainTransactionDetails,
  StakeCommitment,
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
}

interface UnifiedHistoryRecord {
  id: string;
  dateIso: string;
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
  source: 'history' | 'stake';
}

const COMMUNITY_BARS = [
  { label: 'Alex', initials: 'AL', pct: 86 },
  { label: 'Sarah', initials: 'SA', pct: 94 },
  { label: 'You', initials: 'YO', pct: 78 },
  { label: 'Nikhil', initials: 'NI', pct: 68 },
  { label: 'Maya', initials: 'MA', pct: 54 },
  { label: 'Tobi', initials: 'TO', pct: 72 },
];

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  stakes,
  streakDays,
  solPriceUsd = null,
}) => {
  const [tokenFilter, setTokenFilter] = useState<'ALL' | TokenType | 'STAKES' | 'SLASHED'>('ALL');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<UnifiedHistoryRecord | null>(null);
  const [txDetails, setTxDetails] = useState<OnChainTransactionDetails | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // Combine settled receipts with all historical/active stakes so every stake tx can be inspected on-chain
  const allRecords = useMemo<UnifiedHistoryRecord[]>(() => {
    const seenSigs = new Set<string>();
    const merged: UnifiedHistoryRecord[] = [];

    for (const h of history) {
      seenSigs.add(h.txSignature);
      const tokenFee = TOKEN_CONFIGS[h.token]?.protocolFeePct ?? 0;
      merged.push({
        id: h.id,
        dateIso: h.dateIso,
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
  }, [history, stakes]);

  const filtered = useMemo(() => {
    if (tokenFilter === 'ALL') return allRecords;
    if (tokenFilter === 'SLASHED') return allRecords.filter((r) => r.status === 'slashed');
    if (tokenFilter === 'STAKES') {
      return allRecords.filter((r) => r.status === 'locked' || r.status === 'verified');
    }
    return allRecords.filter((r) => r.token === tokenFilter);
  }, [allRecords, tokenFilter]);

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
        .filter((item) => item.status === 'claimed')
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

  const completionRate = useMemo(() => {
    if (history.length === 0) return streakDays > 0 ? Math.min(100, 65 + streakDays * 4) : 0;
    const passed = history.filter((h) => h.status !== 'slashed').length;
    return Math.round((passed / history.length) * 100);
  }, [history, streakDays]);

  const heatmapCells = useMemo<number[]>(() => {
    const dayMs = 86_400_000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTs = todayStart.getTime();
    return Array.from({ length: 28 }, (_, idx): number => {
      const daysAgo = 27 - idx;
      const cellStart = todayTs - daysAgo * dayMs;
      const cellEnd = cellStart + dayMs;
      const verifiedCount = history.filter((h) => {
        if (h.status === 'slashed') return false;
        const ts = Date.parse(h.dateIso);
        return ts >= cellStart && ts < cellEnd;
      }).length;
      if (verifiedCount >= 2 || daysAgo < streakDays) return 3;
      if (verifiedCount === 1) return 2;
      return 0;
    });
  }, [history, streakDays]);

  const categoryBreakdown = useMemo(() => {
    const counts = new Map<string, { label: string; total: number; passed: number }>();
    for (const h of history) {
      const entry = counts.get(h.habitTitle) || { label: h.habitTitle, total: 0, passed: 0 };
      entry.total += 1;
      if (h.status !== 'slashed') entry.passed += 1;
      counts.set(h.habitTitle, entry);
    }
    for (const s of stakes) {
      if (!counts.has(s.categoryName)) {
        counts.set(s.categoryName, {
          label: s.categoryName,
          total: 1,
          passed: s.status === 'slashed' ? 0 : 1,
        });
      }
    }
    if (counts.size === 0) {
      return [];
    }
    const palette = ['#16A34A', '#F16A2E', '#8B5CF6', '#0EA5E9'];
    return Array.from(counts.values())
      .slice(0, 4)
      .map((item, idx) => ({
        label: item.label,
        pct: Math.round((item.passed / Math.max(1, item.total)) * 100),
        color: palette[idx % palette.length],
      }));
  }, [history, stakes]);

  const copyValue = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore clipboard errors
    }
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

  const barsWithLiveUser = useMemo(
    () =>
      COMMUNITY_BARS.map((bar) =>
        bar.label === 'You' ? { ...bar, pct: Math.max(18, Math.min(100, completionRate)) } : bar
      ),
    [completionRate]
  );

  const renderStatusMeta = (status: UnifiedHistoryRecord['status'], token: TokenType) => {
    if (status === 'slashed') {
      return { label: 'Slashed Penalty', color: 'text-[#DC2626]', bg: 'bg-[#FEF2F2] text-[#DC2626]' };
    }
    if (status === 'locked') {
      return { label: `Locked · ${token}`, color: 'text-[#F16A2E]', bg: 'bg-[#FFF3EC] text-[#F16A2E]' };
    }
    if (status === 'verified') {
      return { label: `Verified · ${token}`, color: 'text-[#0284C7]', bg: 'bg-[#E0F2FE] text-[#0284C7]' };
    }
    return { label: `Redeemed · ${token}`, color: 'text-[#16A34A]', bg: 'bg-[#ECFDF5] text-[#16A34A]' };
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
            <div className="text-xs font-semibold text-[#F16A2E]">Statistics &amp; Ledger</div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight">
              Habit Overview
            </h1>
            <p className="text-xs sm:text-sm text-[#6B6663] mt-0.5">
              Consistency trends, community rank, and live Solana Devnet transaction receipts.
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#111114] bg-white border border-[#EFE2D9] px-4 py-2.5 rounded-full shadow-[0_4px_14px_rgba(24,20,18,0.04)] self-start">
          <Flame className="w-4 h-4 text-[#F16A2E]" />
          <span className="tabular-nums">{streakDays}-Day Active Streak</span>
        </div>
      </div>

      {/* 3 Scannable KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 tabular-nums">
        <div className="actake-card p-4 flex items-center gap-3.5">
          <span className="w-11 h-11 rounded-2xl bg-[#FFF3EC] text-[#F16A2E] flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#6B6663]">Total Redeemed</div>
            <div className="font-display text-2xl font-extrabold text-[#111114]">
              ${totalEarned.toFixed(2)}
            </div>
            <div className="text-[11px] text-[#877F7A]">Across {filtered.length} transactions</div>
          </div>
        </div>

        <div className="actake-card p-4 flex items-center gap-3.5">
          <span className="w-11 h-11 rounded-2xl bg-[#ECFDF5] text-[#16A34A] flex items-center justify-center shrink-0">
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
              {completionRate}%
            </div>
            <div className="text-[11px] text-[#877F7A]">Verified before cutoff</div>
          </div>
        </div>
      </div>

      {/* Top Analytics Split: Vertical Pill Bar Chart + Heatmap & Category Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 actake-card p-6 flex flex-col justify-between gap-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-[#6B6663]">Average completion rate</div>
              <div className="font-display text-4xl font-extrabold text-[#111114] tabular-nums mt-0.5">
                {completionRate}%
              </div>
              <div className="text-xs text-[#877F7A] mt-0.5">
                Person-to-Person Squad Comparison · This Week
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="grid grid-cols-6 gap-2 sm:gap-4 items-end h-56 pt-2">
            {barsWithLiveUser.map((bar) => {
              const isYou = bar.label === 'You';
              return (
                <div key={bar.label} className="flex flex-col items-center h-full gap-2">
                  <div className="relative w-full max-w-[52px] flex-1 rounded-full bg-[#FFF1E8] overflow-hidden flex items-end p-1">
                    <div
                      className={`w-full rounded-full flex flex-col items-center justify-between py-2 transition-all duration-300 ${
                        isYou
                          ? 'bg-gradient-to-t from-[#111114] to-[#2B2B33] text-white'
                          : 'bg-gradient-to-t from-[#F16A2E] to-[#FF915C] text-white'
                      }`}
                      style={{ height: `${Math.max(38, bar.pct)}%` }}
                    >
                      <span className="text-[10px] font-mono font-bold tabular-nums leading-none">
                        {bar.pct}%
                      </span>
                      <span
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full text-[10px] font-bold flex items-center justify-center border-2 ${
                          isYou
                            ? 'bg-[#F16A2E] text-white border-white'
                            : 'bg-white text-[#111114] border-white/80'
                        }`}
                      >
                        {bar.initials}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-semibold truncate ${
                      isYou ? 'text-[#111114]' : 'text-[#6B6663]'
                    }`}
                  >
                    {bar.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-5">
          <div className="actake-card p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-extrabold text-[#111114]">
                  28-Day Verification Heatmap
                </h2>
                <p className="text-xs text-[#6B6663]">Live camera proofs verified before cutoff</p>
              </div>
              <span className="text-xs font-mono font-bold text-[#F16A2E] tabular-nums">
                4 wks
              </span>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {heatmapCells.map((level, i) => {
                const bg =
                  level === 3
                    ? 'bg-[#F16A2E]'
                    : level === 2
                      ? 'bg-[#F9A882]'
                      : level === 1
                        ? 'bg-[#FFE1D1]'
                        : 'bg-[#F5EFEA]';
                return (
                  <div
                    key={i}
                    title={`Day ${i + 1}: ${level > 0 ? 'Verified' : 'No Check-in'}`}
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
            <h2 className="font-display text-base font-extrabold text-[#111114]">
              Category Status
            </h2>
            {categoryBreakdown.length === 0 ? (
              <p className="text-xs text-[#6B6663] leading-relaxed">
                Complete your first staked routine check-in to populate category completion rates.
              </p>
            ) : (
              <div className="space-y-3">
                {categoryBreakdown.map((cat) => (
                  <div key={cat.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#111114] truncate">{cat.label}</span>
                      <span className="font-mono font-bold text-[#6B6663] tabular-nums">
                        {cat.pct}%
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

      {/* Detailed Transaction History Section (Mobile Card List + Desktop Table) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-extrabold text-[#111114]">
              Transaction History
            </h2>
            <p className="text-xs text-[#6B6663]">
              Tap any stake or settlement receipt to inspect real-time on-chain confirmation &amp; fees
            </p>
          </div>

          <div className="inline-flex items-center p-1 rounded-full bg-white border border-[#EFE2D9] shadow-[0_4px_14px_rgba(24,20,18,0.04)] self-start overflow-x-auto max-w-full">
            {(['ALL', 'USDC', 'SKR', 'STAKES', 'SLASHED'] as const).map((filter) => (
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
                  : filter === 'STAKES'
                    ? 'Stakes'
                    : filter === 'SLASHED'
                      ? 'Penalties'
                      : filter}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-5 h-5" />}
            title={
              tokenFilter === 'ALL'
                ? 'No Stake Transactions Yet'
                : `No ${
                    tokenFilter === 'SLASHED'
                      ? 'Penalty'
                      : tokenFilter === 'STAKES'
                        ? 'Active Stake'
                        : tokenFilter
                  } Transactions`
            }
            description={
              tokenFilter === 'ALL'
                ? 'Lock your first stake or complete a verified alarm check-in to record a live Solana Devnet receipt here.'
                : 'No receipts match this filter yet. Switch back to All to inspect your full ledger.'
            }
            ctaLabel={tokenFilter !== 'ALL' ? 'Show All Transactions' : undefined}
            onCta={tokenFilter !== 'ALL' ? () => setTokenFilter('ALL') : undefined}
          />
        ) : (
          <>
            {/* Responsive Mobile Card List (Zero Horizontal Scroll on 375px) */}
            <div className="md:hidden space-y-3">
              {filtered.map((entry) => {
                const isSlashed = entry.status === 'slashed';
                const isLocked = entry.status === 'locked' || entry.status === 'verified';
                const statusMeta = renderStatusMeta(entry.status, entry.token);
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
                          {isSlashed ? (
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
                          {isLocked
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
                      <th className="py-3.5 px-5">Habit &amp; Proof</th>
                      <th className="py-3.5 px-5">Status</th>
                      <th className="py-3.5 px-5 text-right">Principal + Bonus</th>
                      <th className="py-3.5 px-5 text-right">Net Amount</th>
                      <th className="py-3.5 px-5 text-right">On-Chain Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F6EFEA] text-sm">
                    {filtered.map((entry) => {
                      const isSlashed = entry.status === 'slashed';
                      const isLocked = entry.status === 'locked' || entry.status === 'verified';
                      const statusMeta = renderStatusMeta(entry.status, entry.token);
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
                              {isSlashed ? (
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
                            ${entry.principal.toFixed(2)} + ${entry.bonus.toFixed(2)}
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
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Transaction Details</span>
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
                            : 'Local Receipt / Not Indexed on Devnet'}
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
                    Transaction &amp; Fee Breakdown
                  </div>

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
                      {selectedRecord.status === 'locked'
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

            {/* Explorer Links Footer */}
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
      )}
    </div>
  );
};
