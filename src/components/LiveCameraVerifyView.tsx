import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { RandomizedTargetPrompt, StakeCommitment, VerificationResult } from '../types/actake';
import { BrandMark } from './BrandMark';

interface LiveCameraVerifyViewProps {
  stake: StakeCommitment;
  challenge: RandomizedTargetPrompt;
  walletPublicKey: string;
  poolId?: string;
  strictMode: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
  onVerified: (result: VerificationResult, durationMs: number) => Promise<void>;
}

export const LiveCameraVerifyView: React.FC<LiveCameraVerifyViewProps> = ({
  stake,
  challenge,
  walletPublicKey,
  poolId,
  strictMode,
  muted,
  onToggleMute,
  onExit,
  onVerified,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [signingEscrow, setSigningEscrow] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<VerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(300); // 5 min verification window
  const [showStrictExitGuard, setShowStrictExitGuard] = useState(false);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setCameraReady(false);
    stopCamera();
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Live camera API is unavailable in this browser context.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Camera permission denied or no camera hardware detected.';
      setCameraError(msg);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Countdown timer for active proof window
  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const elapsedSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || !cameraReady) return;

    const canvas = document.createElement('canvas');
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const maxDim = 960;
    const scale = Math.min(1, maxDim / Math.max(vw, vh));
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const jpegUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedDataUrl(jpegUrl);
    setVerifyFeedback(null);
    setVerifyError(null);
  };

  const handleRetake = () => {
    setCapturedDataUrl(null);
    setVerifyFeedback(null);
    setVerifyError(null);
  };

  const handleConfirmAndVerify = async () => {
    if (!capturedDataUrl || verifying) return;
    setVerifying(true);
    setVerifyError(null);
    setVerifyFeedback(null);

    try {
      const t0 = performance.now();
      const resp = await fetch('/api/verify/mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolPubkey: stake.escrowPda,
          userPubkey: walletPublicKey,
          dayIndex: new Date().getDate() % 30,
          missionType: stake.id.startsWith('hunt-') ? 'GPS_HUNT' : 'ITEM_SNAP',
          targetPrompt: challenge.itemName,
          visualCue: challenge.visualCue,
          antiCheatRule: challenge.antiCheatRule,
          imageBase64: capturedDataUrl,
          mimeType: 'image/jpeg',
          poolId: poolId || 'squad-7am-club',
          memberName: `${walletPublicKey.slice(0, 4)}...${walletPublicKey.slice(-4)}`,
        }),
      });

      const payload = await resp.json();
      if (!resp.ok) {
        throw new Error(payload.error || 'Gemini Vision verification failed.');
      }

      const result = payload as VerificationResult;
      setVerifyFeedback(result);

      if (result.verified) {
        setSigningEscrow(true);
        const durationMs = Math.max(120, Math.round(performance.now() - t0));
        stopCamera();
        await onVerified(result, durationMs);
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Unable to reach Vision Oracle.');
    } finally {
      setVerifying(false);
      setSigningEscrow(false);
    }
  };

  const handleBackRequest = () => {
    if (strictMode) {
      setShowStrictExitGuard(true);
    } else {
      stopCamera();
      onExit();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#FAF7F3] text-[#181E25] flex flex-col overflow-y-auto">
      {/* Top Bar */}
      <header className="w-full max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackRequest}
            aria-label="Exit live camera verification"
            className="min-h-[42px] min-w-[42px] rounded-full bg-white border border-[#EAE4DC] flex items-center justify-center hover:bg-[#F3EEE8] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#181E25]" />
          </button>
          <BrandMark size="sm" />
        </div>

        <div className="flex items-center gap-3 text-xs font-semibold">
          <span className="text-[#EC6B3F] tabular-nums">
            ${stake.amount.toFixed(2)} {stake.token} AT RISK
          </span>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute alarm' : 'Mute alarm'}
            className="min-h-[40px] min-w-[40px] rounded-full bg-white border border-[#EAE4DC] flex items-center justify-center"
          >
            {muted ? <VolumeX className="w-4 h-4 text-[#5E6873]" /> : <Volume2 className="w-4 h-4 text-[#EC6B3F]" />}
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 pb-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Center: Live Camera Viewfinder */}
        <div className="lg:col-span-7 space-y-4">
          {/* Locked Target Header Card matching screenshot */}
          <div className="rounded-2xl bg-[#FFF7F4] border border-[#EC6B3F] px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Camera className="w-5 h-5 text-[#181E25] shrink-0" />
              <div className="min-w-0">
                <div className="font-display text-sm sm:text-base font-bold text-[#181E25] truncate">
                  Live Proof: {challenge.itemName}
                </div>
                <div className="text-[11px] text-[#7C341C] truncate">
                  Locked target · Hardware camera only
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-lg font-bold text-[#181E25] tabular-nums">
                {mm}:{ss}
              </div>
              <div className="text-[10px] text-[#646F7C]">remaining</div>
            </div>
          </div>

          {/* Camera Feed / Captured Review Frame */}
          <div className="relative rounded-3xl overflow-hidden bg-[#181E25] aspect-[4/3] w-full flex items-center justify-center border border-[#2C3540]">
            {capturedDataUrl ? (
              <img
                src={capturedDataUrl}
                alt="Captured live verification frame"
                className="w-full h-full object-cover"
              />
            ) : cameraError ? (
              <div className="p-6 text-center text-white space-y-3 max-w-sm">
                <AlertCircle className="w-8 h-8 text-[#EC6B3F] mx-auto" />
                <div className="font-display font-bold text-base">Camera Access Required</div>
                <p className="text-xs text-white/75 leading-relaxed">{cameraError}</p>
                <p className="text-[11px] text-white/60">
                  Allow camera access in your browser permissions to capture live physical proof.
                </p>
                <button
                  type="button"
                  onClick={startCamera}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#EC6B3F] text-white text-xs font-semibold hover:bg-[#D95B31] inline-flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Camera Permission</span>
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#181E25]/80 text-white text-xs gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Starting live camera...</span>
                  </div>
                )}
              </>
            )}

            {/* Targeting Reticle Overlay (when live preview active) */}
            {!capturedDataUrl && cameraReady && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-44 h-44 sm:w-52 sm:h-52 relative">
                  <span className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-white/90 rounded-tl-xl" />
                  <span className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-white/90 rounded-tr-xl" />
                  <span className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-white/90 rounded-bl-xl" />
                  <span className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-white/90 rounded-br-xl" />
                  <div className="absolute inset-8 rounded-full border-2 border-white/65 border-dashed" />
                </div>
                <div className="mt-4 rounded-xl bg-black/65 px-3.5 py-1.5 text-xs font-medium text-white">
                  Align {challenge.itemName} inside reticle
                </div>
              </div>
            )}

            {/* Verifying Overlay */}
            {(verifying || signingEscrow) && (
              <div className="absolute inset-0 bg-black/72 flex flex-col items-center justify-center text-white p-6 text-center gap-3">
                <Loader2 className="w-10 h-10 text-[#EC6B3F] animate-spin" />
                <div className="font-display text-lg font-bold">
                  {signingEscrow
                    ? 'Signing actake_escrow::submit_checkin...'
                    : 'Verifying Live Proof with Gemini Vision...'}
                </div>
                <div className="text-xs text-white/75">
                  Checking 3D authenticity &amp; matching against &ldquo;{challenge.itemName}&rdquo;
                </div>
              </div>
            )}
          </div>

          {/* Camera Action Controls */}
          {!capturedDataUrl ? (
            <button
              type="button"
              disabled={!cameraReady}
              onClick={handleCaptureFrame}
              className="w-full min-h-[54px] rounded-2xl bg-[#EC6B3F] hover:bg-[#D95B31] disabled:opacity-45 text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Camera className="w-5 h-5" />
              <span>Capture Live Photo</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={verifying || signingEscrow}
                onClick={handleRetake}
                className="min-h-[52px] rounded-2xl bg-white border border-[#DDD5CA] hover:bg-[#F3EEE8] text-[#181E25] font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retake</span>
              </button>
              <button
                type="button"
                disabled={verifying || signingEscrow}
                onClick={handleConfirmAndVerify}
                className="min-h-[52px] rounded-2xl bg-[#1D8348] hover:bg-[#176A3A] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>Confirm &amp; Verify</span>
              </button>
            </div>
          )}

          {/* Failed Vision Result Feedback */}
          {verifyFeedback && !verifyFeedback.verified && (
            <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-[#991B1B]">
                <span>Verification Rejected · Retake Required</span>
                <span className="font-mono tabular-nums">
                  {Math.round(verifyFeedback.confidence * 100)}% match
                </span>
              </div>
              <p className="text-xs text-[#7F1D1D] leading-relaxed">
                Detected: <strong>{verifyFeedback.detectedObject}</strong>.{' '}
                {verifyFeedback.reasoning}
              </p>
              <div className="text-[11px] text-[#991B1B]">
                Live 3D check: {verifyFeedback.liveConfirmed ? 'Passed' : 'Failed (possible screen/print)'}
              </div>
            </div>
          )}

          {verifyError && (
            <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-4 text-xs text-[#991B1B]">
              {verifyError}
            </div>
          )}
        </div>

        {/* Right Column: Locked Reference Card + Telemetry */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-3xl bg-white border border-[#EAE4DC] p-5 space-y-3">
            <div className="text-xs font-semibold text-[#646F7C]">
              Reference Target Shown at Alarm
            </div>
            <div className="rounded-2xl bg-[#FAF7F3] border border-[#EFEAE3] p-2">
              <img
                src={challenge.referenceImageDataUrl}
                alt={challenge.itemName}
                referrerPolicy="no-referrer"
                className="w-full h-40 object-contain"
              />
            </div>
            <div className="text-sm font-bold text-[#181E25]">{challenge.itemName}</div>
            <p className="text-xs text-[#4A5563] leading-relaxed">{challenge.visualCue}</p>
          </div>

          <div className="rounded-2xl bg-white border border-[#EAE4DC] p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#5E6873]">Elapsed Verification Time</span>
              <span className="font-mono font-semibold text-[#181E25] tabular-nums">
                {elapsedSec}s
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5E6873]">Vision Threshold</span>
              <span className="font-mono font-semibold text-[#181E25] tabular-nums">
                ≥ 80% + Live 3D
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5E6873]">Escrow Instruction</span>
              <span className="font-mono text-[#181E25]">submit_checkin</span>
            </div>
          </div>
        </div>
      </main>

      {/* Strict Mode Exit Confirmation Dialog */}
      {showStrictExitGuard && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5 text-[#DC2626]">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="font-display text-lg font-bold text-[#181E25]">
                Strict Mode Active
              </h3>
            </div>
            <p className="text-xs text-[#4A5563] leading-relaxed">
              Leaving before verifying risks auto-slashing your ${stake.amount.toFixed(2)}{' '}
              {stake.token} stake to the squad pool. Are you sure you want to pause verification?
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setShowStrictExitGuard(false)}
                className="min-h-[44px] rounded-xl bg-[#181E25] text-white text-xs font-semibold"
              >
                Keep Verifying
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowStrictExitGuard(false);
                  stopCamera();
                  onExit();
                }}
                className="min-h-[44px] rounded-xl bg-[#FEF2F2] text-[#991B1B] text-xs font-semibold border border-[#FECACA]"
              >
                Exit Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
