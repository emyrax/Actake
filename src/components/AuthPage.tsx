import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronDown,
  ChevronRight,
  Flame,
  Fuel,
  HelpCircle,
  KeyRound,
  Loader2,
  Lock,
  Pause,
  Play,
  RefreshCw,
  Wallet,
  Zap,
} from 'lucide-react';
import runnerConsistencyImg from '../assets/images/auth_consistency_runner_1795791939979.jpg';
import focusAccountabilityImg from '../assets/images/auth_accountability_focus_1795791939217.jpg';
import sunriseCommitmentImg from '../assets/images/auth_streak_sunrise_1795791940392.jpg';
import { DiscoveredWalletOption, PlatformCompatibility } from '../types/actake';
import { BrandMark } from './BrandMark';
import {
  getWalletCapabilityLine,
  POLLAR_LOGO_SRC,
  SolflareMark,
  WalletBrandIcon,
} from './UnifiedWalletList';

interface AuthPageProps {
  wallets: DiscoveredWalletOption[];
  platform: PlatformCompatibility;
  connecting: boolean;
  error: string | null;
  pendingPoolInvite?: string | null;
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
    attribution: '— Non-Custodial Accountability Escrow',
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
      'Sign in with Email, Google, or Passkey and fund USDC/SOL directly with Pollar RAMP — no browser extension required.',
    setup: '~15 sec',
  },
  {
    id: 'solana',
    title: 'Solflare · Phantom · Seeker MWA',
    tag: 'Best for Solana wallets',
    detail:
      'Connect your existing Solana wallet or Seeker Seed Vault for direct self-custody SPL USDC and 0%-fee SKR staking.',
    setup: 'Instant',
  },
  {
    id: 'vault',
    title: 'Browser Devnet Vault',
    tag: 'Best for quick preview',
    detail:
      'Creates a local Ed25519 keypair in your browser immediately so you can test alarms and AI check-ins before funding.',
    setup: '1 tap',
  },
];

const NAVIGATION_STEPS = [
  {
    step: '01',
    icon: Wallet,
    title: 'Today Vault',
    detail: 'Monitor live USDC & SOL balances, 24h fluctuation, and toggle USDC/SOL.',
  },
  {
    step: '02',
    icon: Zap,
    title: 'Quick Stake or Missions',
    detail: 'Expand Quick Actions for 1-tap presets or configure custom alarm rules.',
  },
  {
    step: '03',
    icon: Camera,
    title: 'Verify & Claim',
    detail: 'Pass live camera verification on time and inspect receipts in History.',
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
        compact ? 'pb-48 pt-16 px-6' : 'pb-36 pt-14 px-6'
      }`}
    >
      <div className="relative flex flex-col items-center">
        <div
          className={`relative flex items-center justify-center ${
            compact ? 'w-44 h-44' : 'w-48 h-48 lg:w-52 lg:h-52'
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
              stroke="rgba(241, 106, 46, 0.30)"
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

          <div
            className={`relative overflow-hidden rounded-3xl bg-[#0D0E14]/85 backdrop-blur-md border border-white/15 flex flex-col items-center justify-center text-center shadow-[0_20px_50px_rgba(0,0,0,0.55)] ${
              compact ? 'w-32 h-32 p-3' : 'w-36 h-36 lg:w-40 lg:h-40 p-4'
            }`}
          >
            <span
              aria-hidden="true"
              className="actake-scan-beam pointer-events-none absolute inset-x-3 h-[2px] bg-gradient-to-r from-transparent via-[#F16A2E] to-transparent"
            />
            <span className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center mb-2">
              <ActiveIcon className={`w-5 h-5 ${active.accent}`} />
            </span>
            <div className="font-mono text-sm font-bold text-white tabular-nums">
              {active.metric}
            </div>
            <div className="text-[11px] text-white/65 mt-0.5 leading-tight">{active.label}</div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-1.5">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => {
            const lit = idx <= phase + 4;
            return (
              <span
                key={`${day}-${idx}`}
                className={`w-7 h-7 rounded-full text-[10.5px] font-mono font-bold flex items-center justify-center transition-all duration-300 ${
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
  connecting,
  error,
  pendingPoolInvite,
  onConnect,
  onBack,
}) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [infoTab, setInfoTab] = useState<'best' | 'navigate'>('best');
  const [guideExpanded, setGuideExpanded] = useState(false);
  const [mobileGuideOpen, setMobileGuideOpen] = useState(false);

  // Synced auto-advancing slideshow shared across Desktop Pop-up & Mobile Full-Screen
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

  const formatShortWalletLabel = (w: DiscoveredWalletOption): string => {
    if (w.kind === 'pollar') return 'Continue with Pollar';
    if (w.kind === 'mwa') return 'Continue with Seeker MWA';
    if (w.kind === 'browser-vault') return 'Continue with Browser Vault';
    return `Continue with ${w.name}`;
  };

  const formatDesktopWalletTitle = (w: DiscoveredWalletOption): string => {
    if (w.kind === 'mwa') return 'Seeker / Android MWA';
    if (w.kind === 'browser-vault') return 'Browser Devnet Vault';
    if (w.kind === 'pollar') return 'Pollar Account';
    return w.name;
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Sign in to Actake">
      {/* =====================================================================
          MOBILE VIEWPORT (< md): Full-Bleed Cinematic Editorial Auth Screen
      ===================================================================== */}
      <div className="md:hidden fixed inset-0 z-50 overflow-y-auto bg-[#090A0E] text-white">
        <div className="relative min-h-[100dvh] w-full flex flex-col justify-between overflow-hidden bg-[#090A0E]">
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

            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-[#090A0E]/65 via-[#090A0E]/30 to-[#090A0E]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#090A0E] via-[#090A0E]/92 to-transparent"
            />
          </div>

          {/* Mobile Top Bar + Synced Slideshow Progress Indicators */}
          <div className="relative z-20 px-4 pt-4 space-y-3">
            <div
              className="grid grid-cols-4 gap-1.5"
              role="tablist"
              aria-label="Accountability showcase slides"
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
                {paused ? (
                  <Play className="w-3 h-3 text-[#F16A2E]" />
                ) : (
                  <Pause className="w-3 h-3 text-[#F16A2E]" />
                )}
                <span>{currentSlide.chapter}</span>
              </button>
            </div>
          </div>

          {/* Mobile Lower Content: Brand Mark, Quote & Stacked Sign-In Pills */}
          <div className="relative z-20 px-5 pb-7 pt-24 space-y-5">
            <div className="text-center space-y-2.5 max-w-sm mx-auto">
              <div className="flex justify-center">
                <BrandMark inverted size="lg" />
              </div>
              <p className="text-sm font-medium text-white/90 leading-snug text-balance">
                &ldquo;{currentSlide.quote}&rdquo;
              </p>
              <div className="text-[11px] font-mono text-white/55">{currentSlide.attribution}</div>
            </div>

            {/* Collapsible Best-Option & Step-by-Step Navigation Guide (Above Sign-In Buttons, Closed by Default) */}
            <div className="max-w-md mx-auto w-full space-y-2.5">
              <button
                type="button"
                aria-expanded={mobileGuideOpen}
                onClick={() => setMobileGuideOpen((prev) => !prev)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-white/[0.07] hover:bg-white/[0.11] border border-white/12 text-xs font-semibold text-white/90 flex items-center justify-between gap-2 backdrop-blur-md transition-colors cursor-pointer"
              >
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <HelpCircle className="w-3.5 h-3.5 text-[#F16A2E] shrink-0" />
                  <span className="truncate">Which option is best &amp; how to navigate</span>
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-white/60 shrink-0 transition-transform duration-200 ${
                    mobileGuideOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {mobileGuideOpen && (
                <div className="rounded-2xl bg-[#111218]/95 border border-white/12 p-4 space-y-3.5 text-left backdrop-blur-md">
                  <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/8">
                    <button
                      type="button"
                      onClick={() => setInfoTab('best')}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
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
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        infoTab === 'navigate'
                          ? 'bg-white/14 text-white'
                          : 'text-white/55 hover:text-white'
                      }`}
                    >
                      How to navigate
                    </button>
                  </div>

                  {infoTab === 'best' ? (
                    <div className="space-y-2.5 divide-y divide-white/10">
                      {OPTION_COMPARISON.map((row) => (
                        <div key={row.id} className="pt-2.5 first:pt-0 space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white">{row.title}</span>
                            <span className="text-[11px] font-semibold text-[#F16A2E]">
                              {row.tag}
                            </span>
                          </div>
                          <p className="text-[11.5px] text-white/65 leading-relaxed">{row.detail}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {NAVIGATION_STEPS.map((item) => {
                        const Icon = item.icon;
                        return (
                          <div
                            key={item.step}
                            className="rounded-xl bg-black/35 border border-white/8 p-3 flex items-start gap-2.5"
                          >
                            <Icon className="w-3.5 h-3.5 text-[#F16A2E] shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-white">{item.title}</span>
                                <span className="font-mono text-[10px] font-bold text-white/40 tabular-nums">
                                  {item.step}
                                </span>
                              </div>
                              <p className="text-[11px] text-white/65 mt-0.5 leading-relaxed">
                                {item.detail}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-2.5 border-t border-white/10 flex items-start gap-2 text-[11px] text-white/65">
                    <Fuel className="w-3.5 h-3.5 text-[#4ADE80] shrink-0 mt-0.5" />
                    <span>
                      Keep a small Devnet SOL balance for gas or fund directly through Pollar RAMP
                      after signing in.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {pendingPoolInvite && (
              <div className="rounded-2xl bg-[#F16A2E]/16 border border-[#F16A2E]/40 px-4 py-3 flex items-start gap-2.5 text-xs text-white max-w-md mx-auto text-left">
                <Lock className="w-4 h-4 text-[#F16A2E] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-bold">Connect wallet to preview pool invite</div>
                  <p className="text-white/75 mt-0.5 leading-relaxed">
                    Invite <span className="font-mono text-[#FF9B6B]">{pendingPoolInvite}</span>{' '}
                    opens immediately after sign-in.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-2xl bg-red-950/85 border border-red-500/40 px-4 py-3 flex items-start gap-2.5 text-xs text-red-200 max-w-md mx-auto"
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

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

            <p className="text-center text-[11px] text-white/45 leading-relaxed pt-1">
              Non-custodial escrow · Switch wallets anytime
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================================
          TABLET, DESKTOP & LARGE SCREENS (>= md):
          Full-Screen Edge-to-Edge Spacious Row Layout (justify-between)
      ===================================================================== */}
      <div className="hidden md:flex fixed inset-0 z-50 overflow-y-auto flex-col justify-between min-h-screen w-full text-white actake-auth-glow-stage">
        {/* Clean Full-Width Standard Top Bar */}
        <header className="w-full px-6 md:px-10 lg:px-14 xl:px-20 h-20 flex items-center justify-between gap-6 border-b border-white/[0.07] bg-[#0B0C10]/75 backdrop-blur-md shrink-0">
          <button
            type="button"
            onClick={onBack}
            disabled={connecting}
            className="inline-flex items-center rounded-xl cursor-pointer disabled:opacity-50"
            aria-label="Actake Home"
          >
            <BrandMark inverted size="md" />
          </button>

          <div className="flex items-center gap-3 lg:gap-5">
            <button
              type="button"
              onClick={() => setGuideExpanded((prev) => !prev)}
              className="min-h-[40px] px-4 py-2 rounded-full text-xs font-semibold text-white/75 hover:text-white hover:bg-white/[0.07] inline-flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-[#F16A2E]" />
              <span>{guideExpanded ? 'Hide guide' : 'Sign-in guide'}</span>
            </button>

            <button
              type="button"
              onClick={onBack}
              disabled={connecting}
              className="min-h-[42px] pl-1.5 pr-4 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/12 text-xs font-semibold text-white inline-flex items-center gap-2.5 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <span className="w-7 h-7 rounded-full bg-[#F16A2E] text-white flex items-center justify-center shrink-0">
                <ArrowLeft className="w-3.5 h-3.5" />
              </span>
              <span>Back to Home</span>
            </button>
          </div>
        </header>

        {/* Full-Screen Spacious Two-Column Row with Generous Space Between */}
        <main className="flex-1 w-full px-6 md:px-10 lg:px-14 xl:px-20 py-8 lg:py-12 flex flex-row items-stretch justify-between gap-8 lg:gap-14 xl:gap-20">
          {/* LEFT COLUMN: Full-Height Synced 4-Slide Consistency & Accountability Showcase */}
          <section
            aria-label="Accountability showcase"
            className="w-[45%] lg:w-[46%] xl:w-[45%] shrink-0 flex flex-col"
          >
            <div className="relative flex-1 min-h-[540px] lg:min-h-[600px] rounded-[28px] overflow-hidden bg-[#12131A] border border-white/12 shadow-[0_28px_80px_rgba(0,0,0,0.58)] flex flex-col justify-between">
                  {/* Synced Visual Canvas */}
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

                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-[#09090D] via-[#09090D]/32 to-[#09090D]/42"
                    />
                  </div>

                  {/* Top Slide Caption & Pause Control */}
                  <div className="relative z-10 px-5 pt-5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-semibold text-white/80 truncate">
                      {currentSlide.chapter}
                    </span>

                    <button
                      type="button"
                      onClick={() => setPaused((p) => !p)}
                      aria-label={paused ? 'Resume showcase slideshow' : 'Pause showcase slideshow'}
                      className="min-h-[30px] px-3 py-1 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-white/90 inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      {paused ? (
                        <>
                          <Play className="w-3 h-3 text-[#F16A2E]" />
                          <span>Play</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-3 h-3 text-[#F16A2E]" />
                          <span>Pause</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Bottom Quote + 4 Interactive Progress Bars */}
                  <div className="relative z-10 px-5 pb-5 space-y-4">
                    <div className="space-y-2">
                      <blockquote className="font-display text-lg lg:text-xl font-bold text-white leading-[1.28] tracking-tight text-balance">
                        &ldquo;{currentSlide.quote}&rdquo;
                      </blockquote>
                      <div className="text-[11.5px] font-mono text-white/65">
                        {currentSlide.attribution}
                      </div>
                    </div>

                    <div
                      className="grid grid-cols-4 gap-2"
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
                            className="py-1.5 text-left cursor-pointer"
                          >
                            <span className="block h-[3px] w-full rounded-full bg-white/20 overflow-hidden">
                              <span
                                key={
                                  isCurrent ? `d-prog-${slideIndex}-${paused}` : `d-static-${idx}`
                                }
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
          </section>

          {/* RIGHT COLUMN: Full-Screen Spacious Auth Workspace */}
          <section
            aria-label="Sign in options"
            className="flex-1 min-w-0 flex flex-col justify-center py-2 lg:py-4"
          >
            <div className="w-full space-y-6 lg:space-y-7">
              {pendingPoolInvite && (
                <div className="rounded-2xl bg-[#F16A2E]/14 border border-[#F16A2E]/35 px-4 py-3 flex items-start gap-3">
                  <Lock className="w-4 h-4 text-[#F16A2E] shrink-0 mt-0.5" />
                  <div className="min-w-0 text-xs">
                    <div className="font-bold text-white">
                      Connect a wallet to preview pool invite
                    </div>
                    <p className="text-white/70 mt-0.5 leading-relaxed">
                      Target pool <span className="font-mono text-[#FF9B6B]">{pendingPoolInvite}</span>{' '}
                      opens automatically with full rules, traction, and daily alarm setup once you sign in.
                    </p>
                  </div>
                </div>
              )}

              {/* Heading */}
              <div className="space-y-3">
                <h1 className="font-display text-3xl lg:text-4xl xl:text-[44px] font-extrabold text-white tracking-tight leading-[1.08]">
                  Welcome back
                </h1>
                <p className="text-sm lg:text-[15.5px] text-white/65 leading-relaxed max-w-xl">
                  Sign in to your Actake vault to lock daily accountability stakes, monitor live
                  USDC &amp; SOL balances, and verify your streak.
                </p>
              </div>

                  {/* Collapsible Helpful Guide & Step-by-Step Navigation (Above Sign-In Buttons, Closed by Default) */}
                  <div className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden">
                    <button
                      type="button"
                      aria-expanded={guideExpanded}
                      onClick={() => setGuideExpanded((prev) => !prev)}
                      className="w-full min-h-[46px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.05] transition-colors cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/85 min-w-0">
                        <HelpCircle className="w-3.5 h-3.5 text-[#F16A2E] shrink-0" />
                        <span className="truncate">
                          Which option is best &amp; how to navigate Actake
                        </span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-white/55 shrink-0 transition-transform duration-200 ${
                          guideExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {guideExpanded && (
                      <div className="border-t border-white/10 p-4 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/8">
                            <button
                              type="button"
                              onClick={() => setInfoTab('best')}
                              className={`px-3 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
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
                              className={`px-3 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                infoTab === 'navigate'
                                  ? 'bg-white/14 text-white'
                                  : 'text-white/55 hover:text-white'
                              }`}
                            >
                              How to navigate
                            </button>
                          </div>
                          <span className="inline-flex items-center gap-1 text-[11px] text-white/55">
                            <RefreshCw className="w-3 h-3 text-[#F16A2E]" />
                            <span>Switch wallet anytime</span>
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
                                    <SolflareMark className="w-4 h-4 shrink-0 mt-0.5" />
                                  ) : (
                                    <KeyRound className="w-4 h-4 text-[#34D399] shrink-0 mt-0.5" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-baseline gap-x-2">
                                      <span className="text-xs font-bold text-white">
                                        {row.title}
                                      </span>
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
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                              {NAVIGATION_STEPS.map((item) => {
                                const Icon = item.icon;
                                return (
                                  <div
                                    key={item.step}
                                    className="rounded-xl bg-black/30 border border-white/8 p-3 space-y-1.5"
                                  >
                                    <div className="flex items-center justify-between">
                                      <Icon className="w-3.5 h-3.5 text-[#F16A2E]" />
                                      <span className="font-mono text-[10px] font-bold text-white/40 tabular-nums">
                                        {item.step}
                                      </span>
                                    </div>
                                    <div className="text-xs font-bold text-white">{item.title}</div>
                                    <p className="text-[11px] text-white/60 leading-relaxed">
                                      {item.detail}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-2 text-[11.5px] text-white/60">
                              <Fuel className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
                              <span>
                                Keep ~0.01 Devnet SOL for gas, or fund via Pollar RAMP after sign-in.
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Error Banner */}
                  {error && (
                    <div
                      role="alert"
                      className="rounded-2xl bg-red-950/75 border border-red-500/40 px-4 py-3 flex items-start gap-2.5 text-xs text-red-200"
                    >
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="font-bold text-red-100">Sign-in did not complete</div>
                        <p className="mt-0.5 leading-relaxed">{error}</p>
                      </div>
                    </div>
                  )}

                  {/* Flagship Recommended Sign-In CTA (Pollar) */}
                  {primaryWallet && (
                    <button
                      type="button"
                      disabled={connecting || !primaryWallet.available}
                      onClick={() => onConnect(primaryWallet.id)}
                      className="w-full min-h-[64px] px-5 py-3.5 rounded-2xl bg-[#F16A2E] hover:bg-[#E05920] disabled:opacity-60 text-white shadow-[0_14px_34px_rgba(241,106,46,0.28)] flex flex-wrap items-center justify-between gap-3 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-3.5 min-w-0 text-left">
                        {primaryWallet.kind === 'pollar' ? (
                          <img
                            src={POLLAR_LOGO_SRC}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-9 h-9 rounded-xl object-contain bg-[#0C1324] p-1 shrink-0 border border-white/15"
                          />
                        ) : (
                          <WalletBrandIcon option={primaryWallet} size="md" theme="dark" />
                        )}
                        <span className="min-w-0">
                          <span className="block text-[15px] font-bold leading-snug truncate">
                            {connecting ? 'Connecting...' : formatShortWalletLabel(primaryWallet)}
                          </span>
                          <span className="block text-[11.5px] text-white/85 mt-0.5 truncate">
                            {getWalletCapabilityLine(primaryWallet)}
                          </span>
                        </span>
                      </span>

                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white whitespace-nowrap shrink-0">
                        <span>Recommended</span>
                        {connecting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ArrowRight className="w-4 h-4" />
                        )}
                      </span>
                    </button>
                  )}

                  {/* Divider */}
                  <div className="flex items-center gap-3 text-xs text-white/40">
                    <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
                    <span className="whitespace-nowrap">or connect another wallet</span>
                    <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
                  </div>

                  {/* Responsive Grid of Secondary Wallets */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {secondaryWallets.map((w) => {
                      const isDisabled = !w.available || connecting;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => onConnect(w.id)}
                          className={`group w-full min-h-[74px] p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 ${
                            !w.available
                              ? 'bg-white/[0.03] border-white/[0.08] opacity-55 cursor-not-allowed'
                              : 'bg-white/[0.05] hover:bg-white/[0.09] border-white/12 hover:border-[#F16A2E]/75 cursor-pointer disabled:opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <WalletBrandIcon option={w} size="sm" theme="dark" />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white leading-snug truncate">
                                {formatDesktopWalletTitle(w)}
                              </div>
                              <div className="text-[11px] text-white/55 mt-0.5 leading-snug line-clamp-1">
                                {getWalletCapabilityLine(w)}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {!w.available ? (
                              <span className="text-[10.5px] font-medium text-white/45 whitespace-nowrap">
                                Android only
                              </span>
                            ) : (
                              <ChevronRight className="w-4 h-4 text-white/45 group-hover:text-[#F16A2E] group-hover:translate-x-0.5 transition-all" />
                            )}
                          </div>
                        </button>
                      );
                    })}
              </div>
            </div>
          </section>
        </main>

        {/* Clean Full-Width Standard SaaS Footer */}
        <footer className="w-full px-6 md:px-10 lg:px-14 xl:px-20 py-5 border-t border-white/[0.07] bg-[#0B0C10]/65 flex flex-wrap items-center justify-between gap-4 text-xs text-white/45 shrink-0">
          <span>© {new Date().getFullYear()} Actake. All rights reserved.</span>
          <span>Non-custodial accountability escrow · Switch wallets anytime</span>
        </footer>
      </div>
    </div>
  );
};
