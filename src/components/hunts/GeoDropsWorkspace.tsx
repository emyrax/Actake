import React, { useCallback, useEffect, useState } from 'react';
import {
  Compass,
  Crosshair,
  MapPin,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { GeoCoordinate, GeoHuntRecord, VerifyGeoDropClaimResponse } from '../../types/geodrops';
import { SeekerProvider } from './SeekerProvider';
import { HuntList } from './HuntList';
import { CreateHuntModal, FundHuntEscrowResult } from './CreateHuntModal';
import { ARHuntViewport, SignClaimTxResult } from './ARHuntViewport';

export interface GeoDropsWorkspaceProps {
  walletPubkey: string;
  escrowWallet: string | null;
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
  onNotify: (tone: 'success' | 'info' | 'error', title: string, detail?: string) => void;
}

const GeoDropsWorkspaceInner: React.FC<GeoDropsWorkspaceProps> = ({
  walletPubkey,
  escrowWallet,
  onFundHuntEscrow,
  onSignClaimTx,
  onNotify,
}) => {
  const [hunts, setHunts] = useState<GeoHuntRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeHuntId, setActiveHuntId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joiningHuntId, setJoiningHuntId] = useState<string | null>(null);

  // Optional directory distance sorting — strictly opt-in (NEVER runs on page load!)
  const [directoryCoords, setDirectoryCoords] = useState<GeoCoordinate | null>(null);
  const [locatingDirectory, setLocatingDirectory] = useState(false);

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
      setActiveHuntId(data.hunt.id);
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
    setActiveHuntId(newHunt.id);
    onNotify(
      'success',
      'GeoDrop Hunt Published!',
      `${newHunt.title} (${newHunt.totalChests} chests × ${newHunt.rewardPerChest} ${newHunt.tokenSymbol}) is now live.`
    );
  };

  const handleHuntUpdated = (updated: GeoHuntRecord) => {
    setHunts((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
  };

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
                className="min-h-[44px] px-4 rounded-full bg-white border border-[#E6D6CC] hover:border-[#111114] text-xs font-bold text-[#111114] inline-flex items-center gap-1.5 transition-colors"
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
            className="min-h-[46px] px-5 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Hunt</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Active AR Scavenger View OR Public Hunts Directory */}
      {activeHunt ? (
        <ARHuntViewport
          hunt={activeHunt}
          walletPubkey={walletPubkey}
          onSignClaimTx={onSignClaimTx}
          onHuntUpdated={handleHuntUpdated}
          onNotify={onNotify}
          onBackToDirectory={() => setActiveHuntId(null)}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B6663]">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <MapPin className="w-3.5 h-3.5 text-[#F16A2E]" />
              <span>
                {hunts.length} active public GeoDrop{hunts.length === 1 ? '' : 's'} · Sensors stay
                off until you opt in
              </span>
            </span>
          </div>

          <HuntList
            hunts={hunts}
            loading={loading}
            error={error}
            walletPubkey={walletPubkey}
            userCoords={directoryCoords}
            joiningHuntId={joiningHuntId}
            onRetry={() => void fetchHunts()}
            onJoinHunt={(hunt) => void handleJoinHunt(hunt)}
            onOpenCreate={() => setCreateOpen(true)}
          />
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
