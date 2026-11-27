import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  RefreshCw,
  ShieldAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { RandomizedTargetPrompt, StakeCommitment, VerificationResult } from '../types/actake';
import { BrandMark } from './BrandMark';
import { MascotLoader } from './MascotDisplay';
import {
  safeFetchJson,
  sanitizeApiErrorMessage,
  sanitizeDisplayText,
} from '../utils/safeFetchJson';

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
  const mountedRef = useRef<boolean>(true);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [signingEscrow, setSigningEscrow] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<VerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(300); // 5 min verification window
  const [showStrictExitGuard, setShowStrictExitGuard] = useState(false);

  const hasLiveVideoTrack = (stream: MediaStream | null): boolean => {
    if (!stream) return false;
    return stream.getVideoTracks().some((track) => track.readyState === 'live');
  };

  const stopCamera = () => {
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const attachStreamToVideo = async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    // Wait briefly for metadata if dimensions aren't populated yet
    if (video.readyState < 1) {
      await new Promise<void>((resolve) => {
        const done = () => {
          video.removeEventListener('loadedmetadata', done);
          video.removeEventListener('canplay', done);
          resolve();
        };
        video.addEventListener('loadedmetadata', done, { once: true });
        video.addEventListener('canplay', done, { once: true });
        window.setTimeout(done, 1200);
      });
    }

    try {
      await video.play();
    } catch {
      // Mobile browsers can reject play() if already playing; ignore if tracks are live
    }

    if (mountedRef.current && hasLiveVideoTrack(stream)) {
      setCameraReady(true);
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

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });
      } catch {
        // Fallback for devices that reject strict resolution/facing constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      await attachStreamToVideo(stream);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg =
        err instanceof Error
          ? err.message
          : 'Camera permission denied or no camera hardware detected.';
      setCameraError(msg);
    }
  };

  const ensureLiveCameraFeed = async () => {
    if (hasLiveVideoTrack(streamRef.current) && videoRef.current) {
      await attachStreamToVideo(streamRef.current!);
      return;
    }
    await startCamera();
  };

  useEffect(() => {
    mountedRef.current = true;
    void startCamera();
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, []);

  // Whenever returning from captured review to live preview, ensure stream is attached & playing
  useEffect(() => {
    if (!capturedDataUrl && !cameraError) {
      if (hasLiveVideoTrack(streamRef.current)) {
        void attachStreamToVideo(streamRef.current!);
      }
    }
  }, [capturedDataUrl, cameraError]);

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
    if (!video || !cameraReady || !hasLiveVideoTrack(streamRef.current)) {
      void ensureLiveCameraFeed();
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) {
      setVerifyError('Camera frame is still warming up. Hold steady for a second and tap Capture again.');
      void ensureLiveCameraFeed();
      return;
    }

    const canvas = document.createElement('canvas');
    // Keep image crisp for AI Vision while compact enough (~80-180 KB) to avoid proxy body limits
    const maxDim = 800;
    const scale = Math.min(1, maxDim / Math.max(vw, vh));
    canvas.width = Math.max(1, Math.round(vw * scale));
    canvas.height = Math.max(1, Math.round(vh * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const jpegUrl = canvas.toDataURL('image/jpeg', 0.78);

    if (!jpegUrl || !jpegUrl.startsWith('data:image/')) {
      setVerifyError('Could not capture photo frame. Please retake.');
      return;
    }

    setCapturedDataUrl(jpegUrl);
    setVerifyFeedback(null);
    setVerifyError(null);
  };

  const handleRetake = () => {
    setCapturedDataUrl(null);
    setVerifyFeedback(null);
    setVerifyError(null);
    void ensureLiveCameraFeed();
  };

  const handleConfirmAndVerify = async () => {
    if (!capturedDataUrl || verifying) return;
    setVerifying(true);
    setVerifyError(null);
    setVerifyFeedback(null);

    try {
      const t0 = performance.now();
      const rawPayload = await safeFetchJson<Partial<VerificationResult>>('/api/verify/mission', {
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
        retries: 1,
        retryDelayMs: 700,
        fallbackError: 'Vision verification failed. Please retry or retake the photo.',
      });

      const rawConfidence =
        typeof rawPayload.confidence === 'number'
          ? rawPayload.confidence
          : Number(rawPayload.confidence);
      const confidence = Number.isFinite(rawConfidence)
        ? Math.max(0, Math.min(1, rawConfidence))
        : 0;
      const liveConfirmed = Boolean(rawPayload.liveConfirmed);
      const verified = Boolean(rawPayload.verified) && liveConfirmed && confidence >= 0.8;

      const result: VerificationResult = {
        verified,
        liveConfirmed,
        confidence,
        detectedObject: sanitizeDisplayText(rawPayload.detectedObject, 'Unrecognized subject'),
        reasoning: sanitizeDisplayText(
          rawPayload.reasoning,
          verified
            ? 'Live physical proof verified.'
            : 'Could not clearly confirm the required target in this frame.'
        ),
        photoSha256: sanitizeDisplayText(rawPayload.photoSha256, ''),
        oracleSignature: sanitizeDisplayText(rawPayload.oracleSignature, ''),
        oraclePublicKey: sanitizeDisplayText(rawPayload.oraclePublicKey, ''),
        messageBytesHex: sanitizeDisplayText(rawPayload.messageBytesHex, '') || undefined,
        verifiedAt: Number(rawPayload.verifiedAt) || Date.now(),
        model: sanitizeDisplayText(rawPayload.model, 'gemini-4-hydrogen'),
      };

      setVerifyFeedback(result);

      if (result.verified) {
        setSigningEscrow(true);
        const durationMs = Math.max(120, Math.round(performance.now() - t0));
        stopCamera();
        try {
          await onVerified(result, durationMs);
        } catch (escrowErr) {
          throw new Error(
            sanitizeApiErrorMessage(
              escrowErr,
              'Photo verified, but submitting the on-chain check-in failed. Please retry.'
            )
          );
        }
      }
    } catch (err) {
      setVerifyError(
        sanitizeApiErrorMessage(
          err,
          'Image cross-check returned an unexpected response. Please tap Retry Verification or Retake.'
        )
      );
    } finally {
      if (mountedRef.current) {
        setVerifying(false);
        setSigningEscrow(false);
      }
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

          {/* Camera Feed / Captured Review Frame — keep <video> mounted continuously so Retake never goes blank */}
          <div className="relative rounded-3xl overflow-hidden bg-[#181E25] aspect-[4/3] w-full flex items-center justify-center border border-[#2C3540]">
            {cameraError ? (
              <div className="p-6 text-center text-white space-y-3 max-w-sm">
                <AlertCircle className="w-8 h-8 text-[#EC6B3F] mx-auto" />
                <div className="font-display font-bold text-base">Camera Access Required</div>
                <p className="text-xs text-white/75 leading-relaxed">{cameraError}</p>
                <p className="text-[11px] text-white/60">
                  Allow camera access in your browser permissions to capture live physical proof.
                </p>
                <button
                  type="button"
                  onClick={() => void startCamera()}
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
                  onPlaying={() => setCameraReady(true)}
                  className={`w-full h-full object-cover ${capturedDataUrl ? 'invisible' : 'visible'}`}
                />
                {!cameraReady && !capturedDataUrl && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#181E25]/88 p-6">
                    <MascotLoader
                      size="lg"
                      theme="dark"
                      title="Starting Live Camera..."
                      subtitle="Initializing hardware viewfinder for live anti-cheat proof"
                    />
                  </div>
                )}
              </>
            )}

            {capturedDataUrl && (
              <img
                src={capturedDataUrl}
                alt="Captured live verification frame"
                className="absolute inset-0 z-10 w-full h-full object-cover"
              />
            )}

            {/* Targeting Reticle Overlay (when live preview active) */}
            {!capturedDataUrl && cameraReady && !cameraError && (
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
              <div className="absolute inset-0 z-20 bg-[#111114]/86 flex items-center justify-center p-6">
                <MascotLoader
                  size="xl"
                  theme="dark"
                  title={
                    signingEscrow
                      ? 'Signing Escrow Check-In...'
                      : 'Verifying Live Proof...'
                  }
                  subtitle={
                    signingEscrow
                      ? 'Submitting actake_escrow::submit_checkin on Solana Devnet'
                      : `Checking 3D authenticity & matching against "${challenge.itemName}"`
                  }
                />
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
            <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-4 space-y-2 text-xs text-[#991B1B]">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" />
                <span className="leading-relaxed">{verifyError}</span>
              </div>
              {capturedDataUrl && !verifying && !signingEscrow && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleConfirmAndVerify()}
                    className="min-h-[34px] px-3 rounded-lg bg-[#991B1B] text-white text-[11px] font-semibold hover:bg-[#7F1D1D] transition-colors"
                  >
                    Retry Verification
                  </button>
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="min-h-[34px] px-3 rounded-lg bg-white border border-[#FECACA] text-[#991B1B] text-[11px] font-semibold hover:bg-[#FFF5F5] transition-colors"
                  >
                    Retake Photo
                  </button>
                </div>
              )}
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
