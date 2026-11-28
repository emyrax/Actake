import React, { useState } from 'react';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  Flame,
  Smartphone,
  Users,
} from 'lucide-react';
import { DiscoveredWalletOption, PlatformCompatibility } from '../../types/actake';
import { AuthPage } from '../AuthPage';
import { MascotDisplay } from '../MascotDisplay';
import { ActakeLogo, AppleIcon, GooglePlayIcon } from './BrandIcons';
import { HeroSection } from './HeroSection';

interface ActakeLandingPageProps {
  wallets: DiscoveredWalletOption[];
  platform: PlatformCompatibility;
  connecting: boolean;
  error: string | null;
  pendingPoolInvite?: string | null;
  onConnect: (walletId: string) => void;
}

const FEATURES = [
  {
    icon: Flame,
    title: 'On-Chain Streak Stakes',
    description:
      'Commit USDC or 0%-fee SKR into non-custodial Solana escrow pools. Complete your routine to reclaim your principal plus slashed pool bonuses.',
    accent: 'bg-[#FFF1E5] text-[#FF7A00]',
  },
  {
    icon: Camera,
    title: 'Live AI Camera Verification',
    description:
      'Every alarm triggers a randomized real-world object prompt verified live on-camera with cryptographic attestation—zero fake screenshots.',
    accent: 'bg-[#EEF2FF] text-[#6366F1]',
  },
  {
    icon: Users,
    title: 'Squads & Solana Blinks',
    description:
      'Build consistency with friends or campus cohorts. Share a Squad Blink link so teammates join your morning accountability pool in seconds.',
    accent: 'bg-[#ECFDF5] text-[#10B981]',
  },
  {
    icon: Smartphone,
    title: 'Built for Solana Mobile & Web',
    description:
      'Sign in effortlessly with Pollar social passkeys, Solana Seeker Seed Vault (MWA), Phantom, Solflare, or an instant browser Ed25519 vault.',
    accent: 'bg-[#FEF3C7] text-[#D97706]',
  },
];

const WHY_POINTS = [
  {
    stat: '0%',
    label: 'Protocol fee on SKR stakes',
    detail: 'Keep 100% of your principal and earned pool splits when staking with Seeker SKR.',
  },
  {
    stat: '< 2s',
    label: 'Live camera proof check',
    detail: 'Fast real-time verification silences your alarm and logs your streak immediately.',
  },
  {
    stat: '100%',
    label: 'Self-custodial Solana escrow',
    detail: 'Transparent Devnet transaction receipts for every deposit, check-in, and payout.',
  },
];

const STORIES = [
  {
    name: 'Quinn M.',
    role: 'Solana Seeker Builder',
    streak: '34-day streak',
    quote:
      'Putting 10 USDC behind my 6:30 AM desk check-in completely killed my snooze habit. Seeing the squad verify together makes mornings genuinely fun.',
    initials: 'QM',
    tone: 'bg-[#FF7A00]',
  },
  {
    name: 'Nadia R.',
    role: 'CS Grad Student',
    streak: '21-day streak',
    quote:
      'The randomized camera prompt keeps it honest—you actually have to get up and show your mug or notebook. Earned $42 in pool splits this month.',
    initials: 'NR',
    tone: 'bg-[#6366F1]',
  },
  {
    name: 'Devon K.',
    role: 'Marathon Prep Runner',
    streak: '48-day streak',
    quote:
      'Pairing Morning Focus with our 5-person running squad Blink turned solo training into a daily ritual none of us wants to break.',
    initials: 'DK',
    tone: 'bg-[#10B981]',
  },
];

const FAQS = [
  {
    q: 'Do I need a hardware wallet or crypto experience to start?',
    a: 'No. You can sign in with one tap using Pollar (email, Google, or passkey) or open an instant local Solana Devnet vault directly in your browser. Solana Seeker MWA, Phantom, and Solflare are also supported natively.',
  },
  {
    q: 'What happens if I miss my scheduled alarm check-in?',
    a: 'If you do not complete the live camera verification before your check-in window closes, your stake for that cycle is slashed and redistributed pro-rata to the teammates who showed up on time.',
  },
  {
    q: 'How does Actake prevent people from reusing old photos?',
    a: 'When your alarm rings, Actake generates a randomized target object matched to your habit environment and verifies a live camera capture with an Ed25519 oracle attestation.',
  },
  {
    q: 'Why stake with SKR versus USDC?',
    a: 'SKR stakes carry a 0% protocol fee and a 2x ACT reputation multiplier for Solana Mobile / Seeker users, while USDC stakes offer stable dollar-denominated accountability with a 1.5% protocol fee.',
  },
];

export const ActakeLandingPage: React.FC<ActakeLandingPageProps> = ({
  wallets,
  platform,
  connecting,
  error,
  pendingPoolInvite,
  onConnect,
}) => {
  const [connectOpen, setConnectOpen] = useState<boolean>(() => {
    if (pendingPoolInvite) return true;
    if (typeof window === 'undefined') return false;
    return /^\/(auth|login|signin)\/?$/i.test(window.location.pathname);
  });
  const [openFaqIndex, setOpenFaqIndex] = useState<number>(0);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#FFF9F2] text-[#111318] actake-landing-font">
      {/* 1:1 Hero Section with Sky Gradient, Plush Flora, Floating Cards & Central Phone */}
      <HeroSection onOpenConnect={() => setConnectOpen(true)} />

      {/* Features Section */}
      <section id="features" className="py-20 sm:py-24 px-5 sm:px-8 bg-[#FFF9F2]">
        <div className="max-w-[1160px] mx-auto">
          <div className="text-center max-w-[620px] mx-auto mb-14">
            <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#FF7A00] mb-3">
              Features
            </p>
            <h2 className="text-[32px] sm:text-[42px] font-bold tracking-[-0.025em] text-[#111318] leading-[1.15] mb-4">
              Everything you need to keep every promise you make.
            </h2>
            <p className="text-[15px] sm:text-[16px] text-[#4A5568] leading-[1.6]">
              Designed for mobile-first consistency—combining tactile routines, peer accountability,
              and real on-chain incentives.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.title}
                  className="rounded-[28px] bg-white border border-[#F0E3D6] p-6 shadow-[0_12px_32px_rgba(17,19,24,0.04)] hover:shadow-[0_18px_40px_rgba(255,122,0,0.09)] transition-shadow flex flex-col"
                >
                  <div
                    className={`w-12 h-12 rounded-2xl ${feature.accent} flex items-center justify-center mb-5`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-[18px] font-bold text-[#111318] mb-2.5 tracking-[-0.015em]">
                    {feature.title}
                  </h3>
                  <p className="text-[14px] text-[#4A5568] leading-[1.6] flex-1">
                    {feature.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section
        id="why-choose-us"
        className="py-20 sm:py-24 px-5 sm:px-8 bg-gradient-to-b from-[#FFF9F2] via-[#F4F8FE] to-[#FFF4E8]"
      >
        <div className="max-w-[1160px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5 flex flex-col items-center lg:items-start text-center lg:text-left">
            <MascotDisplay
              size="xl"
              variant="stage"
              floating
              className="mb-6"
              alt="Actake Accountability Mascot"
            />
            <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#FF7A00] mb-2">
              Why Choose Actake
            </p>
            <h2 className="text-[32px] sm:text-[40px] font-bold tracking-[-0.025em] text-[#111318] leading-[1.14] mb-4">
              Built for real mornings, not passive checkboxes.
            </h2>
            <p className="text-[15px] text-[#4A5568] leading-[1.65] mb-6">
              Traditional habit trackers are easy to ignore. Actake pairs friendly visual routines
              with skin-in-the-game escrow and live camera verification so showing up becomes your
              default.
            </p>
            <button
              type="button"
              onClick={() => setConnectOpen(true)}
              className="actake-orange-cta min-h-[48px] px-7 rounded-full text-[15px] font-semibold text-white inline-flex items-center gap-2 cursor-pointer"
            >
              <span>Start Your First Streak</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {WHY_POINTS.map((item) => (
              <div
                key={item.label}
                className="rounded-[28px] bg-white border border-[#E9EEF6] p-6 shadow-[0_14px_34px_rgba(30,41,59,0.05)] flex flex-col justify-between"
              >
                <div>
                  <p className="text-[36px] font-extrabold text-[#FF7A00] tracking-[-0.03em] tabular-nums leading-none mb-3">
                    {item.stat}
                  </p>
                  <h3 className="text-[16px] font-bold text-[#111318] mb-2">{item.label}</h3>
                  <p className="text-[13.5px] text-[#4A5568] leading-[1.55]">{item.detail}</p>
                </div>
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-1.5 text-[12px] font-semibold text-[#1E2430]">
                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                  <span>Verified on Solana Devnet</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* User Stories Section */}
      <section id="user-stories" className="py-20 sm:py-24 px-5 sm:px-8 bg-[#FFF9F2]">
        <div className="max-w-[1160px] mx-auto">
          <div className="text-center max-w-[600px] mx-auto mb-14">
            <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#FF7A00] mb-3">
              User Stories
            </p>
            <h2 className="text-[32px] sm:text-[40px] font-bold tracking-[-0.025em] text-[#111318] leading-[1.15]">
              Trusted by early risers, students, and Solana builders.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {STORIES.map((story) => (
              <article
                key={story.name}
                className="rounded-[28px] bg-white border border-[#F0E3D6] p-6 shadow-[0_12px_30px_rgba(17,19,24,0.04)] flex flex-col justify-between"
              >
                <p className="text-[15px] text-[#1E2430] leading-[1.65] mb-6">
                  &ldquo;{story.quote}&rdquo;
                </p>
                <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full ${story.tone} text-white text-[13px] font-bold flex items-center justify-center shrink-0`}
                    >
                      {story.initials}
                    </div>
                    <div>
                      <p className="text-[14px] font-bold text-[#111318] leading-tight">
                        {story.name}
                      </p>
                      <p className="text-[12px] text-[#718096]">{story.role}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF2E5] text-[#FF7A00] px-3 py-1 text-[12px] font-bold tabular-nums shrink-0">
                    <Flame className="w-3.5 h-3.5" />
                    {story.streak}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 sm:py-24 px-5 sm:px-8 bg-[#F8FAFE]">
        <div className="max-w-[820px] mx-auto">
          <div className="text-center mb-12">
            <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#FF7A00] mb-3">
              FAQ
            </p>
            <h2 className="text-[32px] sm:text-[40px] font-bold tracking-[-0.025em] text-[#111318] leading-[1.15]">
              Common questions, clear answers.
            </h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((item, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={item.q}
                  className="rounded-[24px] bg-white border border-[#E8EDF5] overflow-hidden shadow-[0_8px_24px_rgba(15,23,42,0.03)]"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? -1 : idx)}
                    aria-expanded={isOpen}
                    className="w-full min-h-[60px] px-6 py-4 flex items-center justify-between gap-4 text-left cursor-pointer"
                  >
                    <span className="text-[15.5px] font-bold text-[#111318]">{item.q}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-[#FF7A00] shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-[14.5px] text-[#4A5568] leading-[1.65]">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bottom CTA & Clean Footer */}
      <footer className="py-16 px-5 sm:px-8 bg-[#FFF9F2] border-t border-[#F2E4D6]">
        <div className="max-w-[1160px] mx-auto">
          <div className="rounded-[34px] actake-landing-sky p-8 sm:p-12 text-center shadow-[0_20px_50px_rgba(121,169,236,0.18)] mb-12">
            <h2 className="text-[28px] sm:text-[38px] font-bold text-[#111318] tracking-[-0.025em] leading-[1.15] mb-3">
              Ready to build an{' '}
              <span className="text-[#FF7A00] italic font-bold">Unbreakable</span> Streak?
            </h2>
            <p className="max-w-[520px] mx-auto text-[15px] text-[#4A5568] mb-7">
              Connect in seconds with Pollar, Solana Seeker MWA, or your browser vault and lock in
              your first accountability routine today.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3.5 pt-1">
              <button
                type="button"
                onClick={() => setConnectOpen(true)}
                className="actake-orange-cta min-h-[50px] px-7 rounded-full text-white text-[14.5px] font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Try Web App</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setConnectOpen(true)}
                className="relative min-h-[50px] px-6 rounded-full bg-[#111318] hover:bg-[#1E222B] text-white text-[14px] font-semibold inline-flex items-center gap-2.5 shadow-lg cursor-pointer"
              >
                <span className="absolute -top-2.5 right-3.5 rounded-full bg-[#FF7A00] text-white text-[9.5px] font-extrabold uppercase tracking-[0.06em] px-2 py-0.5 leading-none shadow-sm ring-2 ring-white/95">
                  Coming Soon
                </span>
                <AppleIcon className="w-[18px] h-[18px]" />
                <span>Download on App Store</span>
              </button>
              <button
                type="button"
                onClick={() => setConnectOpen(true)}
                className="relative min-h-[50px] px-6 rounded-full bg-white hover:bg-[#FFFBF7] text-[#111318] text-[14px] font-semibold inline-flex items-center gap-2.5 shadow-md cursor-pointer"
              >
                <span className="absolute -top-2.5 right-3.5 rounded-full bg-[#111318] text-white text-[9.5px] font-extrabold uppercase tracking-[0.06em] px-2 py-0.5 leading-none shadow-sm ring-2 ring-white">
                  Coming Soon
                </span>
                <GooglePlayIcon className="w-[18px] h-[18px]" />
                <span>Get it on Google Play</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-[13.5px] text-[#718096]">
            <ActakeLogo />
            <p>Actake — Social Accountability &amp; Streak Escrow on Solana Mobile.</p>
          </div>
        </div>
      </footer>

      {/* Full-Screen Premium SaaS Auth Page */}
      {connectOpen && (
        <AuthPage
          wallets={wallets}
          platform={platform}
          connecting={connecting}
          error={error}
          pendingPoolInvite={pendingPoolInvite}
          onConnect={(id) => {
            onConnect(id);
          }}
          onBack={() => {
            if (!connecting) setConnectOpen(false);
          }}
        />
      )}
    </div>
  );
};
