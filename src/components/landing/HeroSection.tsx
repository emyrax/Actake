import React from 'react';
import { ArrowRight, Play } from 'lucide-react';
import morningFocusImg from '../../assets/images/morning_focus_card_1795735509652.jpg';
import eveningCheckinImg from '../../assets/images/evening_checkin_card_1795735509813.jpg';
import { AppleIcon, GooglePlayIcon } from './BrandIcons';
import { Navbar } from './Navbar';
import { PhoneMockup } from './PhoneMockup';
import { LeftPlushFlowerCluster, RightPlushFlowerCluster } from './PlushFlowers';
import { ThoughtCloud } from './ThoughtCloud';

interface HeroSectionProps {
  onOpenConnect: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onOpenConnect }) => {
  return (
    <section
      id="top"
      className="relative w-full overflow-hidden actake-landing-sky actake-landing-font flex flex-col justify-between min-h-[790px] lg:min-h-[850px]"
    >
      {/* Top Transparent Navbar */}
      <Navbar onOpenConnect={onOpenConnect} />

      {/* Center Hero Headline & Store CTA Block */}
      <div className="relative z-20 w-full max-w-[840px] mx-auto px-5 sm:px-8 pt-3 sm:pt-6 text-center">
        {/* Eyebrow with fading rules and dark anchor dots */}
        <div className="inline-flex items-center justify-center gap-3 sm:gap-4 mb-5">
          <span
            aria-hidden="true"
            className="h-px w-12 sm:w-24 bg-gradient-to-r from-transparent to-[#64748B]/55"
          />
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[#1E2430] tracking-[-0.01em]">
            <span aria-hidden="true" className="w-[4.5px] h-[4.5px] rounded-full bg-[#111318]" />
            Start Your Streak Today
            <span aria-hidden="true" className="w-[4.5px] h-[4.5px] rounded-full bg-[#111318]" />
          </span>
          <span
            aria-hidden="true"
            className="h-px w-12 sm:w-24 bg-gradient-to-l from-transparent to-[#64748B]/55"
          />
        </div>

        {/* Main H1 Headline */}
        <h1 className="text-[38px] sm:text-[54px] lg:text-[62px] font-bold text-[#111318] leading-[1.12] tracking-[-0.025em] mb-5">
          <span className="block">Your Daily Partner</span>
          <span className="block">
            for <span className="text-[#FF7A00] italic font-bold">Accountable</span> Habits &amp;
            Life
          </span>
        </h1>

        {/* Subheadline */}
        <p className="max-w-[580px] mx-auto text-[15px] sm:text-[16px] leading-[1.6] text-[#4A5568] font-normal mb-7">
          Take control of your daily goals with peer verification, on-chain streak stakes, and
          mindful routines built for real consistency.
        </p>

        {/* Primary Try Web App CTA + Coming Soon Store Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3.5 pt-1">
          <button
            type="button"
            onClick={onOpenConnect}
            className="actake-orange-cta min-h-[50px] px-7 rounded-full text-white text-[14.5px] font-semibold inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span>Try Web App</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenConnect}
            className="relative min-h-[50px] px-6 rounded-full bg-[#111318] hover:bg-[#1E222B] text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2.5 shadow-[0_12px_26px_rgba(17,19,24,0.22)] transition-all active:scale-[0.98] cursor-pointer"
          >
            <span className="absolute -top-2.5 right-3.5 rounded-full bg-[#FF7A00] text-white text-[9.5px] font-extrabold uppercase tracking-[0.06em] px-2 py-0.5 leading-none shadow-sm ring-2 ring-white/95">
              Coming Soon
            </span>
            <AppleIcon className="w-[18px] h-[18px] -mt-0.5" />
            <span>Download on App Store</span>
          </button>

          <button
            type="button"
            onClick={onOpenConnect}
            className="relative min-h-[50px] px-6 rounded-full bg-white hover:bg-[#FFFBF7] text-[#111318] text-[14px] font-semibold inline-flex items-center justify-center gap-2.5 shadow-[0_12px_26px_rgba(15,23,42,0.08)] border border-white/90 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span className="absolute -top-2.5 right-3.5 rounded-full bg-[#111318] text-white text-[9.5px] font-extrabold uppercase tracking-[0.06em] px-2 py-0.5 leading-none shadow-sm ring-2 ring-white">
              Coming Soon
            </span>
            <GooglePlayIcon className="w-[18px] h-[18px]" />
            <span>Get it on Google Play</span>
          </button>
        </div>
      </div>

      {/* Bottom Interactive Showcase Stage */}
      <div className="relative w-full max-w-[1220px] mx-auto mt-10 lg:mt-8 pt-6 sm:pt-8 px-4 sm:px-8 flex-1 flex flex-col lg:flex-row items-center lg:items-end justify-center">
        {/* Background Layer (z-1): 3D Plush Felt Flower Clusters */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute -bottom-10 -left-16 sm:-left-10 lg:-left-6 z-[1]"
        >
          <LeftPlushFlowerCluster className="w-[290px] sm:w-[375px] lg:w-[440px] h-auto actake-plush-float" />
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute -bottom-10 -right-16 sm:-right-10 lg:-right-6 z-[1]"
        >
          <RightPlushFlowerCluster className="w-[300px] sm:w-[385px] lg:w-[450px] h-auto actake-plush-float-delayed" />
        </div>

        {/* Floating Orange Thought Cloud Callouts */}
        <div className="hidden md:block absolute left-3 lg:left-8 -top-12 lg:-top-16 z-20 -rotate-[8deg] actake-bubble-float">
          <ThoughtCloud
            variant="orange"
            trailSide="right"
            size="hero"
            lines={['Small Steps for Better', 'Daily Consistency']}
          />
        </div>

        <div className="hidden md:block absolute right-3 lg:right-8 -top-12 lg:-top-16 z-20 rotate-[8deg] actake-bubble-float">
          <ThoughtCloud
            variant="orange"
            trailSide="left"
            size="hero"
            lines={['Daily Streak Insights', 'For A Better You']}
          />
        </div>

        {/* Foreground Trio: Left Floating Card — Center iPhone — Right Floating Card */}
        <div className="relative z-10 w-full flex flex-col lg:flex-row items-center lg:items-end justify-center gap-7 lg:gap-12 xl:gap-16">
          {/* Left Floating Activity Card: Morning Focus */}
          <div className="hidden md:block lg:mb-16 -rotate-[7deg] hover:-rotate-[4deg] hover:-translate-y-1 transition-all duration-300">
            <button
              type="button"
              onClick={onOpenConnect}
              aria-label="Preview Morning Focus 15-minute routine"
              className="group relative w-[224px] h-[272px] rounded-[28px] border-[5px] border-white overflow-hidden shadow-[0_24px_52px_rgba(30,41,59,0.22)] bg-[#D9D4CC] text-left block cursor-pointer"
            >
              <img
                src={morningFocusImg}
                alt="Morning Focus mindful routine"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />

              {/* Concentric subtle white ripple rings radiating from center */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <span className="w-[104px] h-[104px] rounded-full border border-white/40" />
                <span className="absolute w-[156px] h-[156px] rounded-full border border-white/30" />
                <span className="absolute w-[206px] h-[206px] rounded-full border border-white/20" />
              </div>

              {/* Scrim for crisp white overlay text */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />

              {/* Card Text & Bottom White Pill */}
              <div className="absolute inset-x-3.5 bottom-3.5 flex flex-col">
                <p className="text-[21px] font-semibold leading-[1.15] text-white tracking-[-0.015em] drop-shadow-sm mb-3 px-1">
                  Morning
                  <br />
                  Focus
                </p>
                <div className="h-[44px] rounded-full bg-white pl-1.5 pr-4 flex items-center gap-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.16)]">
                  <span className="w-8 h-8 rounded-full bg-[#111318] text-white flex items-center justify-center shrink-0 group-hover:bg-[#FF7A00] transition-colors">
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  </span>
                  <span className="text-[13px] font-semibold text-[#111318] tabular-nums">
                    15 minutes
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* Center Interactive Phone Mockup */}
          <PhoneMockup onOpenConnect={onOpenConnect} />

          {/* Right Floating Activity Card: Evening Check-In */}
          <div className="hidden md:block lg:mb-10 rotate-[7deg] hover:rotate-[4deg] hover:-translate-y-1 transition-all duration-300">
            <button
              type="button"
              onClick={onOpenConnect}
              aria-label="Preview Evening Check-In 25-minute routine"
              className="group relative w-[224px] h-[272px] rounded-[28px] border-[5px] border-white overflow-hidden shadow-[0_24px_52px_rgba(30,41,59,0.22)] bg-[#3C312A] text-left block cursor-pointer"
            >
              <img
                src={eveningCheckinImg}
                alt="Evening Check-In golden hour reflection"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />

              {/* Warm golden light shimmer near crown */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-[#FFD380]/30 blur-xl"
              />

              {/* Scrim for crisp white overlay text */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />

              {/* Card Text & Bottom White Pill */}
              <div className="absolute inset-x-3.5 bottom-3.5 flex flex-col">
                <p className="text-[21px] font-semibold leading-[1.15] text-white tracking-[-0.015em] drop-shadow-sm mb-3 px-1">
                  Evening
                  <br />
                  Check-In
                </p>
                <div className="h-[44px] rounded-full bg-white pl-1.5 pr-4 flex items-center gap-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.16)]">
                  <span className="w-8 h-8 rounded-full bg-[#111318] text-white flex items-center justify-center shrink-0 group-hover:bg-[#FF7A00] transition-colors">
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  </span>
                  <span className="text-[13px] font-semibold text-[#111318] tabular-nums">
                    25 minutes
                  </span>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Mobile Compact Preview Cards (visible < md so 375px viewports still enjoy both routine cards cleanly) */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-[360px] mt-5 mb-6 md:hidden relative z-10">
          <button
            type="button"
            onClick={onOpenConnect}
            className="relative h-[156px] rounded-[22px] border-[3px] border-white overflow-hidden shadow-lg text-left cursor-pointer"
          >
            <img
              src={morningFocusImg}
              alt="Morning Focus routine"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
            <div className="absolute inset-x-2.5 bottom-2.5">
              <p className="text-[13px] font-bold text-white leading-tight mb-1.5">Morning Focus</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111318]">
                <Play className="w-2.5 h-2.5 fill-current" />
                15 min
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenConnect}
            className="relative h-[156px] rounded-[22px] border-[3px] border-white overflow-hidden shadow-lg text-left cursor-pointer"
          >
            <img
              src={eveningCheckinImg}
              alt="Evening Check-In routine"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
            <div className="absolute inset-x-2.5 bottom-2.5">
              <p className="text-[13px] font-bold text-white leading-tight mb-1.5">
                Evening Check-In
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111318]">
                <Play className="w-2.5 h-2.5 fill-current" />
                25 min
              </span>
            </div>
          </button>
        </div>
      </div>
    </section>
  );
};
