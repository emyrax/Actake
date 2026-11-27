import React from 'react';
import { AlertTriangle, BellRing, Camera, ShieldAlert, Volume2, VolumeX } from 'lucide-react';
import { RandomizedTargetPrompt, StakeCommitment } from '../types/actake';
import { MascotLoader } from './MascotDisplay';

interface AlarmChallengeModalProps {
  stake: StakeCommitment;
  challenge: RandomizedTargetPrompt | null;
  loading: boolean;
  error: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onRetryGenerate: () => void;
  onProceedToCamera: () => void;
}

export const AlarmChallengeModal: React.FC<AlarmChallengeModalProps> = ({
  stake,
  challenge,
  loading,
  error,
  muted,
  onToggleMute,
  onRetryGenerate,
  onProceedToCamera,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-challenge-title"
      className="fixed inset-0 z-50 bg-[#181E25]/82 flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-md rounded-3xl bg-[#FAF7F3] border-2 border-[#EC6B3F] shadow-2xl overflow-hidden my-auto">
        {/* Ringing Alarm Banner */}
        <div className="bg-[#EC6B3F] text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BellRing className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold opacity-90 truncate">
                Alarm Ringing · {stake.categoryName}
              </div>
              <div className="font-display text-base font-bold tabular-nums">
                ${stake.amount.toFixed(2)} {stake.token} At Risk
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute alarm audio' : 'Mute alarm audio'}
            className="min-h-[40px] min-w-[40px] rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors shrink-0"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Challenge Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {loading ? (
            <div className="py-6">
              <MascotLoader
                size="xl"
                theme="light"
                titleId="alarm-challenge-title"
                title="Generating Anti-Cheat Target..."
                subtitle={`Gemini Vision Oracle is picking a random everyday item or action tailored to ${stake.categoryName}.`}
              />
            </div>
          ) : error ? (
            <div className="py-6 space-y-4 text-center">
              <AlertTriangle className="w-8 h-8 text-[#DC2626] mx-auto" />
              <div>
                <h2 id="alarm-challenge-title" className="font-display text-lg font-bold text-[#181E25]">
                  Oracle Connection Interrupted
                </h2>
                <p className="text-xs text-[#991B1B] mt-1">{error}</p>
              </div>
              <button
                type="button"
                onClick={onRetryGenerate}
                className="w-full min-h-[46px] rounded-xl bg-[#181E25] text-white text-sm font-semibold hover:bg-[#2A3441]"
              >
                Retry AI Challenge
              </button>
            </div>
          ) : challenge ? (
            <>
              <div className="text-center">
                <div className="text-xs font-semibold text-[#646F7C]">
                  Random Live Proof Challenge
                </div>
                <h2
                  id="alarm-challenge-title"
                  className="font-display text-2xl font-extrabold text-[#181E25] mt-0.5"
                >
                  {challenge.itemName}
                </h2>
              </div>

              {/* Runtime Studio Reference Image */}
              <div className="rounded-2xl bg-white border border-[#EAE4DC] p-3 flex items-center justify-center overflow-hidden">
                <img
                  src={challenge.referenceImageDataUrl}
                  alt={`Reference target: ${challenge.itemName}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-48 object-contain"
                />
              </div>

              {/* Clear Capture Description & Anti-Cheat Rule */}
              <div className="space-y-2.5 text-sm">
                <div className="rounded-xl bg-white border border-[#EAE4DC] p-3.5">
                  <div className="text-xs font-semibold text-[#181E25] mb-1">
                    Capture Instructions
                  </div>
                  <p className="text-xs text-[#4A5563] leading-relaxed">{challenge.visualCue}</p>
                </div>

                <div className="rounded-xl bg-[#FFF7F4] border border-[#F5D0C3] p-3 flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-[#EC6B3F] shrink-0 mt-0.5" />
                  <p className="text-xs text-[#7C341C] leading-relaxed">
                    {challenge.antiCheatRule}
                  </p>
                </div>
              </div>

              {/* Primary CTA -> Redirects straight to locked live camera */}
              <button
                type="button"
                onClick={onProceedToCamera}
                className="w-full min-h-[52px] px-5 py-3 rounded-2xl bg-[#181E25] hover:bg-[#26303B] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Camera className="w-4 h-4 text-[#EC6B3F]" />
                <span>Verify Proof on Live Camera</span>
              </button>

              <p className="text-[11px] text-center text-[#646F7C]">
                Locked to this item · Gallery uploads disabled · Requires ≥ 80% live 3D confidence
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
