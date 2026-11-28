import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Dumbbell,
  ExternalLink,
  Footprints,
  Globe,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import type { WalletSession } from '../../../types/actake';
import {
  ACCOUNTABILITY_TRACKS,
  type AccountabilityTrackCategory,
  type StepStakePool,
  type StepStakeVisibility,
} from '../types';
import { ensureStepStakeWalletReady } from '../walletClient';
import { CreatePoolModal } from './CreatePoolModal';
import { PoolDashboard } from './PoolDashboard';

interface AccountabilityPoolsWorkspaceProps {
  wallet: WalletSession;
  escrowWallet?: string | null;
  treasuryWallet?: string | null;
  initialPoolId?: string | null;
  initialCreateVisibility?: StepStakeVisibility | null;
  onClearInitialSelection?: () => void;
}

type TrackFilter = 'all' | AccountabilityTrackCategory;
type VisibilityFilter = 'all' | StepStakeVisibility;

interface StepStakeToastState {
  title: string;
  signature: string;
  solscanUrl: string;
  payoutSignature?: string | null;
  payoutSolscanUrl?: string | null;
  payoutDetail?: string;
}

export const AccountabilityPoolsWorkspace: React.FC<AccountabilityPoolsWorkspaceProps> = ({
  wallet,
  escrowWallet = null,
  treasuryWallet = null,
  initialPoolId = null,
  initialCreateVisibility = null,
  onClearInitialSelection,
}) => {
  const [pools, setPools] = useState<StepStakePool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(initialPoolId);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalVisibility, setCreateModalVisibility] = useState<StepStakeVisibility>('solo');
  const [toast, setToast] = useState<StepStakeToastState | null>(null);

  useEffect(() => {
    ensureStepStakeWalletReady();
  }, []);

  useEffect(() => {
    if (initialPoolId) {
      setTrackFilter('all');
      setVisibilityFilter('all');
      setSelectedPoolId(initialPoolId);
      onClearInitialSelection?.();
    }
  }, [initialPoolId, onClearInitialSelection]);

  useEffect(() => {
    if (initialCreateVisibility) {
      setCreateModalVisibility(initialCreateVisibility);
      setCreateModalOpen(true);
      onClearInitialSelection?.();
    }
  }, [initialCreateVisibility, onClearInitialSelection]);

  const fetchPools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/step-stake/pools?viewer=${encodeURIComponent(wallet.publicKey)}`
      );
      const data = (await resp.json()) as { pools?: StepStakePool[]; error?: string };
      if (!resp.ok || !Array.isArray(data.pools)) {
        throw new Error(data.error || 'Unable to load accountability pools.');
      }
      setPools(data.pools);
      setSelectedPoolId((prev) =>
        prev && data.pools!.some((p) => p.id === prev) ? prev : data.pools![0]?.id || null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load accountability pools.');
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    void fetchPools();
  }, [fetchPools]);

  const soloCount = useMemo(
    () => pools.filter((p) => p.visibility === 'solo').length,
    [pools]
  );
  const publicCount = useMemo(
    () => pools.filter((p) => p.visibility === 'community').length,
    [pools]
  );

  const filteredPools = useMemo(() => {
    return pools.filter((p) => {
      if (trackFilter !== 'all' && p.category !== trackFilter) return false;
      if (visibilityFilter !== 'all' && p.visibility !== visibilityFilter) return false;
      return true;
    });
  }, [pools, trackFilter, visibilityFilter]);

  const activePool = useMemo(() => {
    if (filteredPools.length === 0) return null;
    return filteredPools.find((p) => p.id === selectedPoolId) || filteredPools[0];
  }, [filteredPools, selectedPoolId]);

  const handlePoolUpdated = (updated: StepStakePool) => {
    setPools((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedPoolId(updated.id);
  };

  const handlePoolCreated = (created: StepStakePool, solscanUrl: string, signature: string) => {
    setPools((prev) => [created, ...prev]);
    setTrackFilter('all');
    setVisibilityFilter('all');
    setSelectedPoolId(created.id);
    setToast({
      title:
        created.visibility === 'community'
          ? `Published "${created.title}" to Explore on Solana`
          : `Created Solo Pool "${created.title}" on Solana`,
      signature,
      solscanUrl,
    });
  };

  const openCreateModal = (defaultVisibility: StepStakeVisibility = 'solo') => {
    setCreateModalVisibility(defaultVisibility);
    setCreateModalOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Solscan Confirmation Banner Toast (Supports dual Claim Tx + Escrow Payout Tx) */}
      {toast && (
        <div className="rounded-2xl bg-[#141418] text-white px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-[#4ADE80] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">{toast.title}</div>
              <div className="font-mono text-[11px] text-white/60 truncate">
                Tx: {toast.signature.slice(0, 18)}...
                {toast.payoutSignature ? ` · Payout: ${toast.payoutSignature.slice(0, 14)}...` : ''}
              </div>
              {toast.payoutDetail && (
                <div className="text-[11px] text-white/75 mt-0.5">{toast.payoutDetail}</div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={toast.solscanUrl}
              target="_blank"
              rel="noreferrer"
              className="min-h-[36px] px-3.5 rounded-full bg-[#F16A2E] hover:bg-[#D95922] text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>{toast.payoutSolscanUrl ? 'Claim Tx' : 'Verify on Solscan'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {toast.payoutSolscanUrl && (
              <a
                href={toast.payoutSolscanUrl}
                target="_blank"
                rel="noreferrer"
                className="min-h-[36px] px-3.5 rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>Escrow Payout Tx</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              aria-label="Dismiss confirmation banner"
              onClick={() => setToast(null)}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Visibility Switcher Banner (Solo Private Default <-> Public Community on Explore) */}
      <div className="actake-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-sm font-extrabold text-[#111114]">
            Solo &amp; Public Community Track Pools
          </div>
          <p className="text-xs text-[#6B6663] mt-0.5">
            New Track Pools start as private Solo by default—toggle Public Community anytime when
            creating to publish on Explore.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Filter track pools by visibility"
          className="inline-flex items-center p-1 rounded-full bg-[#FFF4EE] border border-[#F2E3DA] self-start sm:self-auto shrink-0"
        >
          <button
            type="button"
            role="radio"
            aria-checked={visibilityFilter === 'all'}
            onClick={() => setVisibilityFilter('all')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              visibilityFilter === 'all'
                ? 'bg-[#111114] text-white shadow-xs'
                : 'text-[#6B6663] hover:text-[#111114]'
            }`}
          >
            All ({pools.length})
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={visibilityFilter === 'solo'}
            onClick={() => setVisibilityFilter('solo')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              visibilityFilter === 'solo'
                ? 'bg-[#111114] text-white shadow-xs'
                : 'text-[#6B6663] hover:text-[#111114]'
            }`}
          >
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>Solo ({soloCount})</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={visibilityFilter === 'community'}
            onClick={() => setVisibilityFilter('community')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              visibilityFilter === 'community'
                ? 'bg-[#F16A2E] text-white shadow-xs'
                : 'text-[#6B6663] hover:text-[#111114]'
            }`}
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span>Public ({publicCount})</span>
          </button>
        </div>
      </div>

      {/* Toolbar: Track Filters + Create Pool CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center p-1 rounded-full bg-white border border-[#EFE2D9] shadow-[0_4px_14px_rgba(24,20,18,0.04)] overflow-x-auto max-w-full">
          {(
            [
              { id: 'all', label: 'All Tracks' },
              { id: 0, label: 'Steps' },
              { id: 1, label: 'Gym' },
              { id: 2, label: 'Study' },
            ] as const
          ).map((tab) => (
            <button
              key={String(tab.id)}
              type="button"
              onClick={() => setTrackFilter(tab.id)}
              className={`min-h-[40px] px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                trackFilter === tab.id
                  ? 'bg-[#141418] text-white'
                  : 'text-[#6B6663] hover:text-[#111114]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            disabled={loading}
            onClick={() => void fetchPools()}
            aria-label="Refresh accountability pools"
            className="min-h-[44px] min-w-[44px] px-3 rounded-full bg-white border border-[#EFE2D9] hover:border-[#F16A2E] text-[#111114] inline-flex items-center justify-center"
          >
            <RefreshCw className={`w-4 h-4 text-[#F16A2E] ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() =>
              openCreateModal(visibilityFilter === 'community' ? 'community' : 'solo')
            }
            className="min-h-[44px] px-5 rounded-full bg-[#F16A2E] hover:bg-[#D95922] text-white text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>
              {visibilityFilter === 'community' ? 'Create Public Track Pool' : 'Create Track Pool'}
            </span>
          </button>
        </div>
      </div>

      {/* Horizontal Pool Selector Cards */}
      {loading && pools.length === 0 ? (
        <div className="actake-card p-10 flex items-center justify-center gap-2 text-xs text-[#6B6663]">
          <Loader2 className="w-4 h-4 animate-spin text-[#F16A2E]" />
          <span>Loading Solana Accountability Pools...</span>
        </div>
      ) : error ? (
        <div className="actake-card p-6 flex items-center justify-between gap-3 text-xs text-[#DC2626]">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void fetchPools()}
            className="font-bold underline text-[#111114]"
          >
            Retry
          </button>
        </div>
      ) : filteredPools.length === 0 ? (
        <div className="actake-card p-8 text-center space-y-3">
          <div className="font-display text-base font-extrabold text-[#111114]">
            {visibilityFilter === 'solo'
              ? 'No private Solo Track Pools yet'
              : visibilityFilter === 'community'
                ? 'No Public Community Track Pools in this track yet'
                : 'No pools in this track yet'}
          </div>
          <p className="text-xs text-[#6B6663]">
            {visibilityFilter === 'solo'
              ? 'Start a private Solo Steps, Gym, or Study commitment backed by USDC or SKR on Solana.'
              : 'Launch a Steps, Gym, or Deep Study pool as Solo (default) or Public Community on Explore.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() =>
                openCreateModal(visibilityFilter === 'community' ? 'community' : 'solo')
              }
              className="min-h-[44px] px-5 rounded-full bg-[#141418] hover:bg-[#F16A2E] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>
                {visibilityFilter === 'community'
                  ? 'Create Public Track Pool'
                  : 'Create Solo Track Pool'}
              </span>
            </button>
            {visibilityFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setVisibilityFilter('all')}
                className="min-h-[44px] px-4 rounded-full bg-white border border-[#EFE2D9] hover:border-[#111114] text-xs font-bold text-[#111114]"
              >
                Show All Pools
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {filteredPools.map((pool) => {
              const meta = ACCOUNTABILITY_TRACKS[pool.category];
              const isSelected = activePool?.id === pool.id;
              const isSolo = pool.visibility === 'solo';
              const Icon =
                pool.category === 0 ? Footprints : pool.category === 1 ? Dumbbell : BookOpen;
              return (
                <button
                  key={pool.id}
                  type="button"
                  onClick={() => setSelectedPoolId(pool.id)}
                  className={`p-4 rounded-2xl border text-left transition-colors space-y-2 ${
                    isSelected
                      ? 'bg-white border-[#F16A2E] ring-1 ring-[#F16A2E]'
                      : 'bg-white border-[#EFE2D9] hover:border-[#F16A2E]/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-[#6B6663]">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#111114]">
                      <Icon className="w-3.5 h-3.5 text-[#F16A2E]" />
                      <span>{meta.shortLabel}</span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isSolo
                            ? 'bg-[#141418] text-white'
                            : 'bg-[#FFF3EC] text-[#F16A2E]'
                        }`}
                      >
                        {isSolo ? (
                          <>
                            <Lock className="w-2.5 h-2.5" />
                            <span>Solo</span>
                          </>
                        ) : (
                          <>
                            <Globe className="w-2.5 h-2.5" />
                            <span>Public</span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="font-mono font-bold text-[#111114] tabular-nums">
                      ${pool.stakeAmount} {pool.tokenSymbol}
                    </span>
                  </div>
                  <div className="font-display text-sm font-extrabold text-[#111114] truncate">
                    {pool.title}
                  </div>
                  <div className="text-[11px] text-[#6B6663] tabular-nums">
                    {pool.targetMetric.toLocaleString()} {meta.unitShort} ·{' '}
                    {pool.durationDays === 1 ? 'Once' : `${pool.durationDays}d`} · $
                    {pool.dailyPrincipal.toFixed(2)}/day
                    {!isSolo ? ` · ${pool.activeParticipants}/${pool.totalParticipants} active` : ''}
                  </div>
                </button>
              );
            })}
          </div>

          {activePool && (
            <PoolDashboard
              pool={activePool}
              wallet={wallet}
              escrowWallet={escrowWallet}
              treasuryWallet={treasuryWallet}
              onPoolUpdated={handlePoolUpdated}
              onTxConfirmed={(summary) => setToast(summary)}
            />
          )}
        </>
      )}

      <CreatePoolModal
        open={createModalOpen}
        wallet={wallet}
        escrowWallet={escrowWallet}
        treasuryWallet={treasuryWallet}
        initialVisibility={createModalVisibility}
        onClose={() => setCreateModalOpen(false)}
        onPoolCreated={handlePoolCreated}
      />
    </div>
  );
};
