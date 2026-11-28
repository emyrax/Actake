import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  ExternalLink,
  Footprints,
  Loader2,
  Map as MapIcon,
  Navigation,
  Radar,
  Share2,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import {
  ConfirmGeoDropClaimResponse,
  GeoHuntRecord,
  VerifyGeoDropClaimResponse,
} from '../../types/geodrops';
import {
  bearingToCardinal,
  computeRelativeBearingDelta,
  formatDistanceLabel,
  offsetCoordinateByDistance,
  relativeDeltaToCue,
} from '../../hooks/hunts/geoMath';
import { useHighAccuracyGPS } from '../../hooks/hunts/useHighAccuracyGPS';
import { useCompassHeading } from '../../hooks/hunts/useCompassHeading';
import { useARSession } from '../../hooks/hunts/useARSession';
import { ChestModel } from './ChestModel';
import { GeofenceMap } from './GeofenceMap';

export interface SignClaimTxResult {
  signature: string;
  broadcastedOnChain: boolean;
  explorerUrl?: string;
  solscanUrl?: string;
}

interface ARHuntViewportProps {
  hunt: GeoHuntRecord;
  walletPubkey: string;
  onSignClaimTx: (
    serializedTxBase64: string,
    claimMeta: VerifyGeoDropClaimResponse
  ) => Promise<SignClaimTxResult>;
  onHuntUpdated: (updated: GeoHuntRecord) => void;
  onNotify: (tone: 'success' | 'info' | 'error', title: string, detail?: string) => void;
  onBackToDirectory: () => void;
}

type HuntExperienceMode = 'idle' | 'live-real' | 'indoor-demo';
type ActiveSubView = 'radar' | 'map' | 'ar';

export const ARHuntViewport: React.FC<ARHuntViewportProps> = ({
  hunt,
  walletPubkey,
  onSignClaimTx,
  onHuntUpdated,
  onNotify,
  onBackToDirectory,
}) => {
  // Strictly opt-in hardware gate: starts completely dormant ('idle') on mount!
  const [experienceMode, setExperienceMode] = useState<HuntExperienceMode>('idle');
  const [subView, setSubView] = useState<ActiveSubView>('radar');
  const [dockExpanded, setDockExpanded] = useState(true);

  // Indoor Demo Mode simulation controls (never touches hardware GPS/magnetometer)
  const [demoDistanceMeters, setDemoDistanceMeters] = useState<number>(
    Math.max(42, hunt.radiusMeters + 22)
  );
  const [demoDeviceHeading, setDemoDeviceHeading] = useState<number>(35);
  const demoTargetBearing = 45; // North-East target reference for indoor demo

  // Claim flow state
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimReceipt, setClaimReceipt] = useState<ConfirmGeoDropClaimResponse | null>(null);

  const alreadyClaimed = hunt.claimedBy.includes(walletPubkey) || claimReceipt !== null;

  // Strictly gated live hardware hooks — ONLY run when user explicitly activates Real-World Live Mode
  const isLiveSensorActive = experienceMode === 'live-real';
  const gps = useHighAccuracyGPS({
    isSensorActive: isLiveSensorActive,
    targetLat: hunt.targetLat,
    targetLng: hunt.targetLng,
    radiusMeters: hunt.radiusMeters,
    geofencePolygon: hunt.geofencePolygon,
  });

  const compass = useCompassHeading({
    isSensorActive: isLiveSensorActive,
    targetBearing: gps.targetBearing,
  });

  // Camera passthrough ONLY activates when user explicitly clicks "Launch AR Camera"
  const isArViewActive = experienceMode !== 'idle' && subView === 'ar';
  const arSession = useARSession({
    isCameraActive: isArViewActive,
    preferSpatialBackdrop: experienceMode === 'indoor-demo',
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (arSession.cameraStream) {
      videoEl.srcObject = arSession.cameraStream;
      void videoEl.play().catch(() => {
        // autoplay handled silently
      });
    } else {
      videoEl.srcObject = null;
    }
  }, [arSession.cameraStream]);

  // Unified telemetry derived from EITHER Real-World Hardware Sensors OR Indoor Demo Simulation
  const demoSimulatedCoord = useMemo(
    () =>
      offsetCoordinateByDistance(
        hunt.targetLat,
        hunt.targetLng,
        demoDistanceMeters,
        (demoTargetBearing + 180) % 360
      ),
    [hunt.targetLat, hunt.targetLng, demoDistanceMeters]
  );

  const activeCoord =
    experienceMode === 'live-real'
      ? gps.lat !== null && gps.lng !== null
        ? { lat: gps.lat, lng: gps.lng }
        : null
      : experienceMode === 'indoor-demo'
        ? demoSimulatedCoord
        : null;

  const activeAccuracy =
    experienceMode === 'live-real' ? gps.accuracy : experienceMode === 'indoor-demo' ? 6 : null;

  const activeDistanceMeters =
    experienceMode === 'live-real'
      ? gps.distanceMeters
      : experienceMode === 'indoor-demo'
        ? demoDistanceMeters
        : null;

  const activeTargetBearing =
    experienceMode === 'live-real'
      ? gps.targetBearing ?? 0
      : demoTargetBearing;

  const activeCardinal =
    experienceMode === 'live-real'
      ? gps.cardinalDirection || bearingToCardinal(activeTargetBearing)
      : bearingToCardinal(demoTargetBearing);

  const activeRelativeBearing =
    experienceMode === 'live-real'
      ? compass.relativeBearing
      : computeRelativeBearingDelta(demoTargetBearing, demoDeviceHeading);

  const activeTurnCue =
    experienceMode === 'live-real'
      ? compass.turnCue
      : relativeDeltaToCue(activeRelativeBearing);

  const insideGeofence =
    experienceMode === 'live-real'
      ? gps.insideGeofence
      : experienceMode === 'indoor-demo'
        ? demoDistanceMeters <= hunt.radiusMeters
        : false;

  const liveAccuracyTooWide =
    experienceMode === 'live-real' && activeAccuracy !== null && activeAccuracy > 25;

  const handleEnableRealWorldMode = async () => {
    setClaimError(null);
    setExperienceMode('live-real');
    if (compass.needsPermissionPrompt) {
      await compass.requestCompassPermission();
    }
  };

  const handleEnableIndoorDemo = () => {
    setClaimError(null);
    setExperienceMode('indoor-demo');
    setDemoDistanceMeters(Math.max(42, hunt.radiusMeters + 22));
  };

  const handleDisableSensors = () => {
    setSubView('radar');
    setExperienceMode('idle');
    setClaimError(null);
  };

  const handleTapToUnlock = async () => {
    if (claiming || alreadyClaimed) return;
    if (!insideGeofence || !activeCoord) {
      setClaimError(`Move inside the ${hunt.radiusMeters}m geofence before unlocking the chest.`);
      return;
    }
    if (liveAccuracyTooWide) {
      setClaimError(
        `GPS accuracy is currently ±${Math.round(activeAccuracy || 0)}m. Move to clearer sky until accuracy is <= 25m.`
      );
      return;
    }

    setClaiming(true);
    setClaimError(null);
    try {
      // 1. Server Haversine + Accuracy Gate + Oracle Ed25519 claim_geodrop Transaction
      const verifyResp = await fetch(`/api/hunts/${encodeURIComponent(hunt.id)}/verify-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hunterPubkey: walletPubkey,
          lat: activeCoord.lat,
          lng: activeCoord.lng,
          accuracy: activeAccuracy ?? 8,
          indoorSimulation: experienceMode === 'indoor-demo',
        }),
      });

      const verifyData = (await verifyResp.json()) as VerifyGeoDropClaimResponse & { error?: string };
      if (!verifyResp.ok || !verifyData.serializedTx) {
        throw new Error(verifyData.error || 'Server rejected GeoDrop location proof.');
      }

      // 2. Prompt Seeker Seed Vault / Connected Wallet Biometric/PIN signature & Devnet broadcast
      const signed = await onSignClaimTx(verifyData.serializedTx, verifyData);

      // 3. Finalize claim in GeoDrops database & decrement claimsRemaining
      const confirmResp = await fetch(`/api/hunts/${encodeURIComponent(hunt.id)}/confirm-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hunterPubkey: walletPubkey,
          claimTxSignature: signed.signature,
          oracleSignature: verifyData.oracleSignature,
        }),
      });

      const confirmData = (await confirmResp.json()) as ConfirmGeoDropClaimResponse & {
        error?: string;
      };
      if (!confirmResp.ok || !confirmData.hunt) {
        throw new Error(confirmData.error || 'Claim broadcasted but confirmation sync failed.');
      }

      setClaimReceipt(confirmData);
      onHuntUpdated(confirmData.hunt);
      onNotify(
        'success',
        'GeoDrop Chest Unlocked!',
        `+${hunt.rewardPerChest} ${hunt.tokenSymbol} verified on Solana Devnet.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to unlock GeoDrop chest.';
      setClaimError(msg);
      onNotify('error', 'Chest Unlock Failed', msg);
    } finally {
      setClaiming(false);
    }
  };

  const handleShareFlex = async () => {
    const shareText = `Just unlocked a ${hunt.rewardPerChest} ${hunt.tokenSymbol} AR GeoDrop chest at ${hunt.landmarkName} on Actake! ${
      claimReceipt?.solscanUrl ? `\nProof: ${claimReceipt.solscanUrl}` : ''
    }`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `Actake GeoDrop Unlocked — ${hunt.title}`,
          text: shareText,
          url: window.location.href,
        });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        onNotify('success', 'Flex Copied', 'Shareable GeoDrop unlock caption copied to clipboard.');
      }
    } catch {
      // User dismissed share sheet
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Hunt Session Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            handleDisableSensors();
            onBackToDirectory();
          }}
          className="min-h-[44px] px-4 rounded-full bg-white border border-[#E6D6CC] hover:border-[#111114] text-sm font-bold text-[#111114] inline-flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Hunts</span>
        </button>

        <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-[#534E4B]">
          <span>
            {hunt.rewardPerChest} {hunt.tokenSymbol} / chest
          </span>
          <span>·</span>
          <span>
            {hunt.claimsRemaining}/{hunt.totalChests} left
          </span>
        </div>
      </div>

      {/* Strict Opt-In Hardware Gate (Before Sensors Start) */}
      {experienceMode === 'idle' ? (
        <div className="rounded-[28px] bg-[#141416] text-white p-6 sm:p-8 space-y-6 shadow-[0_18px_40px_rgba(17,17,20,0.2)]">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[#F4976C]">{hunt.landmarkName}</div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
              {hunt.title}
            </h2>
            <p className="text-sm text-white/75 max-w-2xl leading-relaxed">{hunt.loreHint}</p>
          </div>

          {/* Static preview of the real-world mapped geofence (no GPS requested yet!) */}
          <GeofenceMap
            center={{ lat: hunt.targetLat, lng: hunt.targetLng }}
            targetPin={{ lat: hunt.targetLat, lng: hunt.targetLng }}
            radiusMeters={hunt.radiusMeters}
            polygonPoints={hunt.geofencePolygon}
            interactionMode="readonly"
            heightClassName="h-[220px] sm:h-[260px]"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Option A: Real-World Live Experience */}
            <div className="rounded-2xl bg-[#1D1E24] border border-white/12 p-5 flex flex-col justify-between gap-4">
              <div className="space-y-1.5">
                <div className="text-xs font-mono uppercase tracking-wider text-[#4ADE80]">
                  Real-World Experience
                </div>
                <h3 className="font-display text-lg font-bold text-white">
                  Live GPS, Compass & AR Camera
                </h3>
                <p className="text-xs text-white/70 leading-relaxed">
                  Uses your phone’s real high-accuracy GPS, magnetometer heading, and rear camera
                  to physically navigate into the mapped {hunt.radiusMeters}m geofence area.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleEnableRealWorldMode()}
                className="w-full min-h-[48px] px-5 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Navigation className="w-4 h-4" />
                <span>Enable AR & Sensor Mode</span>
              </button>
            </div>

            {/* Option B: Indoor Demo / Desktop Testing Mode */}
            <div className="rounded-2xl bg-[#1D1E24] border border-white/12 p-5 flex flex-col justify-between gap-4">
              <div className="space-y-1.5">
                <div className="text-xs font-mono uppercase tracking-wider text-[#FBBF24]">
                  Demo / Indoor Simulation
                </div>
                <h3 className="font-display text-lg font-bold text-white">
                  Indoor Test Mode (No Walking Required)
                </h3>
                <p className="text-xs text-white/70 leading-relaxed">
                  Test compass alignment, virtual walk-to-chest arrival, 3D treasure chest spawning,
                  and Solana Devnet tap-to-unlock signing directly from indoors or desktop.
                </p>
              </div>
              <button
                type="button"
                onClick={handleEnableIndoorDemo}
                className="w-full min-h-[48px] px-5 rounded-full bg-white text-[#111114] hover:bg-[#FFF4EE] text-sm font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Footprints className="w-4 h-4 text-[#F16A2E]" />
                <span>Launch Indoor Demo Mode</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-white/55 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#F4976C] shrink-0" />
            <span>
              Camera, GPS, and compass sensors remain completely off until you choose a mode above.
            </span>
          </div>
        </div>
      ) : (
        /* Active Hunt Session: Switchable between Radar HUD, Real-World Geofence Map, and Full AR 3D Chest */
        <div className="space-y-4">
          {/* Active Mode Bar + View Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white border border-[#E6D6CC] px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span
                className={
                  experienceMode === 'live-real' ? 'text-[#15803D]' : 'text-[#B45309]'
                }
              >
                {experienceMode === 'live-real'
                  ? 'Real-World Live GPS Active'
                  : 'Indoor Demo Simulation'}
              </span>
              <span className="text-[#C7BAB1]">·</span>
              <button
                type="button"
                onClick={() =>
                  experienceMode === 'live-real'
                    ? handleEnableIndoorDemo()
                    : void handleEnableRealWorldMode()
                }
                className="text-[#F16A2E] hover:underline font-bold"
              >
                {experienceMode === 'live-real'
                  ? 'Switch to Indoor Demo'
                  : 'Switch to Real-World GPS'}
              </button>
              <span className="text-[#C7BAB1]">·</span>
              <button
                type="button"
                onClick={handleDisableSensors}
                className="text-[#6B6663] hover:text-[#111114]"
              >
                Pause Sensors
              </button>
            </div>

            {/* Sub-view switcher: Radar HUD | Live Map | AR Camera */}
            <div className="inline-flex items-center p-1 rounded-full bg-[#F5ECE6] border border-[#E7D8CE]">
              <button
                type="button"
                onClick={() => setSubView('radar')}
                className={`min-h-[38px] px-3.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                  subView === 'radar'
                    ? 'bg-[#111114] text-white'
                    : 'text-[#6B6663] hover:text-[#111114]'
                }`}
              >
                <Radar className="w-3.5 h-3.5" />
                <span>Radar</span>
              </button>
              <button
                type="button"
                onClick={() => setSubView('map')}
                className={`min-h-[38px] px-3.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                  subView === 'map'
                    ? 'bg-[#111114] text-white'
                    : 'text-[#6B6663] hover:text-[#111114]'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Geofence Map</span>
              </button>
              <button
                type="button"
                onClick={() => setSubView('ar')}
                className={`min-h-[38px] px-3.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                  subView === 'ar'
                    ? 'bg-[#F16A2E] text-white'
                    : 'text-[#6B6663] hover:text-[#111114]'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>AR Camera</span>
              </button>
            </div>
          </div>

          {/* Hardware GPS Error Notice (Real-World Mode) */}
          {experienceMode === 'live-real' && gps.error && (
            <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#991B1B]">
              <div className="flex items-start gap-2.5">
                <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{gps.error}</span>
              </div>
              <button
                type="button"
                onClick={handleEnableIndoorDemo}
                className="min-h-[36px] px-3.5 rounded-full bg-[#111114] text-white font-bold shrink-0"
              >
                Use Indoor Demo
              </button>
            </div>
          )}

          {/* VIEW 1: RADAR HUD (Default Active View) */}
          {subView === 'radar' && (
            <div className="rounded-[28px] bg-[#141416] text-white p-6 sm:p-8 space-y-6 shadow-[0_18px_40px_rgba(17,17,20,0.22)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-[#F4976C]">{hunt.landmarkName}</div>
                  <h2 className="font-display text-2xl font-extrabold mt-0.5">{hunt.title}</h2>
                </div>
                <div className="text-right font-mono text-xs text-white/70 tabular-nums">
                  <div>
                    Zone: {hunt.radiusMeters}m
                    {hunt.geofencePolygon && hunt.geofencePolygon.length >= 3 ? ' + Area' : ''}
                  </div>
                  <div>
                    GPS Precision:{' '}
                    {activeAccuracy !== null ? `±${Math.round(activeAccuracy)}m` : 'Acquiring...'}
                  </div>
                </div>
              </div>

              {/* Directional Compass Dial */}
              <div className="py-4 flex flex-col items-center justify-center gap-5">
                <div className="relative w-52 h-52 sm:w-56 sm:h-56 rounded-full border border-white/15 bg-[#1B1C22] flex items-center justify-center">
                  {/* Inner Range Rings */}
                  <div className="absolute inset-5 rounded-full border border-white/10" />
                  <div className="absolute inset-11 rounded-full border border-white/10" />

                  {/* Cardinal Compass Markers */}
                  <span className="absolute top-2.5 text-[10px] font-mono font-bold text-white/50">
                    N
                  </span>
                  <span className="absolute right-3 text-[10px] font-mono font-bold text-white/50">
                    E
                  </span>
                  <span className="absolute bottom-2.5 text-[10px] font-mono font-bold text-white/50">
                    S
                  </span>
                  <span className="absolute left-3 text-[10px] font-mono font-bold text-white/50">
                    W
                  </span>

                  {/* Rotating Directional Arrow */}
                  <div
                    className="transition-transform duration-150 ease-out flex items-center justify-center"
                    style={{ transform: `rotate(${activeRelativeBearing}deg)` }}
                  >
                    <div
                      className={`w-24 h-24 rounded-full flex items-center justify-center ${
                        insideGeofence
                          ? 'bg-[#16A34A]/20 border border-[#4ADE80]/60'
                          : 'bg-[#F16A2E]/18 border border-[#F16A2E]/60'
                      }`}
                    >
                      <Navigation
                        className={`w-11 h-11 ${
                          insideGeofence ? 'text-[#4ADE80]' : 'text-[#F16A2E]'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Live Meter Countdown + Cardinal Instruction */}
                <div className="text-center space-y-1">
                  <div className="font-display text-3xl sm:text-4xl font-extrabold tabular-nums">
                    {activeDistanceMeters !== null
                      ? insideGeofence
                        ? `Inside Geofence (${formatDistanceLabel(activeDistanceMeters)})`
                        : `${formatDistanceLabel(activeDistanceMeters)} away`
                      : 'Acquiring GPS Lock...'}
                  </div>
                  <div className="text-sm font-medium text-white/75">
                    {insideGeofence
                      ? 'Treasure chest is in range — Launch AR Camera to see & unlock it!'
                      : `Walk ${activeCardinal} · ${activeTurnCue}`}
                  </div>
                </div>
              </div>

              {/* Indoor Demo Walk & Heading Controls (Only visible in Indoor Demo Mode) */}
              {experienceMode === 'indoor-demo' && (
                <div className="rounded-2xl bg-[#1D1E24] border border-white/10 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="space-y-1.5 block">
                    <div className="flex justify-between text-xs font-mono text-white/80 tabular-nums">
                      <span>Simulate Walk Distance</span>
                      <span className={insideGeofence ? 'text-[#4ADE80] font-bold' : ''}>
                        {demoDistanceMeters}m (Zone ≤ {hunt.radiusMeters}m)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={demoDistanceMeters}
                      onChange={(e) => setDemoDistanceMeters(Number(e.target.value))}
                      className="w-full accent-[#F16A2E] cursor-pointer"
                    />
                  </label>

                  <label className="space-y-1.5 block">
                    <div className="flex justify-between text-xs font-mono text-white/80 tabular-nums">
                      <span>Simulate Phone Compass Heading</span>
                      <span>{demoDeviceHeading}°</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={359}
                      step={1}
                      value={demoDeviceHeading}
                      onChange={(e) => setDemoDeviceHeading(Number(e.target.value))}
                      className="w-full accent-[#4ADE80] cursor-pointer"
                    />
                  </label>
                </div>
              )}

              {/* Bottom Thumb-Zone Primary Action */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setSubView('ar')}
                  className="flex-1 min-h-[52px] px-6 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  <span>
                    {insideGeofence ? 'Launch AR Camera & Unlock Chest' : 'Launch AR Camera'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubView('map')}
                  className="min-h-[52px] px-5 rounded-full bg-[#24252D] hover:bg-[#2E303A] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <MapIcon className="w-4 h-4" />
                  <span>View Geofence Map</span>
                </button>
              </div>
            </div>
          )}

          {/* VIEW 2: REAL-WORLD GEOFENCE MAP VIEW */}
          {subView === 'map' && (
            <div className="actake-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-extrabold text-[#111114]">
                    Live Geofence Area Map
                  </h3>
                  <p className="text-xs text-[#6B6663]">
                    Blue dot tracks your{' '}
                    {experienceMode === 'live-real' ? 'real-world GPS position' : 'simulated demo walk'}{' '}
                    against the mapped geofence boundary.
                  </p>
                </div>
                <div className="font-mono text-xs font-bold tabular-nums text-[#111114]">
                  {activeDistanceMeters !== null
                    ? `${formatDistanceLabel(activeDistanceMeters)} to chest`
                    : 'Locating...'}
                </div>
              </div>

              <GeofenceMap
                center={{ lat: hunt.targetLat, lng: hunt.targetLng }}
                targetPin={{ lat: hunt.targetLat, lng: hunt.targetLng }}
                radiusMeters={hunt.radiusMeters}
                polygonPoints={hunt.geofencePolygon}
                userLocation={activeCoord}
                userAccuracyMeters={activeAccuracy}
                insideGeofence={insideGeofence}
                interactionMode="readonly"
                heightClassName="h-[340px] sm:h-[400px]"
              />

              {experienceMode === 'indoor-demo' && (
                <label className="block space-y-1.5 rounded-2xl bg-[#FFF6F0] border border-[#F2DACB] p-4">
                  <div className="flex justify-between text-xs font-bold text-[#111114] tabular-nums">
                    <span>Walk Toward Mapped Geofence (Indoor Demo)</span>
                    <span className="font-mono">{demoDistanceMeters}m</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={demoDistanceMeters}
                    onChange={(e) => setDemoDistanceMeters(Number(e.target.value))}
                    className="w-full accent-[#16A34A] cursor-pointer"
                  />
                </label>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setSubView('ar')}
                  className="flex-1 min-h-[48px] px-5 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  <span>Open AR 3D Chest View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubView('radar')}
                  className="min-h-[48px] px-5 rounded-full bg-[#111114] text-white text-sm font-bold flex items-center justify-center gap-2"
                >
                  <Compass className="w-4 h-4" />
                  <span>Compass Radar</span>
                </button>
              </div>
            </div>
          )}

          {/* VIEW 3: FULL-BLEED AR CAMERA + FLOATING 3D CHEST OVERLAY */}
          {subView === 'ar' && (
            <div className="relative rounded-[28px] overflow-hidden bg-[#0E1015] border border-[#232530] h-[540px] sm:h-[600px] shadow-2xl">
              {/* Background Layer 1: Live Rear Camera Passthrough OR Nocturnal Spatial Grid Backdrop */}
              {arSession.mode === 'camera-passthrough' ? (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(circle at 50% 38%, rgba(241,106,46,0.22) 0%, rgba(16,185,129,0.08) 38%, #0B0D12 78%)',
                  }}
                />
              )}

              {/* Foreground Layer 2: Transparent Three.js 3D Treasure Chest Canvas */}
              <div className="absolute inset-0 z-10">
                <ChestModel
                  relativeBearing={activeRelativeBearing}
                  insideGeofence={insideGeofence}
                  tokenSymbol={hunt.tokenSymbol}
                  unlocking={claiming}
                  unlocked={alreadyClaimed}
                  onTapChest={() => void handleTapToUnlock()}
                />
              </div>

              {/* Minimal Top-Left Corner Telemetry (NO backdrop-filter over WebGL!) */}
              <div className="absolute top-4 left-4 right-4 z-20 flex items-start justify-between gap-3 pointer-events-none">
                <div className="rounded-2xl bg-[#141416]/92 border border-white/15 px-3.5 py-2.5 text-white pointer-events-auto">
                  <div className="text-xs font-bold leading-tight">{hunt.title}</div>
                  <div className="font-mono text-[11px] text-white/75 tabular-nums mt-0.5">
                    {activeDistanceMeters !== null
                      ? `${formatDistanceLabel(activeDistanceMeters)} · ${activeTurnCue}`
                      : 'Acquiring GPS...'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSubView('radar')}
                  className="min-h-[42px] px-3.5 rounded-full bg-[#141416]/92 border border-white/15 text-white text-xs font-bold pointer-events-auto hover:bg-[#1E2028] transition-colors"
                >
                  Exit AR
                </button>
              </div>

              {/* Collapsible Bottom Control Dock (Zero backdrop-filter; keeps central 3D chest 100% clear) */}
              <div className="absolute bottom-3 left-3 right-3 z-20">
                <div className="rounded-2xl bg-[#141416]/95 border border-white/15 text-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDockExpanded((v) => !v)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-white/85 hover:bg-white/5"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-[#F4976C]" />
                      {alreadyClaimed
                        ? `Unlocked +${hunt.rewardPerChest} ${hunt.tokenSymbol}`
                        : insideGeofence
                          ? 'Chest in Range — Tap 3D Chest to Unlock'
                          : `Walk ${formatDistanceLabel(activeDistanceMeters)} Closer (${hunt.radiusMeters}m Zone)`}
                    </span>
                    {dockExpanded ? (
                      <ChevronDown className="w-4 h-4 text-white/60" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-white/60" />
                    )}
                  </button>

                  {dockExpanded && (
                    <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/10">
                      {arSession.cameraError && (
                        <div className="text-[11px] text-amber-300">{arSession.cameraError}</div>
                      )}

                      {liveAccuracyTooWide && (
                        <div className="text-[11px] text-amber-300">
                          GPS accuracy is ±{Math.round(activeAccuracy || 0)}m (requires ≤ 25m for live claim).
                        </div>
                      )}

                      {claimError && (
                        <div className="text-xs text-red-300 bg-red-950/70 border border-red-500/30 rounded-xl px-3 py-2">
                          {claimError}
                        </div>
                      )}

                      {/* Indoor Demo Sliders tucked neatly inside the collapsible bottom dock */}
                      {experienceMode === 'indoor-demo' && !alreadyClaimed && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <label className="block space-y-1">
                            <div className="flex justify-between text-[11px] font-mono text-white/75 tabular-nums">
                              <span>Demo Distance</span>
                              <span>{demoDistanceMeters}m</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={90}
                              step={1}
                              value={demoDistanceMeters}
                              onChange={(e) => setDemoDistanceMeters(Number(e.target.value))}
                              className="w-full accent-[#F16A2E] cursor-pointer"
                            />
                          </label>
                          <label className="block space-y-1">
                            <div className="flex justify-between text-[11px] font-mono text-white/75 tabular-nums">
                              <span>Compass Pan</span>
                              <span>{activeRelativeBearing > 0 ? `+${Math.round(activeRelativeBearing)}°` : `${Math.round(activeRelativeBearing)}°`}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={359}
                              step={1}
                              value={demoDeviceHeading}
                              onChange={(e) => setDemoDeviceHeading(Number(e.target.value))}
                              className="w-full accent-[#4ADE80] cursor-pointer"
                            />
                          </label>
                        </div>
                      )}

                      {/* Primary Unlock OR Post-Claim Celebration Actions */}
                      {alreadyClaimed ? (
                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <button
                            type="button"
                            onClick={() => void handleShareFlex()}
                            className="flex-1 min-h-[46px] px-5 rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                          >
                            <Share2 className="w-4 h-4" />
                            <span>Share Clip / Flex</span>
                          </button>
                          {claimReceipt?.solscanUrl && (
                            <a
                              href={claimReceipt.solscanUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[46px] px-5 rounded-full bg-white/12 hover:bg-white/20 text-white text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <span>Solscan Proof</span>
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!insideGeofence || claiming || liveAccuracyTooWide}
                          onClick={() => void handleTapToUnlock()}
                          className="w-full min-h-[48px] px-5 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] disabled:bg-white/12 disabled:text-white/50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                          {claiming ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Signing Claim with Wallet...</span>
                            </>
                          ) : insideGeofence ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>
                                Tap to Unlock +{hunt.rewardPerChest} {hunt.tokenSymbol}
                              </span>
                            </>
                          ) : (
                            <span>
                              Move Within {hunt.radiusMeters}m to Unlock Chest
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
