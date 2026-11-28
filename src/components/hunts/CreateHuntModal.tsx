import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  Crosshair,
  Loader2,
  Lock,
  MapPin,
  Pentagon,
  Search,
  ShieldCheck,
  Undo2,
  X,
} from 'lucide-react';
import {
  GeoCoordinate,
  GeoDropArAsset,
  GeoDropRadiusMeters,
  GeoDropTokenSymbol,
  GeoHuntRecord,
} from '../../types/geodrops';
import { computePolygonCentroid } from '../../hooks/hunts/geoMath';
import { GeofenceMap } from './GeofenceMap';
import { BrandArStudio } from './BrandArStudio';

export interface FundHuntEscrowResult {
  signature: string;
  escrowWallet: string;
  settledAsset: 'USDC' | 'SOL';
  settledAmount: number;
  broadcastedOnChain: boolean;
}

interface CreateHuntModalProps {
  walletPubkey: string;
  escrowWallet: string | null;
  onFundHuntEscrow: (params: {
    token: GeoDropTokenSymbol;
    totalPoolAmount: number;
    title: string;
    landmarkName: string;
  }) => Promise<FundHuntEscrowResult>;
  onCreated: (hunt: GeoHuntRecord) => void;
  onClose: () => void;
}

const DEFAULT_MAP_CENTER: GeoCoordinate = { lat: 37.7955, lng: -122.3937 };

export const CreateHuntModal: React.FC<CreateHuntModalProps> = ({
  walletPubkey,
  escrowWallet,
  onFundHuntEscrow,
  onCreated,
  onClose,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Real-World Location & Geofence Area Mapper
  const [title, setTitle] = useState('');
  const [landmarkName, setLandmarkName] = useState('');
  const [loreHint, setLoreHint] = useState('');
  const [mapCenter, setMapCenter] = useState<GeoCoordinate>(DEFAULT_MAP_CENTER);
  const [mapTool, setMapTool] = useState<'pin' | 'polygon'>('pin');
  const [targetPin, setTargetPin] = useState<GeoCoordinate | null>(DEFAULT_MAP_CENTER);
  const [polygonPoints, setPolygonPoints] = useState<GeoCoordinate[]>([]);
  const [radiusMeters, setRadiusMeters] = useState<GeoDropRadiusMeters>(25);

  // Optional search & opt-in GPS center (never runs automatically on open)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const [mapNotice, setMapNotice] = useState<string | null>(null);

  // Step 2: Funding, Rewards & Brand AR 3D Studio
  const [tokenSymbol, setTokenSymbol] = useState<GeoDropTokenSymbol>('USDC');
  const [totalPoolInput, setTotalPoolInput] = useState('20');
  const [totalChestsInput, setTotalChestsInput] = useState('5');
  const [arAsset, setArAsset] = useState<GeoDropArAsset>({ kind: 'chest' });

  // Step 3: On-Chain Escrow Execution
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const totalPoolAmount = useMemo(() => {
    const n = Number(totalPoolInput);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [totalPoolInput]);

  const totalChests = useMemo(() => {
    const n = Math.floor(Number(totalChestsInput));
    return Number.isFinite(n) && n >= 1 ? Math.min(50, n) : 0;
  }, [totalChestsInput]);

  const rewardPerChest = useMemo(() => {
    if (totalPoolAmount <= 0 || totalChests <= 0) return 0;
    return Number((totalPoolAmount / totalChests).toFixed(4));
  }, [totalPoolAmount, totalChests]);

  const handleMapClick = (coord: GeoCoordinate) => {
    setMapNotice(null);
    if (mapTool === 'pin') {
      setTargetPin(coord);
      return;
    }

    const nextPoly = [...polygonPoints, coord].slice(0, 16);
    setPolygonPoints(nextPoly);
    if (nextPoly.length >= 3) {
      const { centroid } = computePolygonCentroid(nextPoly);
      setTargetPin({
        lat: Number(centroid.lat.toFixed(6)),
        lng: Number(centroid.lng.toFixed(6)),
      });
    } else if (!targetPin) {
      setTargetPin(coord);
    }
  };

  const handleLocateMeOnMap = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setMapNotice('GPS geolocation is not available in this browser.');
      return;
    }
    setLocatingGps(true);
    setMapNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coord = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setMapCenter(coord);
        if (mapTool === 'pin') {
          setTargetPin(coord);
        }
        setLocatingGps(false);
        setMapNotice('Centered on your live real-world GPS location.');
      },
      () => {
        setLocatingGps(false);
        setMapNotice('Location permission was declined. Click anywhere on the map or search a place.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSearchPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchingPlace(true);
    setMapNotice(null);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!resp.ok) throw new Error('Place search unavailable right now.');
      const items = (await resp.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
      const first = items[0];
      if (!first?.lat || !first?.lon) {
        setMapNotice('Location not found. Try a city, landmark, or street address.');
        return;
      }
      const coord = {
        lat: Number(Number(first.lat).toFixed(6)),
        lng: Number(Number(first.lon).toFixed(6)),
      };
      setMapCenter(coord);
      setTargetPin(coord);
      if (!landmarkName.trim() && first.display_name) {
        setLandmarkName(first.display_name.split(',')[0].trim().slice(0, 60));
      }
      setMapNotice(`Jumped to ${first.display_name?.split(',').slice(0, 2).join(', ')}. Click the map to refine your geofence.`);
    } catch {
      setMapNotice('Could not reach place search. Click directly on the map to drop your geofence pin.');
    } finally {
      setSearchingPlace(false);
    }
  };

  const canProceedStep1 =
    title.trim().length >= 3 &&
    landmarkName.trim().length >= 2 &&
    targetPin !== null &&
    (mapTool === 'pin' || polygonPoints.length >= 3);

  const arAssetReady =
    arAsset.kind === 'chest' ||
    (arAsset.kind === 'image_depth' && Boolean(arAsset.imageDataUrl)) ||
    (arAsset.kind === 'ai_3d_sculpture' && Boolean(arAsset.aiBlueprint)) ||
    (arAsset.kind === 'custom_glb' && Boolean(arAsset.modelAssetUrl));

  const arAssetSummaryLabel =
    arAsset.kind === 'image_depth'
      ? `3D Depth Brand Image (${arAsset.frameStyle || 'card'})`
      : arAsset.kind === 'ai_3d_sculpture'
        ? `AI 3D Sculpture (${arAsset.aiBlueprint?.title || 'Custom'})`
        : arAsset.kind === 'custom_glb'
          ? `Custom .GLB (${arAsset.modelFileName || '3D Model'})`
          : 'Classic 3D Treasure Chest';

  const canProceedStep2 =
    totalPoolAmount >= 0.01 && totalChests >= 1 && totalChests <= 50 && arAssetReady;

  const handleFundAndPublish = async () => {
    if (!targetPin) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const escrowResult = await onFundHuntEscrow({
        token: tokenSymbol,
        totalPoolAmount,
        title: title.trim(),
        landmarkName: landmarkName.trim(),
      });

      const resp = await fetch('/api/hunts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          landmarkName: landmarkName.trim(),
          loreHint: loreHint.trim(),
          creatorWallet: walletPubkey,
          huntEscrowPubkey: escrowResult.escrowWallet,
          fundingTxSignature: escrowResult.signature,
          tokenSymbol,
          totalPoolAmount,
          totalChests,
          targetLat: targetPin.lat,
          targetLng: targetPin.lng,
          radiusMeters,
          geofencePolygon: polygonPoints.length >= 3 ? polygonPoints : null,
          arAsset,
          isPublic: true,
        }),
      });

      const data = (await resp.json()) as { hunt?: GeoHuntRecord; error?: string };
      if (!resp.ok || !data.hunt) {
        throw new Error(data.error || 'Failed to publish GeoDrop hunt metadata.');
      }

      onCreated(data.hunt);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to fund and publish GeoDrop hunt.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create GeoDrop AR Scavenger Hunt"
      className="fixed inset-0 z-50 bg-[#111114]/65 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <div className="w-full max-w-2xl bg-[#FFFDFB] sm:rounded-[30px] rounded-t-[28px] border border-[#EADAD0] shadow-2xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#F1E4DC] flex items-center justify-between gap-4 shrink-0">
          <div>
            <div className="text-xs font-semibold text-[#F16A2E]">
              Step {step} of 3 ·{' '}
              {step === 1
                ? 'Map Real-World Geofence Area'
                : step === 2
                  ? 'Funding & Brand AR 3D Studio'
                  : 'On-Chain Devnet Escrow'}
            </div>
            <h2 className="font-display text-xl font-extrabold text-[#111114]">
              Create GeoDrop Hunt
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Create Hunt modal"
            className="w-11 h-11 rounded-full bg-[#F7EFEA] hover:bg-[#EFE2D9] text-[#111114] flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {step === 1 && (
            <>
              {/* Place Search + Opt-In GPS Center */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <form onSubmit={handleSearchPlace} className="flex-1 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-[#8C837E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search real-world city, park, or landmark..."
                      className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-white border border-[#E6D6CC] text-sm text-[#111114] placeholder:text-[#9A918C]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={searchingPlace}
                    className="min-h-[44px] px-4 rounded-xl bg-[#111114] text-white text-xs font-bold hover:bg-[#232329] disabled:opacity-60 transition-colors shrink-0"
                  >
                    {searchingPlace ? 'Finding...' : 'Go'}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={handleLocateMeOnMap}
                  disabled={locatingGps}
                  className="min-h-[44px] px-4 rounded-xl bg-[#FFF4EE] border border-[#F2CBB6] text-[#D85316] text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-[#FFE8DA] transition-colors shrink-0"
                >
                  {locatingGps ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Crosshair className="w-4 h-4" />
                  )}
                  <span>Center on My GPS</span>
                </button>
              </div>

              {/* Geofence Mapping Tool Switcher: Circle Radius vs Custom Polygon Area */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex p-1 rounded-xl bg-[#F4EBE5] border border-[#E9D9CF]">
                  <button
                    type="button"
                    onClick={() => {
                      setMapTool('pin');
                      setPolygonPoints([]);
                    }}
                    className={`min-h-[38px] px-3.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                      mapTool === 'pin'
                        ? 'bg-white text-[#111114] shadow-xs'
                        : 'text-[#6B6663] hover:text-[#111114]'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5 text-[#F16A2E]" />
                    <span>Drop Pin + Radius</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapTool('polygon')}
                    className={`min-h-[38px] px-3.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                      mapTool === 'polygon'
                        ? 'bg-white text-[#111114] shadow-xs'
                        : 'text-[#6B6663] hover:text-[#111114]'
                    }`}
                  >
                    <Pentagon className="w-3.5 h-3.5 text-[#F16A2E]" />
                    <span>Draw Area Boundary</span>
                  </button>
                </div>

                {/* Radius Selector (15m / 25m / 50m) */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-[#6B6663]">Radius:</span>
                  {([15, 25, 50] as GeoDropRadiusMeters[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRadiusMeters(r)}
                      className={`min-h-[36px] px-3 rounded-lg font-mono text-xs font-bold tabular-nums transition-colors ${
                        radiusMeters === r
                          ? 'bg-[#111114] text-white'
                          : 'bg-white border border-[#E6D6CC] text-[#6B6663] hover:text-[#111114]'
                      }`}
                    >
                      {r}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive Real-World Map */}
              <div className="space-y-2">
                <GeofenceMap
                  center={mapCenter}
                  targetPin={targetPin}
                  radiusMeters={radiusMeters}
                  polygonPoints={polygonPoints}
                  interactionMode={mapTool}
                  onMapClick={handleMapClick}
                  heightClassName="h-[250px] sm:h-[290px]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B6663]">
                  <span>
                    {mapTool === 'pin'
                      ? 'Click anywhere on the real-world map to place your chest geofence.'
                      : `Click 3+ corners on the map to outline a custom geofencing area (${polygonPoints.length} points placed).`}
                  </span>
                  {mapTool === 'polygon' && polygonPoints.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPolygonPoints((pts) => pts.slice(0, -1))}
                      className="inline-flex items-center gap-1 font-bold text-[#111114] hover:text-[#F16A2E]"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      Undo Corner
                    </button>
                  )}
                </div>
                {mapNotice && (
                  <div className="text-xs font-medium text-[#D85316] bg-[#FFF4EE] border border-[#F5D6C5] rounded-xl px-3 py-2">
                    {mapNotice}
                  </div>
                )}
                {targetPin && (
                  <div className="font-mono text-[11px] text-[#6B6663] tabular-nums">
                    Target Anchor: {targetPin.lat.toFixed(6)}, {targetPin.lng.toFixed(6)} · {radiusMeters}m radius
                    {polygonPoints.length >= 3 ? ` + ${polygonPoints.length}-corner custom geofence` : ''}
                  </div>
                )}
              </div>

              {/* Hunt Metadata Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-[#111114]">Hunt Title</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={80}
                    placeholder="e.g., Golden Gate Dawn Vault"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white border border-[#E6D6CC] text-sm text-[#111114]"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-[#111114]">Landmark Name</span>
                  <input
                    type="text"
                    value={landmarkName}
                    onChange={(e) => setLandmarkName(e.target.value)}
                    maxLength={100}
                    placeholder="e.g., South Promenade Steps"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white border border-[#E6D6CC] text-sm text-[#111114]"
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-[#111114]">Lore / Hunter Hint</span>
                <textarea
                  rows={2}
                  value={loreHint}
                  onChange={(e) => setLoreHint(e.target.value)}
                  maxLength={300}
                  placeholder="Give explorers a clue for spotting the AR chest inside the geofence..."
                  className="w-full p-3.5 rounded-xl bg-white border border-[#E6D6CC] text-sm text-[#111114] resize-none"
                />
              </label>
            </>
          )}

          {step === 2 && (
            <div className="space-y-5">
              {/* Token Selector */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-[#111114]">Reward Token</div>
                <div className="grid grid-cols-2 gap-3">
                  {(['USDC', 'SKR'] as GeoDropTokenSymbol[]).map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setTokenSymbol(sym)}
                      className={`p-4 rounded-2xl border text-left transition-colors ${
                        tokenSymbol === sym
                          ? 'bg-[#111114] text-white border-[#111114]'
                          : 'bg-white text-[#111114] border-[#E6D6CC] hover:border-[#F16A2E]'
                      }`}
                    >
                      <div className="font-display text-lg font-extrabold">{sym}</div>
                      <div
                        className={`text-xs mt-0.5 ${
                          tokenSymbol === sym ? 'text-white/75' : 'text-[#6B6663]'
                        }`}
                      >
                        {sym === 'USDC'
                          ? 'Devnet SPL USDC (SOL fallback)'
                          : 'Seeker SKR Reward Pool'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Total Pool & Chest Count */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-[#111114]">
                    Total Pool Amount ({tokenSymbol})
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={totalPoolInput}
                    onChange={(e) => setTotalPoolInput(e.target.value)}
                    className="w-full min-h-[48px] px-4 rounded-xl bg-white border border-[#E6D6CC] font-mono text-base font-bold text-[#111114] tabular-nums"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-[#111114]">
                    Number of Chests (1–50)
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    step="1"
                    value={totalChestsInput}
                    onChange={(e) => setTotalChestsInput(e.target.value)}
                    className="w-full min-h-[48px] px-4 rounded-xl bg-white border border-[#E6D6CC] font-mono text-base font-bold text-[#111114] tabular-nums"
                  />
                </label>
              </div>

              {/* Auto-Calculated Per-Chest Breakdown */}
              <div className="rounded-2xl bg-[#FFF6F0] border border-[#F2DACB] p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#F16A2E] text-white flex items-center justify-center shrink-0">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#6B6663]">
                      Auto-Calculated Reward Per Chest
                    </div>
                    <div className="font-display text-2xl font-extrabold text-[#111114] tabular-nums">
                      {tokenSymbol === 'USDC' ? '$' : ''}
                      {rewardPerChest.toFixed(rewardPerChest % 1 === 0 ? 0 : 2)} {tokenSymbol}
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs text-[#6B6663] font-mono tabular-nums">
                  {totalChests} total claims
                </div>
              </div>

              {/* Visibility Toggle (Public active; Private badged Coming Soon) */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-[#111114]">Hunt Visibility</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-white border-2 border-[#111114] flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[#111114]">Public Directory</div>
                      <div className="text-xs text-[#6B6663] mt-0.5">
                        Listed live in /hunts for any hunter to join free.
                      </div>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0" />
                  </div>

                  <div
                    aria-disabled="true"
                    className="p-4 rounded-2xl bg-[#F6F1ED] border border-[#E5DAD2] opacity-75 flex items-start justify-between gap-2 cursor-not-allowed"
                  >
                    <div>
                      <div className="text-sm font-bold text-[#5C5551] flex items-center gap-2">
                        <span>Private / Invite ID</span>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#B45309] bg-[#FEF3C7] px-2 py-0.5 rounded-md">
                          Coming Soon
                        </span>
                      </div>
                      <div className="text-xs text-[#7D7672] mt-0.5">
                        Secret passcodes & gated drops arriving next.
                      </div>
                    </div>
                    <Lock className="w-4 h-4 text-[#8C837E] shrink-0 mt-0.5" />
                  </div>
                </div>
              </div>

              {/* Brand AR 3D Studio (3D Chest, 3D Depth Image, AI Image -> 3D, Optional .GLB) */}
              <div className="pt-2 border-t border-[#F1E4DC] space-y-2">
                <BrandArStudio value={arAsset} tokenSymbol={tokenSymbol} onChange={setArAsset} />
                {!arAssetReady && (
                  <div className="text-xs font-medium text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-3.5 py-2.5">
                    {arAsset.kind === 'image_depth'
                      ? 'Upload a brand image above (or switch back to 3D Chest) to continue.'
                      : arAsset.kind === 'ai_3d_sculpture'
                        ? 'Upload an image and click "Convert Image to 3D with AI" (or switch back to 3D Chest) to continue.'
                        : 'Upload a .glb 3D model above (or switch back to 3D Chest) to continue.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-[#141416] text-white p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[#F4976C]">{landmarkName}</div>
                    <div className="font-display text-xl font-extrabold">{title}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-xl font-extrabold tabular-nums">
                      {tokenSymbol === 'USDC' ? '$' : ''}
                      {totalPoolAmount.toFixed(2)} {tokenSymbol}
                    </div>
                    <div className="text-[11px] text-white/65 tabular-nums">
                      {totalChests} chests × {rewardPerChest} {tokenSymbol}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10 space-y-2 text-xs text-white/80 font-mono">
                  <div className="flex justify-between gap-2">
                    <span className="text-white/55">Geofence</span>
                    <span className="tabular-nums">
                      {polygonPoints.length >= 3
                        ? `${polygonPoints.length}-Corner Mapped Area + ${radiusMeters}m`
                        : `${radiusMeters}m Radius Circle`}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-white/55">Coordinates</span>
                    <span className="tabular-nums">
                      {targetPin?.lat.toFixed(5)}, {targetPin?.lng.toFixed(5)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-white/55">AR 3D Drop</span>
                    <span className="truncate max-w-[220px]">{arAssetSummaryLabel}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-white/55">Escrow Vault</span>
                    <span className="truncate max-w-[220px]">
                      {escrowWallet || 'Actake Escrow Wallet'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-[#FFF6F0] border border-[#F2DACB] p-4 flex items-start gap-3 text-xs text-[#534E4B]">
                <ShieldCheck className="w-5 h-5 text-[#F16A2E] shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Clicking <strong>Fund & Publish Hunt</strong> executes a real Solana Devnet
                  escrow transfer from your connected wallet (SPL USDC when held, or automatic
                  live-priced Devnet SOL fallback) into Actake Escrow, then publishes your hunt
                  immediately to the Public Directory.
                </p>
              </div>

              {submitError && (
                <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-3.5 text-xs font-medium text-[#B91C1C]">
                  {submitError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[#F1E4DC] bg-white flex items-center justify-between gap-3 shrink-0">
          {step > 1 ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
              className="min-h-[46px] px-4 rounded-full bg-[#F5ECE6] hover:bg-[#EBDDD4] text-[#111114] text-sm font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] px-4 rounded-full text-[#6B6663] hover:text-[#111114] text-sm font-bold transition-colors"
            >
              Cancel
            </button>
          )}

          {step === 1 && (
            <button
              type="button"
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
              className="min-h-[46px] px-6 rounded-full bg-[#111114] hover:bg-[#232329] disabled:bg-[#E7DDD6] disabled:text-[#8E8680] text-white text-sm font-bold inline-flex items-center gap-2 transition-colors"
            >
              <span>Next: Funding</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {step === 2 && (
            <button
              type="button"
              disabled={!canProceedStep2}
              onClick={() => setStep(3)}
              className="min-h-[46px] px-6 rounded-full bg-[#111114] hover:bg-[#232329] disabled:bg-[#E7DDD6] disabled:text-[#8E8680] text-white text-sm font-bold inline-flex items-center gap-2 transition-colors"
            >
              <span>Review Escrow</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {step === 3 && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleFundAndPublish()}
              className="min-h-[48px] px-6 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] disabled:opacity-65 text-white text-sm font-bold inline-flex items-center gap-2 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Funding Escrow...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Fund & Publish Hunt</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
