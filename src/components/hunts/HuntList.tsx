import React from 'react';
import {
  Compass,
  MapPin,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import { GeoCoordinate, GeoHuntRecord } from '../../types/geodrops';
import { computeHaversineMeters, formatDistanceLabel } from '../../hooks/hunts/geoMath';

interface HuntListProps {
  hunts: GeoHuntRecord[];
  loading: boolean;
  error: string | null;
  walletPubkey: string;
  /** Optional user location (ONLY populated if the user explicitly opted into location) */
  userCoords: GeoCoordinate | null;
  joiningHuntId: string | null;
  onRetry: () => void;
  onJoinHunt: (hunt: GeoHuntRecord) => void;
  onOpenCreate: () => void;
}

export const HuntList: React.FC<HuntListProps> = ({
  hunts,
  loading,
  error,
  walletPubkey,
  userCoords,
  joiningHuntId,
  onRetry,
  onJoinHunt,
  onOpenCreate,
}) => {
  if (loading && hunts.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="actake-card p-6 space-y-4">
            <div className="h-4 w-32 rounded-lg actake-skeleton" />
            <div className="h-6 w-3/4 rounded-lg actake-skeleton" />
            <div className="h-12 w-full rounded-xl actake-skeleton" />
            <div className="h-11 w-full rounded-full actake-skeleton" />
          </div>
        ))}
      </div>
    );
  }

  if (error && hunts.length === 0) {
    return (
      <div className="actake-card p-8 text-center space-y-4">
        <div className="text-base font-bold text-[#111114]">
          Unable to load public GeoDrops
        </div>
        <p className="text-sm text-[#6B6663] max-w-md mx-auto">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[44px] px-5 rounded-full bg-[#111114] text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-[#232329] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry Directory</span>
        </button>
      </div>
    );
  }

  if (hunts.length === 0) {
    return (
      <div className="actake-card p-10 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#FFF4EE] border border-[#F2DCD0] mx-auto flex items-center justify-center text-[#F16A2E]">
          <MapPin className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-xl font-extrabold text-[#111114]">
            No Public GeoDrops Yet
          </h2>
          <p className="text-sm text-[#6B6663] max-w-md mx-auto">
            Map out a real-world geofence area and drop the first token-funded AR treasure chest on Solana Devnet.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenCreate}
          className="min-h-[48px] px-6 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-sm font-bold inline-flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Create First GeoDrop</span>
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {hunts.map((hunt) => {
        const alreadyJoined = hunt.participants.includes(walletPubkey);
        const alreadyClaimed = hunt.claimedBy.includes(walletPubkey);
        const soldOut = hunt.claimsRemaining <= 0;
        const isJoining = joiningHuntId === hunt.id;

        const distanceMeters = userCoords
          ? computeHaversineMeters(
              userCoords.lat,
              userCoords.lng,
              hunt.targetLat,
              hunt.targetLng
            )
          : null;

        const hasPolygonArea = Boolean(hunt.geofencePolygon && hunt.geofencePolygon.length >= 3);

        return (
          <article
            key={hunt.id}
            className="actake-card p-6 flex flex-col justify-between gap-5 transition-transform duration-200 hover:-translate-y-0.5"
          >
            <div className="space-y-3.5">
              {/* Top line: landmark + numeric reward */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#F16A2E] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{hunt.landmarkName}</span>
                  </div>
                  <h2 className="font-display text-xl font-extrabold text-[#111114] leading-snug mt-1">
                    {hunt.title}
                  </h2>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-display text-2xl font-extrabold text-[#111114] tabular-nums leading-none">
                    {hunt.tokenSymbol === 'USDC' ? '$' : ''}
                    {hunt.rewardPerChest % 1 === 0
                      ? hunt.rewardPerChest.toFixed(0)
                      : hunt.rewardPerChest.toFixed(2)}
                    <span className="text-xs font-mono font-bold text-[#6B6663] ml-1">
                      {hunt.tokenSymbol}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#6B6663] mt-1">per chest</div>
                </div>
              </div>

              {/* Lore / Hint */}
              <p className="text-sm text-[#534E4B] leading-relaxed line-clamp-3">
                {hunt.loreHint}
              </p>

              {/* Quiet unboxed telemetry row */}
              <div className="pt-2 border-t border-[#F2E7E0] flex flex-wrap items-center justify-between gap-y-1.5 gap-x-3 text-xs text-[#6B6663] tabular-nums">
                <span className="font-mono font-semibold text-[#111114]">
                  {hunt.claimsRemaining}/{hunt.totalChests} chests left
                </span>
                <span>
                  {hasPolygonArea ? 'Mapped Area' : `${hunt.radiusMeters}m Zone`}
                  {distanceMeters !== null ? ` · ${formatDistanceLabel(distanceMeters)} away` : ''}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#7D7672] tabular-nums">
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {hunt.participants.length} hunters joined
                </span>
                <span className="font-mono">
                  {hunt.targetLat.toFixed(4)}, {hunt.targetLng.toFixed(4)}
                </span>
              </div>
            </div>

            {/* Action CTA */}
            <button
              type="button"
              disabled={isJoining || (soldOut && !alreadyClaimed)}
              onClick={() => onJoinHunt(hunt)}
              className={`w-full min-h-[46px] px-5 rounded-full text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                alreadyClaimed
                  ? 'bg-[#EEF9F1] text-[#15803D] border border-[#BBF7D0] hover:bg-[#DCFCE7]'
                  : soldOut
                    ? 'bg-[#F3EAE4] text-[#8E8680] cursor-not-allowed'
                    : alreadyJoined
                      ? 'bg-[#111114] text-white hover:bg-[#232329]'
                      : 'bg-[#F16A2E] text-white hover:bg-[#DC5A20]'
              }`}
            >
              {isJoining ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Joining Hunt...</span>
                </>
              ) : alreadyClaimed ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Chest Claimed — Reopen AR</span>
                </>
              ) : soldOut ? (
                <span>All Chests Claimed</span>
              ) : alreadyJoined ? (
                <>
                  <Compass className="w-4 h-4" />
                  <span>Open Hunt Radar</span>
                </>
              ) : (
                <>
                  <Compass className="w-4 h-4" />
                  <span>Join Hunt</span>
                </>
              )}
            </button>
          </article>
        );
      })}
    </div>
  );
};
