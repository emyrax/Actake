import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Flame,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { HistoryEntry, StakeCommitment, TokenType } from '../types/actake';

interface HistoryViewProps {
  history: HistoryEntry[];
  stakes: StakeCommitment[];
  streakDays: number;
}

const COMMUNITY_BARS = [
  { label: 'Alex', initials: 'AL', pct: 86 },
  { label: 'Sarah', initials: 'SA', pct: 94 },
  { label: 'You', initials: 'YO', pct: 78 },
  { label: 'Nikhil', initials: 'NI', pct: 68 },
  { label: 'Maya', initials: 'MA', pct: 54 },
  { label: 'Tobi', initials: 'TO', pct: 72 },
];

export const HistoryView: React.FC<HistoryViewProps> = ({ history, stakes, streakDays }) => {
  const [tokenFilter, setTokenFilter] = useState<'ALL' | TokenType | 'SLASHED'>('ALL');
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (tokenFilter === 'ALL') return history;
    if (tokenFilter === 'SLASHED') return history.filter((h) => h.status === 'slashed');
    return history.filter((h) => h.token === tokenFilter);
  }, [history, tokenFilter]);

  const totalEarned = useMemo(
    () =>
      filtered
        .filter((item) => item.status !== 'slashed')
        .reduce((acc, item) => acc + item.totalPayout, 0),
    [filtered]
  );

  const totalBonus = useMemo(
    () =>
      filtered
        .filter((item) => item.status !== 'slashed')
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
    if (history.length === 0) return Math.min(95, Math.max(68, 65 + streakDays * 4));
    const passed = history.filter((h) => h.status !== 'slashed').length;
    return Math.round((passed / history.length) * 100);
  }, [history, streakDays]);

  // 28-day consistency heatmap (deterministic + reflects streakDays)
  const heatmapCells = useMemo(() => {
    return Array.from({ length: 28 }, (_, idx) => {
      const daysAgo = 27 - idx;
      if (daysAgo < streakDays) return 3;
      if (daysAgo % 5 === 0) return 0;
      if (daysAgo % 3 === 0) return 2;
      return 1;
    });
  }, [streakDays]);

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
        counts.set(s.categoryName, { label: s.categoryName, total: 1, passed: 1 });
      }
    }
    if (counts.size === 0) {
      return [
        { label: 'Morning Wakeup', pct: 88, color: '#22C55E' },
        { label: 'Gym & Fitness', pct: 74, color: '#F16A2E' },
        { label: 'Study Session', pct: 62, color: '#8B5CF6' },
      ];
    }
    const palette = ['#22C55E', '#F16A2E', '#8B5CF6', '#0EA5E9'];
    return Array.from(counts.values())
      .slice(0, 4)
      .map((item, idx) => ({
        label: item.label,
        pct: Math.round((item.passed / Math.max(1, item.total)) * 100),
        color: palette[idx % palette.length],
      }));
  }, [history, stakes]);

  const copySig = async (sig: string) => {
    try {
      await navigator.clipboard.writeText(sig);
      setCopiedTx(sig);
      window.setTimeout(() => setCopiedTx(null), 1800);
    } catch {
      // ignore
    }
  };

  const barsWithLiveUser = useMemo(
    () =>
      COMMUNITY_BARS.map((bar) =>
        bar.label === 'You' ? { ...bar, pct: Math.max(25, Math.min(100, completionRate)) } : bar
      ),
    [completionRate]
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#F16A2E]">Statistics &amp; Ledger</div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight">
            Habit Overview
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#6B6663] tabular-nums">
            <span className="font-semibold text-[#111114]">
              ${totalEarned.toFixed(2)} redeemed across {filtered.length} proofs
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-[#16A34A] font-semibold">
              +${totalBonus.toFixed(2)} slashed split earned
            </span>
            {totalSlashed > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#DC2626] font-semibold">
                  -${totalSlashed.toFixed(2)} penalized
                </span>
              </>
            )}
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#111114] bg-white px-4 py-2 rounded-full shadow-[0_4px_14px_rgba(24,20,18,0.05)] self-start">
          <Flame className="w-4 h-4 text-[#F16A2E]" />
          <span className="tabular-nums">{streakDays}-Day Active Streak</span>
        </div>
      </div>

      {/* Top Analytics Split: Vertical Orange Pill Bar Chart (P2P Community Progress) + Heatmap & Category Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Signature Vertical Pill Bar Chart with Avatars (Matching Haptive Statistics Screen) */}
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

          {/* 6 Vertical Capsule Bars with Bottom Avatars */}
          <div className="grid grid-cols-6 gap-2.5 sm:gap-4 items-end h-56 pt-2">
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
                        className={`w-8 h-8 rounded-full text-[10px] font-bold flex items-center justify-center border-2 ${
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

        {/* Right: 28-Day Streak Heatmap + Category Status Analytics */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          {/* Streak Consistency Heatmap (Moved from Today to Stats) */}
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
                    title={`Day ${i + 1}: ${level > 0 ? 'Verified' : 'Rest / Missed'}`}
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

          {/* Category Status Breakdown */}
          <div className="actake-card p-5 space-y-3.5 flex-1">
            <h2 className="font-display text-base font-extrabold text-[#111114]">
              Category Status
            </h2>
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
          </div>
        </div>
      </div>

      {/* Detailed Transaction History Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-extrabold text-[#111114]">
              Transaction History
            </h2>
            <p className="text-xs text-[#6B6663]">
              Chronological ledger of stake redemptions, slashed splits earned, and penalties
            </p>
          </div>

          <div className="inline-flex items-center p-1 rounded-full bg-white shadow-[0_4px_14px_rgba(24,20,18,0.05)] self-start">
            {(['ALL', 'USDC', 'SKR', 'SLASHED'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setTokenFilter(filter)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                  tokenFilter === filter
                    ? 'bg-[#111114] text-white'
                    : 'text-[#6B6663] hover:text-[#111114]'
                }`}
              >
                {filter === 'ALL' ? 'All' : filter === 'SLASHED' ? 'Penalties' : filter}
              </button>
            ))}
          </div>
        </div>

        <div className="actake-card overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#6B6663]">
              No settled transactions in this filter yet. Complete a verified alarm check-in to
              record your first on-chain receipt.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#F4ECE7] text-xs font-semibold text-[#6B6663] bg-[#FFF9F5]">
                    <th className="py-3.5 px-5">Date</th>
                    <th className="py-3.5 px-5">Habit &amp; Proof</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5 text-right">Principal + Bonus</th>
                    <th className="py-3.5 px-5 text-right">Net Settled</th>
                    <th className="py-3.5 px-5 text-right">Solana Signature</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F6EFEA] text-sm">
                  {filtered.map((entry) => {
                    const isSlashed = entry.status === 'slashed';
                    const dateFmt = new Date(entry.dateIso).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });
                    return (
                      <tr key={entry.id} className="hover:bg-[#FFF9F5]/70 transition-colors">
                        <td className="py-4 px-5 text-xs text-[#6B6663] whitespace-nowrap tabular-nums">
                          {dateFmt}
                        </td>
                        <td className="py-4 px-5">
                          <div className="font-bold text-[#111114]">{entry.habitTitle}</div>
                          <div className="text-xs text-[#6B6663] inline-flex items-center gap-1 mt-0.5">
                            {isSlashed ? (
                              <XCircle className="w-3.5 h-3.5 text-[#DC2626]" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
                            )}
                            <span>{entry.verifiedItem}</span>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-xs font-semibold whitespace-nowrap">
                          <span className={isSlashed ? 'text-[#DC2626]' : 'text-[#16A34A]'}>
                            {isSlashed ? 'Slashed Penalty' : `Redeemed · ${entry.token}`}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-right font-mono text-xs text-[#6B6663] whitespace-nowrap tabular-nums">
                          ${entry.principal.toFixed(2)} + ${entry.bonus.toFixed(2)}
                        </td>
                        <td
                          className={`py-4 px-5 text-right font-mono font-bold whitespace-nowrap tabular-nums ${
                            isSlashed ? 'text-[#DC2626]' : 'text-[#16A34A]'
                          }`}
                        >
                          {isSlashed
                            ? `-$${entry.principal.toFixed(2)}`
                            : `+$${entry.totalPayout.toFixed(2)}`}
                        </td>
                        <td className="py-4 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => copySig(entry.txSignature)}
                              className="inline-flex items-center gap-1.5 font-mono text-xs text-[#6B6663] hover:text-[#111114]"
                              title="Copy Solana transaction signature"
                            >
                              <span>{entry.txSignature.slice(0, 12)}...</span>
                              {copiedTx === entry.txSignature ? (
                                <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            {entry.explorerUrl && (
                              <a
                                href={entry.explorerUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="Inspect on Solana Devnet Explorer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#F16A2E] hover:underline"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
