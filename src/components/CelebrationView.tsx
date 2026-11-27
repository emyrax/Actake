import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Flame,
  Share2,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { CelebrationReceipt } from '../types/actake';
import { BrandMark } from './BrandMark';
import { MascotDisplay } from './MascotDisplay';

interface CelebrationViewProps {
  receipt: CelebrationReceipt;
  claiming: boolean;
  onClaimPayout: () => Promise<void>;
  onDone: () => void;
}

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CelebrationView: React.FC<CelebrationViewProps> = ({
  receipt,
  claiming,
  onClaimPayout,
  onDone,
}) => {
  const [copiedBlink, setCopiedBlink] = useState(false);

  const handleShareBlink = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `I verified ${receipt.verifiedItemName} on Actake!`,
          text: `Unlocked +$${receipt.totalEarned.toFixed(2)} ${receipt.token} (${receipt.streakCount}-day streak). Join my Solana accountability pool:`,
          url: receipt.blinkUrl,
        });
        return;
      }
    } catch {
      // fallback to clipboard
    }
    try {
      await navigator.clipboard.writeText(receipt.blinkUrl);
      setCopiedBlink(true);
      window.setTimeout(() => setCopiedBlink(false), 2400);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1B6E3D] text-white overflow-y-auto">
      <div className="min-h-full w-full max-w-lg mx-auto px-5 py-8 flex flex-col items-center justify-between gap-6">
        {/* Header & Verified Time */}
        <div className="w-full text-center space-y-3">
          <BrandMark inverted size="lg" />
          <div className="inline-flex items-center gap-2 text-sm font-medium text-white/90">
            <CheckCircle2 className="w-4 h-4 text-[#86EFAC]" />
            <span>Verified Proof · {receipt.verifiedItemName}</span>
          </div>
          <div className="font-mono text-4xl sm:text-5xl font-bold tracking-tight tabular-nums">
            {receipt.verifiedTimeLabel}
          </div>
        </div>

        {/* White Streak Card matching screenshot */}
        <div className="w-full rounded-3xl bg-white text-[#181E25] p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-display text-lg font-bold">
              <Flame className="w-5 h-5 text-[#EC6B3F]" />
              <span className="tabular-nums">{receipt.streakCount} day streak</span>
            </div>
            <span className="text-xs font-mono font-semibold text-[#1D8348] tabular-nums">
              +{receipt.actPointsAwarded} $ACT
            </span>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center">
            {WEEK_DAYS.map((day) => (
              <div key={day} className="flex flex-col items-center gap-1.5">
                <div className="w-8 h-8 rounded-full bg-[#22A559] text-white flex items-center justify-center">
                  <Check className="w-4 h-4" strokeWidth={3} />
                </div>
                <span className="text-[11px] font-medium text-[#5E6873]">{day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payout Receipt Glass Card */}
        <div className="w-full rounded-2xl bg-white/14 border border-white/25 p-5 text-center space-y-2">
          <div className="font-display text-2xl sm:text-3xl font-extrabold tabular-nums">
            +${receipt.totalEarned.toFixed(2)} {receipt.token} Earned
          </div>
          <div className="text-xs sm:text-sm text-white/90 tabular-nums">
            ${receipt.principalAmount.toFixed(2)} Stake Returned + $
            {receipt.slashedBonus.toFixed(2)} Squad Split · Confirmed in {receipt.confirmationMs}ms
          </div>

          {/* Cryptographic On-Chain Attestation Details */}
          <div className="pt-3 mt-3 border-t border-white/20 text-left space-y-1.5 text-[11px] font-mono text-white/85">
            <div className="flex items-center justify-between gap-3">
              <span>submit_checkin:</span>
              {receipt.checkinExplorerUrl ? (
                <a
                  href={receipt.checkinExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#86EFAC] hover:underline truncate"
                >
                  <span>{receipt.checkinTxSignature.slice(0, 18)}...</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ) : (
                <span className="truncate">{receipt.checkinTxSignature.slice(0, 22)}...</span>
              )}
            </div>
            <div className="flex justify-between gap-3">
              <span>Photo SHA-256:</span>
              <span className="truncate">{receipt.photoSha256.slice(0, 22)}...</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Oracle Ed25519:</span>
              <span className="truncate">{receipt.oracleSignature.slice(0, 22)}...</span>
            </div>
            {receipt.claimTxSignature && (
              <div className="flex items-center justify-between gap-3 text-[#86EFAC]">
                <span>claim_payout:</span>
                {receipt.claimExplorerUrl ? (
                  <a
                    href={receipt.claimExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:underline truncate"
                  >
                    <span>{receipt.claimTxSignature.slice(0, 18)}...</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : (
                  <span className="truncate">{receipt.claimTxSignature.slice(0, 22)}...</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mascot Trophy Showcase */}
        <div className="w-full rounded-3xl bg-white/10 border border-white/20 px-5 py-4 flex items-center gap-4">
          <MascotDisplay
            variant="celebration"
            size="xl"
            floating
            alt="Actake Verified Shield Mascot"
          />
          <div className="text-left space-y-1 min-w-0">
            <div className="font-display text-base font-extrabold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#86EFAC] shrink-0" />
              <span>Escrow Unlocked on Solana</span>
            </div>
            <div className="text-xs text-white/85 leading-relaxed">
              {receipt.claimed
                ? 'Payout settled directly to your connected wallet.'
                : 'Tap below to sign actake_escrow::claim_payout.'}
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="w-full space-y-2.5">
          {!receipt.claimed && (
            <button
              type="button"
              disabled={claiming}
              onClick={onClaimPayout}
              className="w-full min-h-[52px] rounded-full bg-[#EC6B3F] hover:bg-[#D95B31] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-md disabled:opacity-60"
            >
              <Wallet className="w-4 h-4" />
              <span>
                {claiming
                  ? 'Signing actake_escrow::claim_payout...'
                  : `Redeem $${receipt.totalEarned.toFixed(2)} ${receipt.token} to Wallet`}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={handleShareBlink}
            className="w-full min-h-[50px] rounded-full bg-white text-[#181E25] hover:bg-[#FAF7F3] font-bold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {copiedBlink ? <Copy className="w-4 h-4 text-[#1D8348]" /> : <Share2 className="w-4 h-4" />}
            <span>{copiedBlink ? 'Proof Blink URL Copied!' : 'Share Proof Blink'}</span>
          </button>

          <button
            type="button"
            onClick={onDone}
            className="w-full min-h-[48px] rounded-full bg-[#181E25] text-white hover:bg-[#26303B] font-semibold text-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
