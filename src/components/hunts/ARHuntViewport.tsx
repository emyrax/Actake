import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Crosshair,
  ExternalLink,
  Footprints,
  HelpCircle,
  Lightbulb,
  Loader2,
  Map as MapIcon,
  Navigation,
  Radar,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WifiOff,
  X,
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
import { HuntAiGuideDrawer } from './HuntAiGuideDrawer';

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
type ActiveSubView = 'map' | 'radar' | 'ar';

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
  // Full-screen Map is the primary view by default!
  const [subView, setSubView] = useState<ActiveSubView>('map');

  // Everything except the full-screen map & quick welcome guide pop-up starts COLLAPSED by default
  const [showGuidePopup, setShowGuidePopup] = useState(true);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [hintExpanded, setHintExpanded] = useState(false);
  const [demoControlsExpanded, setDemoControlsExpanded] = useState(false);
  const [arDockExpanded, setArDockExpanded] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);

  // Conversational AI Scout drawer
  const [aiGuideOpen, setAiGuideOpen] = useState(false);
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string | null>(null);

  // Indoor Demo Mode simulation controls (never touches hardware GPS/magnetometer)
  const [demoDistanceMeters, setDemoDistanceMeters] = useState<number>(
    Math.max(42, hunt.radiusMeters + 22)
  );
  const [demoDeviceHeading, setDemoDeviceHeading] = useState<number>(35);
  const demoTargetBearing = 45;

  // Claim flow state
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimReceipt, setClaimReceipt] = useState<ConfirmGeoDropClaimResponse | null>(null);

  const alreadyClaimed = hunt.claimedBy.includes(walletPubkey) || claimReceipt !== null;
  const isCustomBrandDrop = Boolean(hunt.arAsset && hunt.arAsset.kind !== 'chest');
  const dropNoun = isCustomBrandDrop
    ? hunt.arAsset?.brandName || hunt.arAsset?.aiBlueprint?.title || '3D Brand Drop'
    : 'AR Chest';

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

  // Unified isSensorActive gate on useARSession; rear camera only opens in AR view
  const isArViewActive = experienceMode !== 'idle' && subView === 'ar';
  const arSession = useARSession({
    isSensorActive: experienceMode !== 'idle',
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
    experienceMode === 'live-real' ? gps.targetBearing ?? 0 : demoTargetBearing;

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
    setShowGuidePopup(false);
    setInfoExpanded(false);
    setHintExpanded(false);
    setExperienceMode('live-real');
    setSubView('map');
    setRecenterSignal((n) => n + 1);
    if (compass.needsPermissionPrompt) {
      await compass.requestCompassPermission();
    }
  };

  const handleEnableIndoorDemo = () => {
    setClaimError(null);
    setShowGuidePopup(false);
    setInfoExpanded(false);
    setHintExpanded(false);
    setExperienceMode('indoor-demo');
    setSubView('map');
    setDemoDistanceMeters(Math.max(42, hunt.radiusMeters + 22));
    setRecenterSignal((n) => n + 1);
  };

  const handleDisableSensors = () => {
    setSubView('map');
    setExperienceMode('idle');
    setClaimError(null);
    setDemoControlsExpanded(false);
  };

  const handleOpenAiWithPrompt = (prompt?: string) => {
    setHintExpanded(false);
    setInfoExpanded(false);
    setShowGuidePopup(false);
    if (prompt) {
      setPendingAiPrompt(prompt);
    }
    setAiGuideOpen(true);
  };

  const handleTapToUnlock = async () => {
    if (claiming || alreadyClaimed) return;
    if (!insideGeofence || !activeCoord) {
      setClaimError(`Move inside the ${hunt.radiusMeters}m geofence before unlocking.`);
      setArDockExpanded(true);
      return;
    }
    if (liveAccuracyTooWide) {
      setClaimError(
        `GPS accuracy is currently ±${Math.round(activeAccuracy || 0)}m. Move to clearer sky until accuracy is <= 25m.`
      );
      setArDockExpanded(true);
      return;
    }

    setClaiming(true);
    setClaimError(null);
    try {
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

      const signed = await onSignClaimTx(verifyData.serializedTx, verifyData);

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
      setArDockExpanded(true);
      onHuntUpdated(confirmData.hunt);
      onNotify(
        'success',
        `${dropNoun} Unlocked!`,
        `+${hunt.rewardPerChest} ${hunt.tokenSymbol} verified on Solana Devnet.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to unlock GeoDrop.';
      setClaimError(msg);
      setArDockExpanded(true);
      onNotify('error', 'Unlock Failed', msg);
    } finally {
      setClaiming(false);
    }
  };

  const handleShareFlex = async () => {
    const shareText = `Just unlocked a ${hunt.rewardPerChest} ${hunt.tokenSymbol} AR GeoDrop at ${hunt.landmarkName} on Actake! ${
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

  const showingFullScreenMap = experienceMode === 'idle' || subView === 'map';

  const statusLine =
    experienceMode === 'idle'
      ? `${hunt.radiusMeters}m zone · ${hunt.rewardPerChest} ${hunt.tokenSymbol}`
      : activeDistanceMeters !== null
        ? insideGeofence
          ? `Inside Zone (${formatDistanceLabel(activeDistanceMeters)})`
          : `${formatDistanceLabel(activeDistanceMeters)} · ${activeCardinal}`
        : 'Acquiring GPS...';

  return (
    <div className="fixed inset-0 z-50 bg-[#0E1015] overflow-hidden select-none">
      {/* ==================================================================== */}
      {/* FULL-SCREEN CANVAS LAYER (100vw × 100dvh)                             */}
      {/* ==================================================================== */}

      {/* LAYER A: FULL-SCREEN INTERACTIVE MAP (Idle Preview + Active Live Map) */}
      {showingFullScreenMap && (
        <div className="absolute inset-0 z-0">
          <GeofenceMap
            center={{ lat: hunt.targetLat, lng: hunt.targetLng }}
            targetPin={{ lat: hunt.targetLat, lng: hunt.targetLng }}
            radiusMeters={hunt.radiusMeters}
            polygonPoints={hunt.geofencePolygon}
            userLocation={activeCoord}
            userAccuracyMeters={activeAccuracy}
            insideGeofence={insideGeofence}
            interactionMode="readonly"
            variant="fullscreen"
            recenterSignal={recenterSignal}
          />
        </div>
      )}

      {/* LAYER B: FULL-SCREEN COMPASS RADAR HUD */}
      {experienceMode !== 'idle' && subView === 'radar' && (
        <div className="absolute inset-0 z-0 bg-[#121318] text-white flex flex-col items-center justify-center px-6 pb-20 pt-16">
          <div className="flex flex-col items-center justify-center gap-6">
            <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-full border border-white/15 bg-[#191B22] flex items-center justify-center">
              <div className="absolute inset-5 rounded-full border border-white/10" />
              <div className="absolute inset-12 rounded-full border border-white/10" />
              <span className="absolute top-3 text-[10px] font-mono font-bold text-white/50">N</span>
              <span className="absolute right-3.5 text-[10px] font-mono font-bold text-white/50">E</span>
              <span className="absolute bottom-3 text-[10px] font-mono font-bold text-white/50">S</span>
              <span className="absolute left-3.5 text-[10px] font-mono font-bold text-white/50">W</span>

              <div
                className="transition-transform duration-150 ease-out flex items-center justify-center"
                style={{ transform: `rotate(${activeRelativeBearing}deg)` }}
              >
                <div
                  className={`w-24 h-24 rounded-full flex items-center justify-center ${
                    insideGeofence
                      ? 'bg-[#16A34A]/22 border border-[#4ADE80]/60'
                      : 'bg-[#F16A2E]/20 border border-[#F16A2E]/60'
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

            <div className="text-center space-y-1.5 max-w-xs">
              <div className="font-display text-3xl sm:text-4xl font-extrabold tabular-nums">
                {activeDistanceMeters !== null
                  ? insideGeofence
                    ? `Inside Zone (${formatDistanceLabel(activeDistanceMeters)})`
                    : `${formatDistanceLabel(activeDistanceMeters)} away`
                  : 'Acquiring GPS...'}
              </div>
              <div className="text-sm font-medium text-white/75">
                {insideGeofence
                  ? `${dropNoun} is right here — open AR Camera to unlock!`
                  : `Walk ${activeCardinal} · ${activeTurnCue}`}
              </div>
            </div>

            {insideGeofence && (
              <button
                type="button"
                onClick={() => setSubView('ar')}
                className="min-h-[48px] px-6 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-sm font-bold inline-flex items-center gap-2 shadow-lg transition-colors"
              >
                <Camera className="w-4 h-4" />
                <span>Open AR & Unlock</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* LAYER C: FULL-SCREEN AR CAMERA + THREE.JS 3D DROP (Zero backdrop-filter over WebGL!) */}
      {experienceMode !== 'idle' && subView === 'ar' && (
        <div className="absolute inset-0 z-0 bg-[#0B0D12]">
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

          <div className="absolute inset-0 z-10">
            <ChestModel
              relativeBearing={activeRelativeBearing}
              insideGeofence={insideGeofence}
              tokenSymbol={hunt.tokenSymbol}
              arAsset={hunt.arAsset}
              unlocking={claiming}
              unlocked={alreadyClaimed}
              onTapChest={() => void handleTapToUnlock()}
            />
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MINIMAL TOP FLOATING BAR (Always compact; all write-ups collapsed!)   */}
      {/* ==================================================================== */}
      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 min-w-0 pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              handleDisableSensors();
              onBackToDirectory();
            }}
            aria-label="Back to All Hunts"
            className="w-11 h-11 rounded-full bg-[#141519]/92 border border-white/15 text-white hover:bg-[#1F2128] flex items-center justify-center shadow-lg transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Compact Hunt Title & Live Distance Trigger -> Toggles Collapsible Hunt Info Drawer */}
          <button
            type="button"
            onClick={() => {
              setHintExpanded(false);
              setInfoExpanded((v) => !v);
            }}
            aria-expanded={infoExpanded}
            className="min-h-[44px] max-w-[225px] sm:max-w-[320px] px-3.5 py-1.5 rounded-full bg-[#141519]/92 border border-white/15 text-white hover:bg-[#1F2128] flex items-center gap-2 shadow-lg transition-colors text-left"
          >
            <div className="min-w-0">
              <div className="text-xs font-bold leading-tight truncate">{hunt.title}</div>
              <div className="text-[11px] font-mono text-white/75 tabular-nums truncate">
                {statusLine}
              </div>
            </div>
            {infoExpanded ? (
              <ChevronUp className="w-4 h-4 text-white/65 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-white/65 shrink-0" />
            )}
          </button>
        </div>

        {/* Right Top Action: Quick Guide Pop-up Trigger */}
        <div className="flex items-center gap-2 pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              setInfoExpanded(false);
              setHintExpanded(false);
              setShowGuidePopup(true);
            }}
            aria-label="Open Hunt Guide"
            className="w-11 h-11 rounded-full bg-[#141519]/92 border border-white/15 text-white hover:bg-[#1F2128] flex items-center justify-center shadow-lg transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* COLLAPSIBLE HUNT INFO & WRITE-UP DRAWER (Collapsed by default!)      */}
      {/* ==================================================================== */}
      {infoExpanded && (
        <div className="absolute top-[66px] left-3 right-3 sm:left-4 sm:right-auto sm:w-[370px] z-30 rounded-[22px] bg-[#141519]/96 border border-white/15 text-white p-4 shadow-2xl space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-[#F4976C] truncate">
                {hunt.landmarkName}
              </div>
              <h2 className="font-display text-lg font-extrabold leading-snug">{hunt.title}</h2>
            </div>
            <button
              type="button"
              onClick={() => setInfoExpanded(false)}
              aria-label="Collapse hunt details"
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-white/80 leading-relaxed">{hunt.loreHint}</p>

          <div className="pt-2.5 border-t border-white/10 grid grid-cols-3 gap-2 text-center font-mono text-[11px] tabular-nums">
            <div className="rounded-xl bg-white/6 py-2 px-1.5">
              <div className="text-white/55">Reward</div>
              <div className="font-bold text-white mt-0.5">
                {hunt.rewardPerChest} {hunt.tokenSymbol}
              </div>
            </div>
            <div className="rounded-xl bg-white/6 py-2 px-1.5">
              <div className="text-white/55">Drops Left</div>
              <div className="font-bold text-white mt-0.5">
                {hunt.claimsRemaining}/{hunt.totalChests}
              </div>
            </div>
            <div className="rounded-xl bg-white/6 py-2 px-1.5">
              <div className="text-white/55">Precision</div>
              <div className="font-bold text-white mt-0.5">
                {activeAccuracy !== null ? `±${Math.round(activeAccuracy)}m` : `${hunt.radiusMeters}m`}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {experienceMode === 'live-real' ? (
              <button
                type="button"
                onClick={handleEnableIndoorDemo}
                className="flex-1 min-h-[40px] px-3 rounded-full bg-white/12 hover:bg-white/20 text-xs font-bold text-white transition-colors"
              >
                Switch to Indoor Demo
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleEnableRealWorldMode()}
                className="flex-1 min-h-[40px] px-3 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-xs font-bold text-white transition-colors"
              >
                Enable Live GPS & AR
              </button>
            )}

            {experienceMode !== 'idle' && (
              <button
                type="button"
                onClick={handleDisableSensors}
                className="min-h-[40px] px-3.5 rounded-full bg-white/10 hover:bg-white/18 text-xs font-semibold text-white/80 transition-colors"
              >
                Pause Sensors
              </button>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* COLLAPSIBLE MAP HINT POPOVER (Collapsed by default until clicked!)    */}
      {/* ==================================================================== */}
      {hintExpanded && (
        <div className="absolute right-3 bottom-[164px] sm:bottom-[170px] z-30 w-[calc(100%-24px)] max-w-[320px] rounded-[22px] bg-[#141519]/96 border border-white/15 text-white p-4 shadow-2xl space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FBBF24]">
              <Lightbulb className="w-4 h-4" />
              <span>Map Clue & Hint</span>
            </div>
            <button
              type="button"
              onClick={() => setHintExpanded(false)}
              aria-label="Close hint"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-semibold text-[#F4976C]">{hunt.landmarkName}</div>
            <p className="text-xs text-white/85 leading-relaxed">{hunt.loreHint}</p>
          </div>

          <button
            type="button"
            onClick={() =>
              handleOpenAiWithPrompt(
                'Give me a helpful directional hint and tip to find this hunt faster.'
              )
            }
            className="w-full min-h-[42px] px-4 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <span aria-hidden="true">🤖</span>
            <span>Talk to AI Scout for More Tips</span>
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* COMPACT GPS ERROR BANNER (Only if live GPS fails)                    */}
      {/* ==================================================================== */}
      {experienceMode === 'live-real' && gps.error && !infoExpanded && (
        <div className="absolute top-[66px] left-3 right-3 z-20 rounded-2xl bg-[#7F1D1D]/95 border border-red-400/40 px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-xs text-red-100 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span className="truncate">{gps.error}</span>
          </div>
          <button
            type="button"
            onClick={handleEnableIndoorDemo}
            className="min-h-[34px] px-3 rounded-full bg-white text-[#111114] text-[11px] font-bold shrink-0"
          >
            Indoor Demo
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* RIGHT-SIDE FLOATING MAP CONTROLS: Recenter, Hint 💡, and AI Emoji 🤖  */}
      {/* ==================================================================== */}
      <div className="absolute right-3 bottom-[84px] sm:bottom-[92px] z-30 flex flex-col items-center gap-2.5">
        {showingFullScreenMap && (
          <button
            type="button"
            onClick={() => setRecenterSignal((n) => n + 1)}
            aria-label="Recenter map on hunt zone"
            className="w-11 h-11 rounded-full bg-[#141519]/92 border border-white/15 text-white hover:bg-[#1F2128] flex items-center justify-center shadow-lg transition-colors"
          >
            <Crosshair className="w-4 h-4 text-[#F4976C]" />
          </button>
        )}

        {/* Map-side Hint Button (collapsed by default) */}
        <button
          type="button"
          onClick={() => {
            setInfoExpanded(false);
            setHintExpanded((v) => !v);
          }}
          aria-label="Show hunt hint"
          aria-expanded={hintExpanded}
          className={`w-11 h-11 rounded-full border flex items-center justify-center shadow-lg transition-colors ${
            hintExpanded
              ? 'bg-[#FBBF24] border-[#FDE68A] text-[#111114]'
              : 'bg-[#141519]/92 border-white/15 text-[#FBBF24] hover:bg-[#1F2128]'
          }`}
        >
          <Lightbulb className="w-4 h-4" />
        </button>

        {/* AI Scout Emoji Trigger Button (Talks & gives tips!) */}
        <button
          type="button"
          onClick={() => handleOpenAiWithPrompt()}
          aria-label="Open AI Hunt Scout voice assistant"
          className="w-[52px] h-[52px] rounded-full bg-[#141519]/95 border-2 border-[#F16A2E] hover:bg-[#1E2028] flex items-center justify-center text-2xl shadow-[0_10px_28px_rgba(241,106,46,0.42)] active:scale-95 transition-transform"
        >
          <span role="img" aria-hidden="true">
            🤖
          </span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* COLLAPSIBLE INDOOR DEMO SLIDERS DRAWER (Collapsed by default!)        */}
      {/* ==================================================================== */}
      {experienceMode === 'indoor-demo' && demoControlsExpanded && subView !== 'ar' && (
        <div className="absolute left-3 right-[76px] bottom-[84px] sm:bottom-[92px] sm:max-w-md z-30 rounded-[22px] bg-[#141519]/96 border border-white/15 text-white p-4 shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#FBBF24]">Indoor Demo Controls</span>
            <button
              type="button"
              onClick={() => setDemoControlsExpanded(false)}
              aria-label="Close demo sliders"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <label className="block space-y-1">
            <div className="flex justify-between text-[11px] font-mono text-white/80 tabular-nums">
              <span>Walk Distance</span>
              <span className={insideGeofence ? 'text-[#4ADE80] font-bold' : ''}>
                {demoDistanceMeters}m (≤ {hunt.radiusMeters}m)
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

          <label className="block space-y-1">
            <div className="flex justify-between text-[11px] font-mono text-white/80 tabular-nums">
              <span>Compass Heading</span>
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

      {/* ==================================================================== */}
      {/* BOTTOM FLOATING BAR (Compact thumb zone, <= 15% mobile viewport!)     */}
      {/* ==================================================================== */}
      {experienceMode === 'idle' ? (
        <div className="absolute bottom-3 left-3 right-3 z-30 flex justify-center pointer-events-none">
          <div className="pointer-events-auto w-full max-w-md rounded-full bg-[#141519]/95 border border-white/15 p-1.5 shadow-2xl flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleEnableRealWorldMode()}
              className="flex-1 min-h-[46px] px-4 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors"
            >
              <Navigation className="w-4 h-4 shrink-0" />
              <span>Enable AR & Sensor Mode</span>
            </button>

            <button
              type="button"
              onClick={handleEnableIndoorDemo}
              className="min-h-[46px] px-4 rounded-full bg-white text-[#111114] hover:bg-[#FFF4EE] text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Footprints className="w-3.5 h-3.5 text-[#F16A2E]" />
              <span>Demo</span>
            </button>
          </div>
        </div>
      ) : subView === 'ar' ? (
        /* Collapsible AR Camera Bottom Dock (Collapsed by default! Zero backdrop-filter!) */
        <div className="absolute bottom-3 left-3 right-3 z-30 flex justify-center">
          <div className="w-full max-w-lg rounded-[22px] bg-[#141519]/96 border border-white/15 text-white overflow-hidden shadow-2xl">
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setArDockExpanded((v) => !v)}
                className="flex-1 min-h-[40px] flex items-center gap-2 text-left text-xs font-bold text-white/90 min-w-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#F4976C] shrink-0" />
                <span className="truncate">
                  {alreadyClaimed
                    ? `Unlocked +${hunt.rewardPerChest} ${hunt.tokenSymbol}`
                    : insideGeofence
                      ? `Tap ${dropNoun} to Unlock`
                      : `Walk ${formatDistanceLabel(activeDistanceMeters)} closer`}
                </span>
                {arDockExpanded ? (
                  <ChevronDown className="w-4 h-4 text-white/60 shrink-0 ml-auto" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-white/60 shrink-0 ml-auto" />
                )}
              </button>

              {!alreadyClaimed && insideGeofence && (
                <button
                  type="button"
                  disabled={claiming || liveAccuracyTooWide}
                  onClick={() => void handleTapToUnlock()}
                  className="min-h-[40px] px-3.5 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] disabled:bg-white/15 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
                >
                  {claiming ? 'Signing...' : 'Unlock'}
                </button>
              )}

              <button
                type="button"
                onClick={() => setSubView('map')}
                className="min-h-[40px] px-3 rounded-full bg-white/12 hover:bg-white/20 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
              >
                Map
              </button>
            </div>

            {arDockExpanded && (
              <div className="px-4 pb-4 pt-2 space-y-3 border-t border-white/10">
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
                        <span>
                          {activeRelativeBearing > 0
                            ? `+${Math.round(activeRelativeBearing)}°`
                            : `${Math.round(activeRelativeBearing)}°`}
                        </span>
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

                {alreadyClaimed ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => void handleShareFlex()}
                      className="flex-1 min-h-[44px] px-4 rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Share Clip / Flex</span>
                    </button>
                    {claimReceipt?.solscanUrl && (
                      <a
                        href={claimReceipt.solscanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[44px] px-4 rounded-full bg-white/12 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Solscan Proof</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!insideGeofence || claiming || liveAccuracyTooWide}
                    onClick={() => void handleTapToUnlock()}
                    className="w-full min-h-[46px] px-5 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] disabled:bg-white/12 disabled:text-white/50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
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
                      <span>Move Within {hunt.radiusMeters}m to Unlock</span>
                    )}
                  </button>
                )}

                <div className="flex items-center justify-between pt-1 text-[11px] text-white/60">
                  <button
                    type="button"
                    onClick={() => setSubView('radar')}
                    className="hover:text-white inline-flex items-center gap-1"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Compass Radar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubView('map')}
                    className="hover:text-white inline-flex items-center gap-1"
                  >
                    <MapIcon className="w-3.5 h-3.5" />
                    <span>Full-Screen Map</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Active Map & Radar Floating Bottom Switcher */
        <div className="absolute bottom-3 left-3 right-3 z-30 flex justify-center pointer-events-none">
          <div className="pointer-events-auto rounded-full bg-[#141519]/95 border border-white/15 p-1.5 shadow-2xl flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSubView('map')}
              className={`min-h-[44px] px-4 rounded-full text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                subView === 'map'
                  ? 'bg-white text-[#111114]'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map</span>
            </button>

            <button
              type="button"
              onClick={() => setSubView('radar')}
              className={`min-h-[44px] px-4 rounded-full text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                subView === 'radar'
                  ? 'bg-white text-[#111114]'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              <Radar className="w-3.5 h-3.5" />
              <span>Radar</span>
            </button>

            <button
              type="button"
              onClick={() => setSubView('ar')}
              className={`min-h-[44px] px-4 rounded-full text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                insideGeofence
                  ? 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                  : 'bg-[#F16A2E] hover:bg-[#DC5A20] text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{insideGeofence ? 'Unlock AR' : 'AR'}</span>
            </button>

            {experienceMode === 'indoor-demo' && (
              <button
                type="button"
                onClick={() => setDemoControlsExpanded((v) => !v)}
                aria-label="Toggle indoor demo walk controls"
                aria-expanded={demoControlsExpanded}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                  demoControlsExpanded
                    ? 'bg-[#FBBF24] text-[#111114]'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* WELCOME GUIDE POP-UP (Appears on map entry; dismissible anytime!)     */}
      {/* ==================================================================== */}
      {showGuidePopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="GeoDrop Hunt Guide"
          onClick={() => setShowGuidePopup(false)}
          className="fixed inset-0 z-[60] bg-black/45 flex items-end sm:items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[26px] bg-[#141519]/98 border border-white/15 text-white p-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)] space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-[#F4976C] truncate">
                  {hunt.landmarkName} · {hunt.rewardPerChest} {hunt.tokenSymbol} / drop
                </div>
                <h2 className="font-display text-xl font-extrabold leading-snug mt-0.5">
                  {hunt.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowGuidePopup(false)}
                aria-label="Close guide popup"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-white/85">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#F16A2E]/25 text-[#F4976C] font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <p className="leading-relaxed">
                  Follow the full-screen map into the highlighted{' '}
                  <strong className="text-white">{hunt.radiusMeters}m geofence</strong>. Tap{' '}
                  <strong className="text-white">💡</strong> for clues or{' '}
                  <strong className="text-white">🤖</strong> to talk with your AI Scout.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#16A34A]/25 text-[#4ADE80] font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <p className="leading-relaxed">
                  Once inside the zone, switch to <strong className="text-white">AR Camera</strong>{' '}
                  and tap the floating <strong className="text-white">{dropNoun}</strong> to unlock
                  your reward on Solana Devnet.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => void handleEnableRealWorldMode()}
                className="w-full min-h-[48px] px-5 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Navigation className="w-4 h-4" />
                <span>Enable AR & Sensor Mode</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleEnableIndoorDemo}
                  className="min-h-[44px] px-4 rounded-full bg-white text-[#111114] hover:bg-[#FFF4EE] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Footprints className="w-3.5 h-3.5 text-[#F16A2E]" />
                  <span>Indoor Demo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGuidePopup(false)}
                  className="min-h-[44px] px-4 rounded-full bg-white/10 hover:bg-white/18 text-white text-xs font-bold flex items-center justify-center transition-colors"
                >
                  Explore Map
                </button>
              </div>
            </div>

            <div className="text-[11px] text-white/50 flex items-center gap-1.5 pt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#F4976C] shrink-0" />
              <span>Camera, GPS & compass stay off until you enable them.</span>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* CONVERSATIONAL TALKING AI HUNT SCOUT DRAWER (🤖)                      */}
      {/* ==================================================================== */}
      <HuntAiGuideDrawer
        open={aiGuideOpen}
        onClose={() => setAiGuideOpen(false)}
        hunt={hunt}
        distanceMeters={activeDistanceMeters}
        cardinalDirection={activeCardinal}
        turnCue={activeTurnCue}
        insideGeofence={insideGeofence}
        experienceMode={experienceMode}
        pendingPrompt={pendingAiPrompt}
        onPendingPromptConsumed={() => setPendingAiPrompt(null)}
      />
    </div>
  );
};
