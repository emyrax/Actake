import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  Flame,
  Fuel,
  HelpCircle,
  KeyRound,
  Laptop,
  Loader2,
  Lock,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wallet,
  Zap,
} from 'lucide-react';
import runnerConsistencyImg from '../assets/images/auth_consistency_runner_1795791939979.jpg';
import focusAccountabilityImg from '../assets/images/auth_accountability_focus_1795791939217.jpg';
import sunriseCommitmentImg from '../assets/images/auth_streak_sunrise_1795791940392.jpg';
import { DiscoveredWalletOption, PlatformCompatibility } from '../types/actake';
import { BrandMark } from './BrandMark';
import {
  POLLAR_LOGO_SRC,
  SolflareMark,
  UnifiedWalletList,
  WalletBrandIcon,
} from './UnifiedWalletList';

interface AuthPageProps {
  wallets: DiscoveredWalletOption[];
  platform: PlatformCompatibility;
  connecting: boolean;
  error: string | null;
  onConnect: (walletId: string) => void;
  onBack: () => void;
}

interface AuthSlide {
  id: string;
  kind: 'image' | 'motion';
  imageSrc: string;
  chapter: string;
  quote: string;
  attribution: string;
}

const SLIDE_DURATION_MS = 5600;

const AUTH_SLIDES: AuthSlide[] = [
  {
    id: 'consistency-runner',
    kind: 'image',
    imageSrc: runnerConsistencyImg,
    chapter: '01 · Morning Consistency',
    quote:
      'Consistency is not willpower — it is designing a system where showing up beats every excuse.',
    attribution: '— Actake Morning Club · 06:00 AM Cutoff',
  },
  {
    id: 'accountability-focus',
    kind: 'image',
    imageSrc: focusAccountabilityImg,
    chapter: '02 · Deep Work Accountability',
    quote:
      'Every morning you verify your routine, you prove to yourself that your word is binding.',
    attribution: '— Live AI Camera Proof · Zero Fake Uploads',
  },
  {
    id: 'sunrise-commitment',
    kind: 'image',
    imageSrc: sunriseCommitmentImg,
    chapter: '03 · Beat The Alarm',
    quote:
      'When real stakes meet a live alarm, snooze disappears and streaks become automatic.',
    attribution: '— Non-Custodial Solana Devnet Escrow',
  },
  {
    id: 'animated-accountability-loop',
    kind: 'motion',
    imageSrc: runnerConsistencyImg,
    chapter: '04 · Live Accountability Loop',
    quote:
      'Lock USDC or 0%-fee SKR, beat the randomized live camera check-in, and claim slashed pool splits.',
    attribution: '— Real-Time On-Chain Settlement',
  },
];

const OPTION_COMPARISON = [
  {
    id: 'pollar',
    title: 'Pollar Account',
    tag: 'Best for most users',
    detail:
      'One-tap Email, Google, or Passkey login with built-in Pollar RAMP to deposit USDC/SOL directly — no browser extension needed.',
    setup: '~15 sec',
  },
  {
    id: 'solana',
    title: 'Solflare · Phantom · Seeker MWA',
    tag: 'Best for Solana holders',
    detail:
      'Connect your existing Solana wallet or Seeker Seed Vault via Mobile Wallet Adapter for direct self-custody SPL USDC & 0%-fee SKR.',
    setup: 'Instant',
  },
  {
    id: 'vault',
    title: 'Browser Devnet Vault',
    tag: 'Best for quick preview',
    detail:
      'Generates a local Ed25519 keypair in your browser immediately so you can test alarms and AI camera verification before funding.',
    setup: '1 tap',
  },
];

const NAVIGATION_STEPS = [
  {
    step: '01',
    icon: Wallet,
    title: 'Today Vault',
    detail: 'Track live USDC & SOL totals, 24h fluctuation, and toggle USDC/SOL.',
  },
  {
    step: '02',
    icon: Zap,
    title: 'Quick Stake or Missions',
    detail: 'Expand Quick Actions for 1-tap presets or customize any daily alarm.',
  },
  {
    step: '03',
    icon: Camera,
    title: 'Verify & Inspect Receipts',
    detail: 'Pass live camera proof at alarm time and audit fees in History.',
  },
];

/**
 * Looping animated accountability visual (Slide 4 — GIF-like continuous kinetic motion)
 */
const AnimatedAccountabilityReel: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase((prev) => (prev + 1) % 3);
    }, 1700);
    return () => window.clearInterval(id);
  }, []);

  const stages = [
    {
      label: '06:00 AM · Stake Locked',
      metric: '$25.00 USDC',
      accent: 'text-[#F16A2E]',
      icon: Lock,
    },
    {
      label: 'Live AI Camera Scan',
      metric: 'Verified · 1.4s',
      accent: 'text-[#38BDF8]',
      icon: Camera,
    },
    {
      label: 'Streak Protected',
      metric: '+$4.50 Split',
      accent: 'text-[#4ADE80]',
      icon: Flame,
    },
  ];

  const active = stages[phase];
  const ActiveIcon = active.icon;

  return (
    <div
      className={`relative w-full h-full flex items-center justify-center ${
        compact ? 'pb-48 pt-16 px-6' : 'pb-36 pt-16 px-8'
      }`}
    >
      <div className="relative flex flex-col items-center">
        {/* Outer Rotating Orbital Ring */}
        <div
          className={`relative flex items-center justify-center ${
            compact ? 'w-44 h-44' : 'w-56 h-56'
          }`}
        >
          <svg
            viewBox="0 0 200 200"
            className="absolute inset-0 w-full h-full actake-orbit-slow"
            aria-hidden="true"
          >
            <circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke="rgba(241, 106, 46, 0.28)"
              strokeWidth="1.5"
              strokeDasharray="14 10"
            />
            <circle
              cx="100"
              cy="100"
              r="76"
              fill="none"
              stroke="rgba(255, 255, 255, 0.14)"
              strokeWidth="1"
            />
          </svg>

          {/* Animated Scan Frame */}
          <div
            className={`relative overflow-hidden rounded-3xl bg-[#0D0E14]/85 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center text-center shadow-[0_20px_50px_rgba(0,0,0,0.55)] ${
              compact ? 'w-32 h-32 p-3' : 'w-40 h-40 p-4'
            }`}
          >
            <span
              aria-hidden="true"
              className="actake-scan-beam pointer-events-none absolute inset-x-3 h-[2px] bg-gradient-to-r from-transparent via-[#F16A2E] to-transparent"
            />
            <span className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center mb-2">
              <ActiveIcon className={`w-5 h-5 ${active.accent}`} />
            </span>
            <div className="font-mono text-xs font-bold text-white tabular-nums">
              {active.metric}
            </div>
            <div className="text-[10px] text-white/65 mt-0.5 leading-tight">{active.label}</div>
          </div>
        </div>

        {/* 7-Day Animated Streak Dots */}
        <div className="mt-5 flex items-center gap-2">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => {
            const lit = idx <= phase + 4;
            return (
              <span
                key={`${day}-${idx}`}
                className={`w-7 h-7 rounded-full text-[10px] font-mono font-bold flex items-center justify-center transition-all duration-300 ${
                  lit
                    ? 'bg-[#F16A2E] text-white shadow-[0_0_16px_rgba(241,106,46,0.55)]'
                    : 'bg-white/10 text-white/50 border border-white/10'
                }`}
              >
                {day}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const AuthPage: React.FC<AuthPageProps> = ({
  wallets,
  platform,
  connecting,
  error,
  onConnect,
  onBack,
}) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [infoTab, setInfoTab] = useState<'best' | 'navigate'>('best');
  const [mobileGuideOpen, setMobileGuideOpen] = useState(false);

  // Synced auto-advancing slideshow shared across Desktop & Mobile
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % AUTH_SLIDES.length);
    }, SLIDE_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [paused, slideIndex]);

  // Close cleanly on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !connecting) {
        onBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [connecting, onBack]);

  const currentSlide = AUTH_SLIDES[slideIndex];

  const primaryWallet = useMemo(() => {
    return (
      wallets.find((w) => w.kind === 'pollar' && w.available) ||
      wallets.find((w) => w.kind === 'wallet-standard' && w.available) ||
      wallets.find((w) => w.kind === 'mwa' && w.available) ||
      wallets[0]
    );
  }, [wallets]);

  const secondaryWallets = useMemo(() => {
    return wallets.filter((w) => w.id !== primaryWallet?.id);
  }, [wallets, primaryWallet]);

  const DeviceIcon = platform.os === 'desktop' ? Laptop : Smartphone;

  const formatShortWalletLabel = (w: DiscoveredWalletOption): string => {
    if (w.kind === 'pollar') return 'Continue with Pollar';
    if (w.kind === 'mwa') return 'Continue with Seeker MWA';
    if (w.kind === 'browser-vault') return 'Continue with Browser Vault';
    return `Continue with ${w.name}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to Actake"
      className="fixed inset-0 z-50 overflow-y-auto bg-[#09090D] text-white"
    >
      {/* =====================================================================
          MOBILE VIEWPORT (< lg): Full-Bleed Cinematic Editorial Auth Screen
          Inspired by Attachment 2 (full-bleed runner/focus slideshow + crisp
          stacked pill sign-in buttons with Pollar & Solflare/Solana logos)
      ===================================================================== */}
      <div className="lg:hidden relative min-h-[100dvh] w-full flex flex-col justify-between overflow-hidden bg-[#090A0E]">
        {/* Synced Full-Bleed Slideshow Backdrop */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {AUTH_SLIDES.map((slide, idx) => {
            const active = idx === slideIndex;
            return (
              <div
                key={slide.id}
                aria-hidden={!active}
                className={`absolute inset-0 transition-opacity duration-700 ${
                  active ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <img
                  key={`${slide.id}-${active ? 'on' : 'off'}`}
                  src={slide.imageSrc}
                  alt=""
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover object-center ${
                    slide.kind === 'motion'
                      ? 'scale-105 blur-[3px] opacity-40'
                      : active
                        ? 'actake-ken-burns'
                        : ''
                  }`}
                />
                {slide.kind === 'motion' && active && <AnimatedAccountabilityReel compact />}
              </div>
            );
          })}

          {/* Measured High-Contrast Scrim */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-[#090A0E]/65 via-[#090A0E]/30 to-[#090A0E]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#090A0E] via-[#090A0E]/92 to-transparent"
          />
        </div>

        {/* Mobile Top Utility Bar + Synced Slideshow Progress Indicators */}
        <div className="relative z-20 px-4 pt-4 space-y-3">
          {/* 4-Slide Tap-to-Switch Progress Bars */}
          <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="Accountability showcase slides">
            {AUTH_SLIDES.map((slide, idx) => {
              const isCurrent = idx === slideIndex;
              const isPast = idx < slideIndex;
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={isCurrent}
                  aria-label={`Slide ${idx + 1}: ${slide.chapter}`}
                  onClick={() => setSlideIndex(idx)}
                  className="h-6 flex items-center cursor-pointer"
                >
                  <span className="h-[3px] w-full rounded-full bg-white/25 overflow-hidden block">
                    <span
                      key={isCurrent ? `m-prog-${slideIndex}-${paused}` : `m-static-${idx}`}
                      className={`block h-full w-full rounded-full bg-white ${
                        isCurrent && !paused
                          ? 'actake-slide-progress-fill'
                          : isPast || isCurrent
                            ? 'scale-x-100'
                            : 'scale-x-0'
                      }`}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={connecting}
              className="min-h-[40px] px-3.5 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#F16A2E]" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
              className="min-h-[40px] px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-[11px] font-medium text-white/85 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {paused ? <Play className="w-3 h-3 text-[#F16A2E]" /> : <Pause className="w-3 h-3 text-[#F16A2E]" />}
              <span>{currentSlide.chapter}</span>
            </button>
          </div>
        </div>

        {/* Mobile Lower Content: Centered Brand Wordmark, Slide Quote & Stacked Sign-In Pills */}
        <div className="relative z-20 px-5 pb-7 pt-24 space-y-5">
          {/* Centered Brand Mark & Editorial Consistency Quote */}
          <div className="text-center space-y-2.5 max-w-sm mx-auto">
            <div className="flex justify-center">
              <BrandMark inverted size="lg" />
            </div>
            <p className="text-sm font-medium text-white/90 leading-snug text-balance">
              &ldquo;{currentSlide.quote}&rdquo;
            </p>
            <div className="text-[11px] font-mono text-white/55">{currentSlide.attribution}</div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-2xl bg-red-950/85 border border-red-500/40 px-4 py-3 flex items-start gap-2.5 text-xs text-red-200 max-w-md mx-auto"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Stacked Signature Pill Sign-In Buttons (Synced Wallet List) */}
          <div className="space-y-2.5 max-w-md mx-auto w-full">
            {primaryWallet && (
              <button
                type="button"
                disabled={connecting || !primaryWallet.available}
                onClick={() => onConnect(primaryWallet.id)}
                className="w-full min-h-[54px] px-5 py-3 rounded-full bg-white hover:bg-[#FFF5EE] active:scale-[0.99] disabled:opacity-60 text-[#111114] text-sm font-bold shadow-[0_14px_34px_rgba(0,0,0,0.45)] flex items-center justify-center gap-3 transition-all cursor-pointer"
              >
                {connecting ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#F16A2E] shrink-0" />
                ) : primaryWallet.kind === 'pollar' ? (
                  <img
                    src={POLLAR_LOGO_SRC}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-md object-contain bg-[#0C1324] p-0.5 shrink-0"
                  />
                ) : (
                  <WalletBrandIcon option={primaryWallet} size="sm" theme="light" />
                )}
                <span className="truncate">
                  {connecting ? 'Connecting...' : formatShortWalletLabel(primaryWallet)}
                </span>
              </button>
            )}

            {secondaryWallets.map((w) => (
              <button
                key={w.id}
                type="button"
                disabled={connecting || !w.available}
                onClick={() => onConnect(w.id)}
                className={`w-full min-h-[52px] px-5 py-3 rounded-full backdrop-blur-md border text-sm font-semibold flex items-center justify-center gap-3 transition-all ${
                  !w.available
                    ? 'bg-white/[0.04] border-white/10 text-white/40 cursor-not-allowed'
                    : 'bg-white/[0.11] hover:bg-white/[0.18] active:scale-[0.99] border-white/18 text-white cursor-pointer'
                }`}
              >
                <WalletBrandIcon option={w} size="sm" theme="dark" />
                <span className="truncate">{formatShortWalletLabel(w)}</span>
                {!w.available && (
                  <span className="text-[10px] font-mono text-white/45 shrink-0">
                    (Android Chrome)
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Mobile Expandable Best-Option & Navigation Guide */}
          <div className="max-w-md mx-auto w-full space-y-2.5">
            <button
              type="button"
              aria-expanded={mobileGuideOpen}
              onClick={() => setMobileGuideOpen((prev) => !prev)}
              className="w-full min-h-[40px] px-4 py-2 rounded-2xl bg-white/[0.06] border border-white/10 text-xs font-semibold text-white/85 flex items-center justify-between gap-2"
            >
              <span className="inline-flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-[#F16A2E]" />
                <span>Which option is best &amp; how to navigate</span>
              </span>
              <ChevronDown
                className={`w-4 h-4 text-white/60 transition-transform duration-200 ${
                  mobileGuideOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {mobileGuideOpen && (
              <div className="rounded-2xl bg-[#111218]/95 border border-white/12 p-4 space-y-3 text-left">
                <div className="space-y-2.5 divide-y divide-white/10">
                  {OPTION_COMPARISON.map((row) => (
                    <div key={row.id} className="pt-2.5 first:pt-0 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">{row.title}</span>
                        <span className="text-[11px] font-semibold text-[#F16A2E]">{row.tag}</span>
                      </div>
                      <p className="text-[11.5px] text-white/65 leading-relaxed">{row.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="pt-2.5 border-t border-white/10 flex items-start gap-2 text-[11px] text-white/65">
                  <Fuel className="w-3.5 h-3.5 text-[#4ADE80] shrink-0 mt-0.5" />
                  <span>
                    Zero gas to sign in. Keep ~0.01 Devnet SOL for stake transactions or fund via
                    Pollar RAMP inside Today.
                  </span>
                </div>
              </div>
            )}

            <p className="text-center text-[11px] text-white/50 leading-relaxed pt-1">
              Sign-In With Solana (SIWS) on Devnet · Non-custodial escrow · Switch wallets anytime
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================================
          DESKTOP / LARGE SCREEN VIEWPORT (>= lg):
          Premium Dark Obsidian SaaS Frame with Warm Orange Ambient Aura
          Inspired directly by Attachment 3
      ===================================================================== */}
      <div className="hidden lg:flex min-h-screen w-full actake-auth-glow-stage items-center justify-center p-6 xl:p-10">
        <div className="w-full max-w-[1180px] rounded-[30px] bg-[#0E0F14]/96 border border-white/12 shadow-[0_32px_90px_rgba(0,0,0,0.72)] overflow-hidden flex flex-col">
          {/* Outer Shell Header */}
          <header className="px-7 xl:px-8 h-16 border-b border-white/8 flex items-center justify-between gap-6">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center cursor-pointer"
              aria-label="Return to Actake overview"
            >
              <BrandMark inverted size="md" />
            </button>

            <div className="flex items-center gap-5 text-xs text-white/70">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <DeviceIcon className="w-3.5 h-3.5 text-[#F16A2E]" />
                <span className="capitalize">
                  {platform.os} · {platform.browser}
                </span>
              </span>
              <span aria-hidden="true" className="text-white/25">
                ·
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-white/90">
                <ShieldCheck className="w-3.5 h-3.5 text-[#4ADE80]" />
                <span>Solana Devnet · Zero-Gas SIWS</span>
              </span>
            </div>
          </header>

          {/* Main 2-Column Editorial Split */}
          <div className="grid grid-cols-12 gap-7 xl:gap-9 p-7 xl:p-8 items-stretch">
            {/* LEFT PANEL (col-span-6): Cinematic Consistency & Accountability Slideshow + Animated Loop */}
            <div className="col-span-6 relative rounded-[24px] overflow-hidden bg-[#14151C] border border-white/10 min-h-[620px] flex flex-col justify-between">
              {/* Synced 4-Slide Visual Canvas */}
              <div className="absolute inset-0 z-0 overflow-hidden">
                {AUTH_SLIDES.map((slide, idx) => {
                  const active = idx === slideIndex;
                  return (
                    <div
                      key={slide.id}
                      aria-hidden={!active}
                      className={`absolute inset-0 transition-opacity duration-700 ${
                        active ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      <img
                        key={`${slide.id}-${active ? 'desk-on' : 'desk-off'}`}
                        src={slide.imageSrc}
                        alt={slide.chapter}
                        referrerPolicy="no-referrer"
                        className={`w-full h-full object-cover object-center ${
                          slide.kind === 'motion'
                            ? 'scale-105 blur-[4px] opacity-35'
                            : active
                              ? 'actake-ken-burns'
                              : ''
                        }`}
                      />
                      {slide.kind === 'motion' && active && <AnimatedAccountabilityReel />}
                    </div>
                  );
                })}

                {/* Editorial Contrast Scrim */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#09090D] via-[#09090D]/35 to-[#09090D]/30"
                />
              </div>

              {/* Top Overlay Row inside Left Visual Card */}
              <div className="relative z-10 p-5 flex items-center justify-between gap-3">
                <span className="text-xs font-mono font-semibold text-white/80 tracking-wide">
                  {currentSlide.chapter}
                </span>
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  aria-label={paused ? 'Resume showcase slideshow' : 'Pause showcase slideshow'}
                  className="min-h-[34px] px-3 py-1 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-white/85 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {paused ? (
                    <>
                      <Play className="w-3 h-3 text-[#F16A2E]" />
                      <span>Play</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3 h-3 text-[#F16A2E]" />
                      <span>Auto</span>
                    </>
                  )}
                </button>
              </div>

              {/* Bottom Editorial Quote + 4 Animated Progress Bars (Matching Attachment 3) */}
              <div className="relative z-10 p-6 xl:p-7 space-y-5">
                <div className="space-y-2.5">
                  <blockquote className="font-display text-2xl xl:text-[26px] font-bold text-white leading-[1.24] tracking-tight text-balance">
                    &ldquo;{currentSlide.quote}&rdquo;
                  </blockquote>
                  <div className="text-right text-xs font-mono text-white/65">
                    {currentSlide.attribution}
                  </div>
                </div>

                {/* 4 Horizontal Slide Progress Bars */}
                <div
                  className="grid grid-cols-4 gap-2.5"
                  role="tablist"
                  aria-label="Accountability slideshow navigation"
                >
                  {AUTH_SLIDES.map((slide, idx) => {
                    const isCurrent = idx === slideIndex;
                    const isPast = idx < slideIndex;
                    return (
                      <button
                        key={slide.id}
                        type="button"
                        role="tab"
                        aria-selected={isCurrent}
                        aria-label={`View ${slide.chapter}`}
                        onClick={() => setSlideIndex(idx)}
                        className="group py-2 text-left cursor-pointer"
                      >
                        <span className="block h-[3px] w-full rounded-full bg-white/20 overflow-hidden">
                          <span
                            key={isCurrent ? `d-prog-${slideIndex}-${paused}` : `d-static-${idx}`}
                            className={`block h-full w-full rounded-full ${
                              isCurrent ? 'bg-[#F16A2E]' : 'bg-white/75'
                            } ${
                              isCurrent && !paused
                                ? 'actake-slide-progress-fill'
                                : isPast || isCurrent
                                  ? 'scale-x-100'
                                  : 'scale-x-0'
                            }`}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT PANEL (col-span-6): Premium Dark SaaS Sign-In Form & Helpful Guidance */}
            <div className="col-span-6 flex flex-col justify-between gap-5 py-1">
              <div className="space-y-5">
                {/* Back to Home Pill (Direct nod to Attachment 3's orange-arrow Back button) */}
                <div>
                  <button
                    type="button"
                    onClick={onBack}
                    disabled={connecting}
                    className="min-h-[38px] pl-1.5 pr-4 py-1 rounded-full bg-white/10 hover:bg-white/16 border border-white/10 text-[11px] font-bold uppercase tracking-[0.08em] text-white/90 inline-flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span className="w-7 h-7 rounded-full bg-[#F16A2E] text-white flex items-center justify-center shrink-0">
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </span>
                    <span>Back to Home</span>
                  </button>
                </div>

                {/* Title & Value Subtitle */}
                <div className="space-y-1.5">
                  <h1
                    id="actake-auth-heading"
                    className="font-display text-3xl xl:text-[34px] font-extrabold text-white tracking-tight leading-tight"
                  >
                    Welcome Back
                  </h1>
                  <p className="text-sm text-white/65 leading-relaxed">
                    Sign in to your Actake accountability vault to stake USDC or 0%-fee SKR, track
                    live balances, and verify daily alarms.
                  </p>
                </div>

                {/* Flagship Primary Orange CTA (Recommended Sign-In with Real Pollar Logo) */}
                {primaryWallet && (
                  <button
                    type="button"
                    disabled={connecting || !primaryWallet.available}
                    onClick={() => onConnect(primaryWallet.id)}
                    className="w-full min-h-[52px] px-5 py-3 rounded-2xl bg-[#F16A2E] hover:bg-[#E05920] disabled:opacity-60 text-white text-sm font-bold shadow-[0_14px_34px_rgba(241,106,46,0.32)] flex items-center justify-between gap-3 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      {primaryWallet.kind === 'pollar' ? (
                        <img
                          src={POLLAR_LOGO_SRC}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-lg object-contain bg-[#0C1324] p-0.5 shrink-0"
                        />
                      ) : (
                        <WalletBrandIcon option={primaryWallet} size="sm" theme="dark" />
                      )}
                      <span className="truncate">
                        {connecting ? 'Connecting...' : formatShortWalletLabel(primaryWallet)}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/95 whitespace-nowrap shrink-0">
                      <span>Recommended</span>
                      {connecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowRight className="w-4 h-4" />
                      )}
                    </span>
                  </button>
                )}

                {error && (
                  <div
                    role="alert"
                    className="rounded-2xl bg-red-950/70 border border-red-500/40 px-4 py-3 flex items-start gap-2.5 text-xs text-red-200"
                  >
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-bold text-red-100">Sign-in did not complete</div>
                      <p className="mt-0.5 leading-relaxed">{error}</p>
                    </div>
                  </div>
                )}

                {/* Subtle Divider */}
                <div className="flex items-center gap-3 text-[11px] font-medium text-white/40">
                  <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
                  <span>all synced Solana sign-in options</span>
                  <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
                </div>

                {/* Unified Synced Wallet List (Dark Mode Variant) */}
                <UnifiedWalletList
                  wallets={wallets}
                  mode="connect"
                  busy={connecting}
                  theme="dark"
                  onSelect={(id) => onConnect(id)}
                />
              </div>

              {/* Helpful Guidance & Navigation Tabs (Best Choice vs How to Navigate) */}
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/8">
                    <button
                      type="button"
                      onClick={() => setInfoTab('best')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        infoTab === 'best'
                          ? 'bg-white/14 text-white'
                          : 'text-white/55 hover:text-white'
                      }`}
                    >
                      Which option is best?
                    </button>
                    <button
                      type="button"
                      onClick={() => setInfoTab('navigate')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        infoTab === 'navigate'
                          ? 'bg-white/14 text-white'
                          : 'text-white/55 hover:text-white'
                      }`}
                    >
                      How to navigate
                    </button>
                  </div>
                  <span className="text-[11px] font-mono text-white/45 whitespace-nowrap">
                    Switch anytime
                  </span>
                </div>

                {infoTab === 'best' ? (
                  <div className="divide-y divide-white/8">
                    {OPTION_COMPARISON.map((row) => (
                      <div
                        key={row.id}
                        className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          {row.id === 'pollar' ? (
                            <img
                              src={POLLAR_LOGO_SRC}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-5 h-5 rounded-md object-contain bg-[#0C1324] p-0.5 shrink-0 mt-0.5"
                            />
                          ) : row.id === 'solana' ? (
                            <SolflareMark className="w-5 h-5 shrink-0 mt-0.5" />
                          ) : (
                            <KeyRound className="w-4 h-4 text-[#34D399] shrink-0 mt-1" />
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <span className="text-xs font-bold text-white">{row.title}</span>
                              <span className="text-[11px] font-semibold text-[#F16A2E]">
                                {row.tag}
                              </span>
                            </div>
                            <p className="text-[11.5px] text-white/60 mt-0.5 leading-relaxed">
                              {row.detail}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono text-white/45 tabular-nums whitespace-nowrap shrink-0">
                          {row.setup}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2.5">
                      {NAVIGATION_STEPS.map((item) => {
                        const Icon = item.icon;
                        return (
                          <div
                            key={item.step}
                            className="rounded-xl bg-black/30 border border-white/8 p-3 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <Icon className="w-4 h-4 text-[#F16A2E]" />
                              <span className="font-mono text-[10px] font-bold text-white/40 tabular-nums">
                                {item.step}
                              </span>
                            </div>
                            <div className="text-xs font-bold text-white">{item.title}</div>
                            <p className="text-[11px] text-white/60 leading-snug">{item.detail}</p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[11px] text-white/60 pt-0.5">
                      <span className="inline-flex items-center gap-1.5">
                        <Fuel className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
                        <span>Keep ~0.01 Devnet SOL for gas, or fund via Pollar RAMP</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
                        <RefreshCw className="w-3 h-3 text-[#F16A2E]" />
                        <span>Switch wallet in top bar</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Subtle Bottom Bar inside SaaS Frame */}
          <footer className="px-7 xl:px-8 py-3.5 border-t border-white/8 flex items-center justify-between gap-4 text-[11px] text-white/45">
            <span>Actake — Social Accountability &amp; Streak Escrow on Solana Devnet</span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#4ADE80]" />
              <span>Non-Custodial · Explorer Receipts · iOS, Android &amp; Desktop</span>
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
};
