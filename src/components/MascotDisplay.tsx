import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

export const ACTAKE_MASCOT_SRC = '/assets/aistudio/image-removebg-preview__1__38d6ac67.png';

export type MascotVariant = 'medallion' | 'stage' | 'celebration' | 'obsidian';
export type MascotSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface MascotDisplayProps {
  variant?: MascotVariant;
  size?: MascotSize;
  floating?: boolean;
  alt?: string;
  className?: string;
}

const SIZE_CLASSES: Record<MascotSize, string> = {
  xs: 'w-12 h-12 rounded-2xl',
  sm: 'w-16 h-16 rounded-[20px]',
  md: 'w-20 h-20 sm:w-24 sm:h-24 rounded-[24px]',
  lg: 'w-28 h-28 sm:w-36 sm:h-36 rounded-[28px]',
  xl: 'w-36 h-36 sm:w-44 sm:h-44 rounded-[32px]',
  '2xl': 'w-44 h-44 sm:w-52 sm:h-52 rounded-[36px]',
};

const VARIANT_CLASSES: Record<
  MascotVariant,
  {
    frame: string;
    backlight: string;
    groundShadow: string;
    imgShadow: string;
    fallbackIcon: string;
  }
> = {
  medallion: {
    frame:
      'bg-gradient-to-b from-[#FFFDFB] via-[#FFF2E8] to-[#FFE1CE] ring-1 ring-[#F2D9C9] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_8px_20px_rgba(241,106,46,0.14)]',
    backlight:
      'bg-[radial-gradient(circle_at_50%_46%,rgba(255,255,255,0.96)_0%,rgba(241,106,46,0.16)_65%,transparent_100%)]',
    groundShadow: 'bg-[#2A1912]/16',
    imgShadow: 'drop-shadow-[0_8px_12px_rgba(24,20,18,0.18)]',
    fallbackIcon: 'text-[#F16A2E]',
  },
  stage: {
    frame:
      'bg-gradient-to-br from-[#FFF9F4] via-[#FFECE0] to-[#EEE8FF] ring-1 ring-[#F2DDD0] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_16px_34px_rgba(241,106,46,0.16)]',
    backlight:
      'bg-[radial-gradient(circle_at_52%_42%,rgba(255,255,255,0.96)_0%,rgba(241,106,46,0.16)_56%,rgba(167,139,250,0.14)_85%,transparent_100%)]',
    groundShadow: 'bg-[#1D1714]/18',
    imgShadow: 'drop-shadow-[0_14px_20px_rgba(24,20,18,0.2)]',
    fallbackIcon: 'text-[#F16A2E]',
  },
  celebration: {
    frame:
      'bg-gradient-to-b from-white/24 via-white/12 to-black/15 ring-1 ring-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_20px_40px_rgba(6,38,20,0.36)]',
    backlight:
      'bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.4)_0%,rgba(134,239,172,0.24)_54%,transparent_88%)]',
    groundShadow: 'bg-[#042411]/40',
    imgShadow: 'drop-shadow-[0_14px_22px_rgba(5,32,16,0.4)]',
    fallbackIcon: 'text-[#86EFAC]',
  },
  obsidian: {
    frame:
      'bg-gradient-to-b from-[#26262F] via-[#19191F] to-[#111114] ring-1 ring-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_16px_34px_rgba(0,0,0,0.38)]',
    backlight:
      'bg-[radial-gradient(circle_at_50%_44%,rgba(241,106,46,0.32)_0%,rgba(180,165,255,0.16)_58%,transparent_90%)]',
    groundShadow: 'bg-black/60',
    imgShadow: 'drop-shadow-[0_12px_20px_rgba(0,0,0,0.5)]',
    fallbackIcon: 'text-[#F16A2E]',
  },
};

export const MascotDisplay: React.FC<MascotDisplayProps> = ({
  variant = 'medallion',
  size = 'md',
  floating = false,
  alt = 'Actake Accountability Mascot',
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const styles = VARIANT_CLASSES[variant];
  const isTiny = size === 'xs';

  return (
    <div
      className={`relative shrink-0 overflow-hidden select-none flex items-center justify-center ${SIZE_CLASSES[size]} ${styles.frame} ${className}`}
    >
      {/* Subtle studio top-light & radial aura */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ${styles.backlight}`}
      />

      {/* Grounded contact shadow ellipse under mascot boots */}
      {!isTiny && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-[9%] left-1/2 -translate-x-1/2 w-[60%] h-[11%] rounded-full blur-[3px] ${styles.groundShadow} ${
            floating ? 'actake-mascot-shadow' : ''
          }`}
        />
      )}

      {imgFailed ? (
        <ShieldCheck className={`relative z-10 w-1/2 h-1/2 ${styles.fallbackIcon}`} />
      ) : (
        <div
          className={`relative z-10 w-full h-full flex items-center justify-center ${
            floating ? 'actake-mascot-float' : ''
          }`}
        >
          <img
            src={ACTAKE_MASCOT_SRC}
            alt={alt}
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setImgFailed(true)}
            className={`w-full h-full object-contain pointer-events-none ${
              isTiny
                ? 'scale-[1.92] -translate-x-[5%] translate-y-[1%]'
                : 'scale-[1.86] -translate-x-[5%] -translate-y-[1%]'
            } ${styles.imgShadow}`}
          />
        </div>
      )}
    </div>
  );
};

interface MascotLoaderProps {
  title: string;
  subtitle?: string;
  size?: 'md' | 'lg' | 'xl' | '2xl';
  theme?: 'light' | 'dark';
  titleId?: string;
  className?: string;
}

export const MascotLoader: React.FC<MascotLoaderProps> = ({
  title,
  subtitle,
  size = 'lg',
  theme = 'light',
  titleId,
  className = '',
}) => {
  const isDark = theme === 'dark';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center text-center gap-4 ${className}`}
    >
      <div className="relative p-2.5 flex items-center justify-center">
        {/* Smooth compositor-only rotating halo ring */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-[36px] border-2 ${
            isDark ? 'border-white/12' : 'border-[#F2D9C9]/70'
          }`}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full actake-mascot-orbit"
          style={{
            background: isDark
              ? 'conic-gradient(from 0deg, transparent 0deg, transparent 225deg, #F16A2E 335deg, #FFB088 360deg)'
              : 'conic-gradient(from 0deg, transparent 0deg, transparent 225deg, #F16A2E 340deg, #FF9C6E 360deg)',
            WebkitMask:
              'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
          }}
        />
        <MascotDisplay
          variant={isDark ? 'obsidian' : 'stage'}
          size={size}
          floating
          alt="Actake Mascot Loading"
          className="rounded-full"
        />
      </div>

      <div className="space-y-1 max-w-xs">
        <div
          id={titleId}
          className={`font-display text-lg sm:text-xl font-extrabold tracking-tight ${
            isDark ? 'text-white' : 'text-[#111114]'
          }`}
        >
          {title}
        </div>
        {subtitle && (
          <p
            className={`text-xs sm:text-sm leading-relaxed ${
              isDark ? 'text-white/75' : 'text-[#6B6663]'
            }`}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};
