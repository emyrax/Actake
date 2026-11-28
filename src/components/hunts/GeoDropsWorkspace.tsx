import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Compass,
  Crosshair,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  ConfirmGeoDropClaimResponse,
  GeoCoordinate,
  GeoHuntRecord,
  VerifyGeoDropClaimResponse,
} from '../../types/geodrops';
import { SeekerProvider } from './SeekerProvider';
import { HuntList } from './HuntList';
import { CreateHuntModal, FundHuntEscrowResult } from './CreateHuntModal';
import { ARHuntViewport, SignClaimTxResult } from './ARHuntViewport';

export interface GeoDropsWorkspaceProps {
  walletPubkey: string;
  escrowWallet: string | null;
  /** Optional hunt ID passed from Explore tab or /hunts?hunt=:id deep link */
  initialHuntId?: string | null;
  onActiveHuntChange?: (huntId: string | null) => void;
  onFundHuntEscrow: (params: {
    token: 'SKR' | 'USDC';
    totalPoolAmount: number;
    title: string;
    landmarkName: string;
  }) => Promise<FundHuntEscrowResult>;
  onSignClaimTx: (
    serializedTxBase64: string,
    claimMeta: VerifyGeoDropClaimResponse
  ) => Promise<SignClaimTxResult>;
  onHuntClaimed?: (receipt: ConfirmGeoDropClaimResponse) => void;
  onNotify: (tone: 'success' | 'info' | 'error', title: string, detail?: string) => void;
}

type HuntFilterKey = 'all' | 'open' | 'brand3d' | 'usdc' | 'skr' | 'joined';

const HUNT_FILTERS: ReadonlyArray<{ id: HuntFilterKey; label: string }> = [
  { id: 'all', label: 'All Hunts' },
  { id: 'open', label: 'Open Drops' },
  { id: 'brand3d', label: '3D Brand' },
  { id: 'usdc', label: 'USDC' },
  { id: 'skr', label: 'SKR' },
  { id: 'joined', label: 'Joined' },
];

const GeoDropsWorkspaceInner: React.FC<GeoDropsWorkspaceProps> = ({
  walletPubkey,
  escrowWallet,
  initialHuntId = null,
  onActiveHuntChange,
  onFundHuntEscrow,
  onSignClaimTx,
  onHuntClaimed,
  onNotify,
}) => {
  const [hunts, setHunts] = useState<GeoHuntRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeHuntId, setActiveHuntId] = useState<string | null>(initialHuntId);
  const [createOpen, setCreateOpen] = useState(false);
  const [joiningHuntId, setJoiningHuntId] = useState<string | null>(null);

  // Search & Filter state right under the big heading
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<HuntFilterKey>('all');

  // Optional directory distance sorting — strictly opt-in (NEVER runs on page load!)
  const [directoryCoords, setDirectoryCoords] = useState<GeoCoordinate | null>(null);
  const [locatingDirectory, setLocatingDirectory] = useState(false);

  useEffect(() => {
    if (initialHuntId) {
      setActiveHuntId(initialHuntId);
    }
  }, [initialHuntId]);

  const setSyncedActiveHuntId = useCallback(
    (nextId: string | null) => {
      setActiveHuntId(nextId);
      onActiveHuntChange?.(nextId);
    },
    [onActiveHuntChange]
  );

  const fetchHunts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/hunts');
      const data = (await resp.json()) as { hunts?: GeoHuntRecord[]; error?: string };
      if (!resp.ok || !Array.isArray(data.hunts)) {
        throw new Error(data.error || 'Unable to load public GeoDrops hunts.');
      }
      setHunts(data.hunts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach GeoDrops directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHunts();
  }, [fetchHunts]);

  const activeHunt = activeHuntId
    ? hunts.find((h) => h.id === activeHuntId) || null
    : null;

  const filteredHunts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return hunts.filter((hunt) => {
      if (activeFilter === 'open' && hunt.claimsRemaining <= 0) return false;
      if (activeFilter === 'brand3d' && (!hunt.arAsset || hunt.arAsset.kind === 'chest')) {
        return false;
      }
      if (activeFilter === 'usdc' && hunt.tokenSymbol !== 'USDC') return false;
      if (activeFilter === 'skr' && hunt.tokenSymbol !== 'SKR') return false;
      if (activeFilter === 'joined' && !hunt.participants.includes(walletPubkey)) return false;

      if (!q) return true;
      return (
        hunt.title.toLowerCase().includes(q) ||
        hunt.landmarkName.toLowerCase().includes(q) ||
        hunt.loreHint.toLowerCase().includes(q) ||
        hunt.tokenSymbol.toLowerCase().includes(q) ||
        (hunt.arAsset?.brandName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [hunts, searchQuery, activeFilter, walletPubkey]);

  const handleEnableDirectoryDistance = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onNotify('info', 'Location Unavailable', 'Browser geolocation is not available on this device.');
      return;
    }
    setLocatingDirectory(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDirectoryCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocatingDirectory(false);
        onNotify('success', 'Distances Updated', 'Showing live distance to each public GeoDrop.');
      },
      () => {
        setLocatingDirectory(false);
        onNotify(
          'info',
          'Location Permission Skipped',
          'You can still join any hunt and use Indoor Demo Mode or enable GPS later.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleJoinHunt = async (hunt: GeoHuntRecord) => {
    setJoiningHuntId(hunt.id);
    try {
      const resp = await fetch(`/api/hunts/${encodeURIComponent(hunt.id)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletPubkey }),
      });
      const data = (await resp.json()) as { hunt?: GeoHuntRecord; error?: string };
      if (!resp.ok || !data.hunt) {
        throw new Error(data.error || 'Could not join hunt.');
      }
      setHunts((prev) => prev.map((item) => (item.id === data.hunt!.id ? data.hunt! : item)));
      setSyncedActiveHuntId(data.hunt.id);
    } catch (err) {
      onNotify(
        'error',
        'Unable to Join Hunt',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setJoiningHuntId(null);
    }
  };

  const handleHuntCreated = (newHunt: GeoHuntRecord) => {
    setHunts((prev) => [newHunt, ...prev.filter((h) => h.id !== newHunt.id)]);
    setCreateOpen(false);
    setSyncedActiveHuntId(newHunt.id);
    onNotify(
      'success',
      'GeoDrop Hunt Published!',
      `${newHunt.title} (${newHunt.totalChests} chests × ${newHunt.rewardPerChest} ${newHunt.tokenSymbol}) is now live.`
    );
  };

  const handleHuntUpdated = (updated: GeoHuntRecord) => {
    setHunts((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
  };

  const hasActiveSearchOrFilter = Boolean(searchQuery.trim()) || activeFilter !== 'all';

  return (
    <div className="space-y-6 pb-10">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="text-xs font-semibold text-[#F16A2E] inline-flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" />
            <span>GeoDrops AR Scavenger Hunts · Solana Devnet</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight">
            {activeHunt ? activeHunt.title : 'Public GeoDrops'}
          </h1>
          <p className="text-sm text-[#6B6663] max-w-xl">
            {activeHunt
              ? `Real-world geofenced AR chest at ${activeHunt.landmarkName}. Choose Live GPS + AR Mode or Indoor Demo Mode below.`
              : 'Map real-world geofence drops, follow compass radar into the zone, and tap floating 3D chests to unlock token rewards.'}
          </p>
        </div>

        {/* Workspace Primary Actions */}
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-end">
          {!activeHunt && (
            <>
              <button
                type="button"
                onClick={handleEnableDirectoryDistance}
                disabled={locatingDirectory}
                className="min-h-[44px] px-4 rounded-full bg-white border border-[#E6D6CC] hover:border-[#111114] text-xs font-bold text-[#111114] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                {locatingDirectory ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#F16A2E]" />
                ) : (
                  <Crosshair className="w-3.5 h-3.5 text-[#F16A2E]" />
                )}
                <span>{directoryCoords ? 'Refresh Distance' : 'Show Distances'}</span>
              </button>

              <button
                type="button"
                onClick={() => void fetchHunts()}
                aria-label="Refresh public hunts"
                className="w-11 h-11 rounded-full bg-white border border-[#E6D6CC] hover:border-[#111114] text-[#111114] flex items-center justify-center transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="min-h-[46px] px-5 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Create Hunt</span>
          </button>
        </div>
      </div>

      {/* Search Bar & Filter Controls directly under the big heading */}
      {!activeHunt && (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#877F7A] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search hunts, landmarks, brands, or clues..."
              aria-label="Search GeoDrops hunts"
              className="w-full min-h-[44px] pl-11 pr-10 rounded-full bg-white border border-[#EFE2D9] text-sm text-[#111114] placeholder:text-[#9A938E] shadow-[0_4px_14px_rgba(24,20,18,0.04)] focus:outline-none focus:border-[#F16A2E]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear hunt search"
                className="w-8 h-8 rounded-full hover:bg-[#FFF4EE] flex items-center justify-center text-[#877F7A] hover:text-[#111114] absolute right-1.5 top-1/2 -translate-y-1/2 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="Filter public hunts"
            className="inline-flex items-center p-1 rounded-full bg-white border border-[#EFE2D9] shadow-[0_4px_14px_rgba(24,20,18,0.04)] self-start overflow-x-auto max-w-full"
          >
            {HUNT_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  activeFilter === f.id
                    ? 'bg-[#F16A2E] text-white'
                    : 'text-[#6B6663] hover:text-[#111114]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area: Active AR Scavenger View OR Public Hunts Directory */}
      {activeHunt ? (
        <ARHuntViewport
          hunt={activeHunt}
          walletPubkey={walletPubkey}
          onSignClaimTx={onSignClaimTx}
          onHuntUpdated={handleHuntUpdated}
          onHuntClaimed={onHuntClaimed}
          onNotify={onNotify}
          onBackToDirectory={() => setSyncedActiveHuntId(null)}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B6663] tabular-nums">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <MapPin className="w-3.5 h-3.5 text-[#F16A2E]" />
              <span>
                Showing {filteredHunts.length} of {hunts.length} public GeoDrop
                {hunts.length === 1 ? '' : 's'} · Sensors stay off until you opt in
              </span>
            </span>

            {hasActiveSearchOrFilter && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
                className="text-xs font-bold text-[#F16A2E] hover:underline"
              >
                Reset filters
              </button>
            )}
          </div>

          {hasActiveSearchOrFilter && filteredHunts.length === 0 && !loading && !error ? (
            <div className="actake-card p-10 text-center space-y-3">
              <h2 className="font-display text-lg font-extrabold text-[#111114]">
                No Matching GeoDrops
              </h2>
              <p className="text-sm text-[#6B6663] max-w-md mx-auto">
                No hunts match your current search or filter. Clear filters to view all active AR drops.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
                className="min-h-[44px] px-5 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold transition-colors"
              >
                Clear Search &amp; Filters
              </button>
            </div>
          ) : (
            <HuntList
              hunts={filteredHunts}
              loading={loading}
              error={error}
              walletPubkey={walletPubkey}
              userCoords={directoryCoords}
              joiningHuntId={joiningHuntId}
              onRetry={() => void fetchHunts()}
              onJoinHunt={(hunt) => void handleJoinHunt(hunt)}
              onOpenCreate={() => setCreateOpen(true)}
            />
          )}
        </div>
      )}

      {/* Create Hunt 3-Step Modal */}
      {createOpen && (
        <CreateHuntModal
          walletPubkey={walletPubkey}
          escrowWallet={escrowWallet}
          onFundHuntEscrow={onFundHuntEscrow}
          onCreated={handleHuntCreated}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
};

export const GeoDropsWorkspace: React.FC<GeoDropsWorkspaceProps> = (props) => {
  return (
    <SeekerProvider>
      <GeoDropsWorkspaceInner {...props} />
    </SeekerProvider>
  );
};
