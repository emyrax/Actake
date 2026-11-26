import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Flame,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { DiscoveredWalletOption, PlatformCompatibility } from '../types/actake';
import { BrandMark } from './BrandMark';
import { EscrowVault3D } from './EscrowVault3D';

interface OnboardingViewProps {
  wallets: DiscoveredWalletOption[];
  platform: PlatformCompatibility;
  connecting: boolean;
  error: string | null;
  onConnect: (walletId: string) => void;
}

const PREVIEW_DAYS = [
  { label: 'Sun', num: 22, done: true, today: false },
  { label: 'Mon', num: 23, done: true, today: false },
  { label: 'Tue', num: 24, done: true, today: false },
  { label: 'Wed', num: 25, done: false, today: true },
  { label: 'Thu', num: 26, done: false, today: false },
];

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  wallets,
  platform,
  connecting,
  error,
  onConnect,
}) => {
  const defaultWalletId = useMemo(() => {
    const preferred =
      wallets.find((w) => w.kind === 'pollar' && w.available) ||
      wallets.find((w) => w.kind === 'mwa' && w.available) ||
      wallets.find((w) => w.kind === 'wallet-standard' && w.available) ||
      wallets[wallets.length - 1];
    return preferred?.id || 'vault:browser-ed25519';
  }, [wallets]);

  const [selectedWalletId, setSelectedWalletId] = useState<string>(defaultWalletId);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const selectedWallet = wallets.find((w) => w.id === selectedWalletId) || wallets[0];

  const triggerConnect = () => {
    if (connecting) return;
    if (selectedWallet?.kind === 'pollar') {
      setSwipeProgress(0);
      onConnect(selectedWalletId);
      return;
    }
    setSwipeProgress(100);
    onConnect(selectedWalletId);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (connecting) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const usable = Math.max(1, rect.width - 56);
    const offset = Math.max(0, Math.min(usable, e.clientX - rect.left - 28));
    const pct = Math.round((offset / usable) * 100);
    setSwipeProgress(pct);
    if (pct >= 84) {
      draggingRef.current = false;
      triggerConnect();
    }
  };

  const handlePointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (swipeProgress < 84) {
      setSwipeProgress(0);
    }
  };

  return (
    <div className="min-h-screen actake-canvas text-[#111114] flex flex-col">
      {/* Clean Top Bar */}
      <header className="w-full max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <BrandMark size="md" />
        <div className="text-xs font-semibold text-[#6B6663] whitespace-nowrap">
          Solana Devnet · Pollar · MWA
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-5 sm:px-8 py-6 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
        {/* Left Column: Warm Editorial Hero, Wallet Selector, Swipe-to-Connect */}
        <div className="lg:col-span-6 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <img
                src="/assets/aistudio/Gemini_Generated_Image_eh2x1teh2x1teh2x_c3446dad.jpg"
                alt="Actake Accountability Mascot"
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-2xl object-cover shadow-sm"
              />
              <div className="text-xs font-semibold text-[#6B6663]">
                Stake to verify deadlines · Join accountability communities
              </div>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.06] text-[#111114]">
              Build Better Routines{' '}
              <span className="text-[#F16A2E]">by Staking.</span>
            </h1>
            <p className="text-base text-[#5E5854] leading-relaxed max-w-xl">
              Lock USDC or 0%-fee SKR behind daily deadlines. When your alarm rings, complete a
              randomized live camera check-in to protect your streak and split the slashed pot.
            </p>
          </div>

          {/* Cross-Platform Solana Wallet Selector */}
          <div className="actake-card p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-extrabold text-[#111114] flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#F16A2E]" />
                Choose Solana Wallet
              </span>
              <span className="text-xs font-medium text-[#6B6663] capitalize">
                {platform.os} · {platform.browser}
              </span>
            </div>

            <p className="text-xs text-[#6B6663] leading-relaxed">{platform.summary}</p>

            <div className="space-y-2">
              {wallets.map((w) => {
                const isSelected = w.id === selectedWalletId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={!w.available}
                    onClick={() => setSelectedWalletId(w.id)}
                    className={`w-full text-left rounded-2xl p-3.5 border transition-colors flex items-start justify-between gap-3 ${
                      !w.available
                        ? 'bg-[#FFF8F4] border-[#F4EAE3] opacity-60 cursor-not-allowed'
                        : isSelected
                          ? 'bg-[#FFF3EC] border-[#F16A2E]'
                          : 'bg-white border-[#F2E8E1] hover:border-[#E5CFC2]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#111114] truncate">{w.name}</div>
                      <p className="text-xs text-[#6B6663] mt-0.5 leading-snug">{w.description}</p>
                    </div>
                    <div className="shrink-0 mt-0.5">
                      {isSelected && w.available ? (
                        <CheckCircle2 className="w-5 h-5 text-[#F16A2E]" />
                      ) : (
                        <span className="text-[11px] font-semibold text-[#877F7A]">
                          {w.available ? 'Ready' : 'Android Chrome'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#991B1B]"
            >
              {error}
            </div>
          )}

          {/* Tactile Swipe-to-Connect Bar */}
          <div className="space-y-2.5">
            <div
              ref={trackRef}
              onClick={triggerConnect}
              className="relative h-14 w-full rounded-full bg-[#111114] p-1.5 flex items-center cursor-pointer select-none shadow-[0_12px_28px_rgba(17,17,20,0.22)] overflow-hidden"
            >
              <div
                className="absolute inset-y-0 left-0 bg-[#F16A2E]/35 transition-all duration-75"
                style={{ width: `${Math.max(0, swipeProgress)}%` }}
              />

              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerConnect();
                }}
                style={{
                  transform: `translateX(${(swipeProgress / 100) * 180}px)`,
                }}
                className="relative z-10 h-11 w-11 rounded-full bg-[#F16A2E] text-white flex items-center justify-center shadow-sm transition-transform duration-75 shrink-0"
              >
                <ArrowRight className="w-5 h-5" />
              </div>

              <div className="flex-1 text-center pr-8 text-sm sm:text-base font-bold text-white tracking-tight flex items-center justify-center gap-1.5">
                <span>
                  {connecting
                    ? 'Signing In...'
                    : selectedWallet?.kind === 'pollar'
                      ? 'Swipe or Tap to Sign In with Pollar'
                      : `Swipe or Tap to Connect ${selectedWallet?.kind === 'mwa' ? 'Seeker MWA' : 'Wallet'}`}
                </span>
                {!connecting && (
                  <span className="inline-flex items-center opacity-80" aria-hidden="true">
                    <ChevronRight className="w-4 h-4 -mr-2" />
                    <ChevronRight className="w-4 h-4 -mr-2" />
                    <ChevronRight className="w-4 h-4" />
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B6663] px-1">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
                Pollar Auth &amp; Fiat Ramp · Silent reconnect
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-[#6B6663]" />
                Pollar · Android MWA · Vault
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Mini Daily Challenge Preview Card + 3D Escrow Vault */}
        <div className="lg:col-span-6 space-y-5">
          {/* Compact Daily Challenge & 5-Day Streak Strip Preview */}
          <div className="actake-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#F16A2E] inline-flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5" />
                  <span>Daily Challenge · 06:00 AM Cutoff</span>
                </div>
                <div className="font-display text-lg font-extrabold text-[#111114] mt-0.5">
                  7AM Campus Wake Club · $185 Pot
                </div>
              </div>
              <div className="flex items-center -space-x-2 shrink-0">
                {['AL', 'SA', 'NI'].map((i) => (
                  <span
                    key={i}
                    className="w-7 h-7 rounded-full bg-[#111114] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white"
                  >
                    {i}
                  </span>
                ))}
                <span className="w-7 h-7 rounded-full bg-[#FFE3D5] text-[#F16A2E] text-[10px] font-bold flex items-center justify-center border-2 border-white">
                  +42
                </span>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {PREVIEW_DAYS.map((d) => (
                <div
                  key={d.label}
                  className={`rounded-full py-2 px-1 flex flex-col items-center gap-1.5 ${
                    d.today ? 'bg-[#F38452] text-white' : 'bg-[#FFF5EF] text-[#111114]'
                  }`}
                >
                  <span className="text-[10px] font-semibold opacity-80">{d.label}</span>
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      d.today
                        ? 'bg-white text-[#111114]'
                        : d.done
                          ? 'bg-[#E6F8EE] text-[#16A34A]'
                          : 'bg-white text-[#877F7A]'
                    }`}
                  >
                    {d.done ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : d.num}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <EscrowVault3D
            vaultState="locked"
            totalLockedUsd={185}
            activeStakesCount={2}
            className="h-[290px] sm:h-[340px] w-full rounded-[28px]"
          />
        </div>
      </main>
    </div>
  );
};
