import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Flame,
  Lock,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trophy,
  Wallet,
} from 'lucide-react';
import { DiscoveredWalletOption, PlatformCompatibility } from '../types/actake';
import { BrandMark } from './BrandMark';
import { MascotDisplay } from './MascotDisplay';
import { ErrorStateCard, SparklineSvg } from './UiPrimitives';
import { UnifiedWalletList } from './UnifiedWalletList';

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

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Lock USDC or 0%-Fee SKR',
    detail: 'Commit to a daily alarm deadline inside a Solana Devnet escrow pool.',
    icon: Lock,
  },
  {
    step: '02',
    title: 'Beat the Live AI Alarm',
    detail: 'Verify with a randomized live camera target before your cutoff expires.',
    icon: Camera,
  },
  {
    step: '03',
    title: 'Claim Principal + Slashed Split',
    detail: 'Keep your full stake and automatically share missed-deadline pots.',
    icon: Trophy,
  },
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
      <header className="w-full max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <BrandMark size="md" />
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B6663] whitespace-nowrap">
          <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
          <span>Solana Devnet · Pollar · MWA</span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-5 lg:py-9 grid grid-cols-1 lg:grid-cols-12 gap-7 lg:gap-10 items-start lg:items-center">
        {/* Left Column: Hero, Wallet Selector, Primary Connect CTA */}
        <div className="lg:col-span-6 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-3.5">
              <MascotDisplay
                variant="medallion"
                size="lg"
                floating
                alt="Actake Accountability Mascot"
              />
              <div className="space-y-0.5 min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#F16A2E]">
                  Actake Guardian
                </div>
                <div className="text-xs font-semibold text-[#5E5854]">
                  Stake to verify deadlines · Split missed-habit pots
                </div>
              </div>
            </div>

            <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.06] text-[#111114]">
              Build Better Routines{' '}
              <span className="text-[#F16A2E]">by Staking.</span>
            </h1>
            <p className="text-sm sm:text-base text-[#5E5854] leading-relaxed max-w-xl">
              Lock USDC or 0%-fee SKR behind daily deadlines. When your alarm rings, complete a
              randomized live camera check-in to protect your streak and earn from the slashed pot.
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

            <UnifiedWalletList
              wallets={wallets}
              mode="select"
              selectedWalletId={selectedWalletId}
              busy={connecting}
              onSelect={(id) => setSelectedWalletId(id)}
            />
          </div>

          {error && (
            <ErrorStateCard
              title="Wallet sign-in did not complete"
              message={error}
              onRetry={triggerConnect}
              retryLabel="Try Again"
            />
          )}

          {/* Tactile Swipe-or-Tap Connect CTA */}
          <div className="space-y-2.5">
            <div
              ref={trackRef}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  triggerConnect();
                }
              }}
              onClick={triggerConnect}
              className="relative h-14 w-full rounded-full bg-[#111114] hover:bg-[#1C1C22] p-1.5 flex items-center cursor-pointer select-none shadow-[0_12px_28px_rgba(17,17,20,0.22)] overflow-hidden transition-colors"
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
                <span className="truncate">
                  {connecting
                    ? 'Signing In...'
                    : selectedWallet?.kind === 'pollar'
                      ? 'Swipe or Tap to Sign In with Pollar'
                      : `Swipe or Tap to Connect ${selectedWallet?.kind === 'mwa' ? 'Seeker MWA' : 'Wallet'}`}
                </span>
                {!connecting && (
                  <span className="inline-flex items-center opacity-80 shrink-0" aria-hidden="true">
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
                Pollar · Android MWA · Local Vault
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Daily Challenge Preview + Native How-It-Works & Payout Split Card */}
        <div className="lg:col-span-6 space-y-5">
          {/* Compact Daily Challenge & 5-Day Streak Strip Preview */}
          <div className="actake-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <div className="text-xs font-bold text-[#F16A2E] inline-flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5" />
                  <span>Daily Challenge · 06:00 AM Cutoff</span>
                </div>
                <div className="font-display text-lg font-extrabold text-[#111114] leading-snug">
                  7AM Campus Wake Club · $185 Pot
                </div>
                <div className="flex items-center -space-x-2 pt-0.5">
                  {['AL', 'SA', 'NI'].map((i) => (
                    <span
                      key={i}
                      className="w-7 h-7 rounded-full bg-[#111114] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white"
                    >
                      {i}
                    </span>
                  ))}
                  <span className="w-7 h-7 rounded-full bg-[#FFE3D5] text-[#F16A2E] text-[10px] font-bold flex items-center justify-center border-2 border-white tabular-nums">
                    +42
                  </span>
                </div>
              </div>
              <MascotDisplay
                variant="stage"
                size="lg"
                floating
                alt="Actake Daily Challenge Mascot"
              />
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
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${
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

          {/* High-Craft Accountability Escrow & Payout Preview Card (Replaces 3D Vault) */}
          <div className="rounded-[28px] bg-[#141416] text-white p-6 space-y-5 shadow-[0_18px_40px_rgba(17,17,20,0.18)] relative overflow-hidden">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-20 -right-16 w-48 h-48 rounded-full actake-orb-glow opacity-25 blur-2xl"
            />

            <div className="relative z-10 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#F16A2E]">
                  How Escrow Accountability Works
                </div>
                <h2 className="font-display text-xl font-extrabold text-white mt-1">
                  3 Steps to Protect Your Streak
                </h2>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-white/10 text-[11px] font-mono font-semibold text-[#4ADE80] whitespace-nowrap">
                0% Fee on SKR
              </span>
            </div>

            <div className="relative z-10 space-y-2.5">
              {HOW_IT_WORKS.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.step}
                    className="rounded-2xl bg-white/[0.06] border border-white/10 p-3.5 flex items-start gap-3"
                  >
                    <span className="w-9 h-9 rounded-xl bg-[#F16A2E]/20 text-[#F16A2E] flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-white/45">
                          {item.step}
                        </span>
                        <span className="text-xs font-bold text-white">{item.title}</span>
                      </div>
                      <p className="text-[11px] text-white/70 mt-0.5 leading-relaxed">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="relative z-10 rounded-2xl bg-white/[0.05] border border-white/10 p-4 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-[11px] text-white/60 font-semibold">
                  Sample 7-Day Pool Return
                </div>
                <div className="font-display text-lg font-extrabold text-white tabular-nums">
                  $10.00 <span className="text-[#4ADE80]">→ $12.50</span>
                </div>
                <div className="text-[11px] text-white/55">
                  Principal + avg slashed split from missed check-ins
                </div>
              </div>
              <div className="w-28 shrink-0">
                <SparklineSvg
                  values={[10, 10.4, 10.9, 11.2, 11.7, 12.1, 12.5]}
                  stroke="#4ADE80"
                  fillFrom="rgba(74, 222, 128, 0.28)"
                  className="w-full h-11"
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
