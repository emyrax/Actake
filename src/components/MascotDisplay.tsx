import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { MascotThemeId } from '../types/actake';
import { useMascotTheme } from '../context/MascotThemeContext';

export const ACTAKE_MASCOT_SRC = '/assets/aistudio/image-removebg-preview__1__38d6ac67.png';

export type MascotVariant = 'medallion' | 'stage' | 'celebration' | 'obsidian';
export type MascotSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface MascotDisplayProps {
  variant?: MascotVariant;
  size?: MascotSize;
  floating?: boolean;
  themeOverride?: MascotThemeId;
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

const PIXEL_SIZE_RADIUS: Record<MascotSize, string> = {
  xs: 'w-12 h-12 rounded-lg',
  sm: 'w-16 h-16 rounded-xl',
  md: 'w-20 h-20 sm:w-24 sm:h-24 rounded-xl',
  lg: 'w-28 h-28 sm:w-36 sm:h-36 rounded-2xl',
  xl: 'w-36 h-36 sm:w-44 sm:h-44 rounded-2xl',
  '2xl': 'w-44 h-44 sm:w-52 sm:h-52 rounded-2xl',
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

const MINIMAL_VARIANT_FRAMES: Record<MascotVariant, { frame: string; shadow: string }> = {
  medallion: {
    frame: 'bg-[#FAF6F2] border border-[#111114]/15',
    shadow: 'bg-[#111114]/10',
  },
  stage: {
    frame: 'bg-[#FFF9F5] border border-[#111114]/15',
    shadow: 'bg-[#111114]/10',
  },
  celebration: {
    frame: 'bg-white/16 border border-white/30',
    shadow: 'bg-black/25',
  },
  obsidian: {
    frame: 'bg-[#18181D] border border-white/15',
    shadow: 'bg-black/45',
  },
};

const PIXEL_VARIANT_FRAMES: Record<MascotVariant, { frame: string; shadow: string; scanline: string }> = {
  medallion: {
    frame:
      'bg-[#F3ECD9] border-2 border-[#1B1D29] shadow-[inset_0_2px_0_rgba(255,255,255,0.7),4px_4px_0_#1B1D29]',
    shadow: 'bg-[#1B1D29]/25',
    scanline: 'opacity-[0.07]',
  },
  stage: {
    frame:
      'bg-[#EFE6CE] border-2 border-[#1B1D29] shadow-[inset_0_2px_0_rgba(255,255,255,0.7),5px_5px_0_#1B1D29]',
    shadow: 'bg-[#1B1D29]/25',
    scanline: 'opacity-[0.08]',
  },
  celebration: {
    frame:
      'bg-[#134E2E] border-2 border-[#86EFAC] shadow-[inset_0_2px_0_rgba(255,255,255,0.2),5px_5px_0_#052E16]',
    shadow: 'bg-[#052E16]/55',
    scanline: 'opacity-[0.12]',
  },
  obsidian: {
    frame:
      'bg-[#1B1F30] border-2 border-[#F16A2E] shadow-[inset_0_2px_0_rgba(255,255,255,0.12),5px_5px_0_#090B12]',
    shadow: 'bg-black/60',
    scanline: 'opacity-[0.14]',
  },
};

/**
 * Clean geometric Swiss vector interpretation of the Actake robo-cat hero.
 */
const MinimalistMascotSvg: React.FC<{ darkSurface?: boolean }> = ({ darkSurface = false }) => {
  const ink = darkSurface ? '#F8FAFC' : '#111114';
  const bodyFill = darkSurface ? '#252630' : '#FFFFFF';
  const shadeFill = darkSurface ? '#1D1E26' : '#F3ECE5';
  const visorFill = darkSurface ? '#0D0E12' : '#111114';
  const eyeFill = '#FFFFFF';
  const accent = '#F16A2E';

  return (
    <svg
      viewBox="0 0 120 120"
      className="w-[82%] h-[82%] pointer-events-none"
      aria-hidden="true"
    >
      {/* Target & Arrow (upper right) */}
      <g transform="translate(94, 30)">
        <circle cx="0" cy="0" r="14" fill="#FFFFFF" stroke={accent} strokeWidth="3.5" />
        <circle cx="0" cy="0" r="8" fill="#FFFFFF" stroke={accent} strokeWidth="3" />
        <circle cx="0" cy="0" r="3" fill={accent} />
        <line x1="12" y1="-12" x2="2" y2="-2" stroke={ink} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M9 -13 L13 -13 L13 -9" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Raised Arm */}
      <path
        d="M72 64 L85 47"
        fill="none"
        stroke={ink}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M72 64 L85 47"
        fill="none"
        stroke={bodyFill}
        strokeWidth="4.2"
        strokeLinecap="round"
      />

      {/* Legs */}
      <path d="M51 86 L49 101 L42 101" fill="none" stroke={ink} strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M51 86 L49 101 L42 101" fill="none" stroke={bodyFill} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

      <path d="M68 85 L79 94 L84 89" fill="none" stroke={ink} strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M68 85 L79 94 L84 89" fill="none" stroke={bodyFill} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

      {/* Torso */}
      <rect
        x="42"
        y="58"
        width="34"
        height="31"
        rx="14"
        fill={bodyFill}
        stroke={ink}
        strokeWidth="3"
      />
      <circle cx="60" cy="73" r="9.5" fill={visorFill} />
      <path
        d="M55.5 73 L58.8 76.4 L65 70"
        fill="none"
        stroke={accent}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Left Ear & Right Ear */}
      <path d="M40 31 L39 17 L50 24 Z" fill={shadeFill} stroke={ink} strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M76 31 L77 17 L66 24 Z" fill={shadeFill} stroke={ink} strokeWidth="2.8" strokeLinejoin="round" />

      {/* Head */}
      <rect
        x="34"
        y="22"
        width="48"
        height="38"
        rx="18"
        fill={bodyFill}
        stroke={ink}
        strokeWidth="3"
      />
      {/* Head Crest */}
      <path d="M54 22 L62 22 L60 28 L56 28 Z" fill={shadeFill} stroke={ink} strokeWidth="2" strokeLinejoin="round" />

      {/* Visor */}
      <rect x="41" y="33" width="34" height="16" rx="8" fill={visorFill} />
      <rect x="48" y="37.5" width="4.5" height="7" rx="2.25" fill={eyeFill} />
      <rect x="63.5" y="37.5" width="4.5" height="7" rx="2.25" fill={eyeFill} />

      {/* Cute Smile */}
      <path
        d="M54 53 Q56 55.5 58 53 Q60 55.5 62 53"
        fill="none"
        stroke={ink}
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Shield (lower left) */}
      <g transform="translate(26, 74)">
        <path
          d="M0 -15 L14 -10 L14 2 C14 10 7 15 0 18 C-7 15 -14 10 -14 2 L-14 -10 Z"
          fill={bodyFill}
          stroke={ink}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M0 -10.5 L9.5 -7 L9.5 1.5 C9.5 7 5 11 0 13 C-5 11 -9.5 7 -9.5 1.5 L-9.5 -7 Z"
          fill={accent}
        />
        <path
          d="M-4.5 1.5 L-1.2 4.8 L5 -2"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
};

/**
 * Hand-crafted 8-bit 32x32 crisp-edge pixel art sprite of the Actake robo-cat hero.
 */
const RetroPixelMascotSvg: React.FC = () => (
  <svg
    viewBox="0 0 32 32"
    shapeRendering="crispEdges"
    className="w-[84%] h-[84%] pointer-events-none"
    aria-hidden="true"
  >
    {/* Cat Ears */}
    <rect x="9" y="3" width="2" height="1" fill="#1B1D29" />
    <rect x="8" y="4" width="1" height="3" fill="#1B1D29" />
    <rect x="11" y="4" width="1" height="2" fill="#1B1D29" />
    <rect x="9" y="4" width="2" height="2" fill="#CBD5E1" />

    <rect x="19" y="3" width="2" height="1" fill="#1B1D29" />
    <rect x="21" y="4" width="1" height="3" fill="#1B1D29" />
    <rect x="18" y="4" width="1" height="2" fill="#1B1D29" />
    <rect x="19" y="4" width="2" height="2" fill="#CBD5E1" />

    {/* Head Outline & Fill */}
    <rect x="10" y="5" width="10" height="1" fill="#1B1D29" />
    <rect x="8" y="6" width="14" height="8" fill="#FFFFFF" />
    <rect x="7" y="7" width="1" height="6" fill="#1B1D29" />
    <rect x="22" y="7" width="1" height="6" fill="#1B1D29" />
    <rect x="8" y="6" width="1" height="1" fill="#1B1D29" />
    <rect x="21" y="6" width="1" height="1" fill="#1B1D29" />
    <rect x="8" y="13" width="1" height="1" fill="#1B1D29" />
    <rect x="21" y="13" width="1" height="1" fill="#1B1D29" />
    <rect x="9" y="14" width="12" height="1" fill="#1B1D29" />
    {/* Shading on head */}
    <rect x="14" y="6" width="2" height="2" fill="#CBD5E1" />
    <rect x="8" y="11" width="1" height="2" fill="#E2E8F0" />
    <rect x="21" y="11" width="1" height="2" fill="#E2E8F0" />

    {/* Visor & Eyes */}
    <rect x="10" y="8" width="10" height="4" fill="#1B1D29" />
    <rect x="9" y="9" width="12" height="2" fill="#1B1D29" />
    <rect x="11" y="9" width="2" height="2" fill="#FFFFFF" />
    <rect x="17" y="9" width="2" height="2" fill="#FFFFFF" />
    <rect x="12" y="9" width="1" height="1" fill="#BAE6FD" />
    <rect x="18" y="9" width="1" height="1" fill="#BAE6FD" />

    {/* Mouth */}
    <rect x="13" y="12" width="1" height="1" fill="#1B1D29" />
    <rect x="14" y="13" width="2" height="1" fill="#1B1D29" />
    <rect x="16" y="12" width="1" height="1" fill="#1B1D29" />

    {/* Raised Arm & Bullseye Target (right) */}
    <rect x="20" y="16" width="2" height="2" fill="#1B1D29" />
    <rect x="21" y="14" width="2" height="2" fill="#FFFFFF" />
    <rect x="20" y="14" width="1" height="2" fill="#1B1D29" />
    <rect x="22" y="13" width="1" height="3" fill="#1B1D29" />

    {/* Target Rings */}
    <rect x="24" y="5" width="4" height="1" fill="#F16A2E" />
    <rect x="24" y="11" width="4" height="1" fill="#F16A2E" />
    <rect x="23" y="6" width="1" height="5" fill="#F16A2E" />
    <rect x="28" y="6" width="1" height="5" fill="#F16A2E" />
    <rect x="24" y="6" width="4" height="5" fill="#FFFFFF" />
    <rect x="25" y="7" width="2" height="3" fill="#F16A2E" />
    {/* Arrow */}
    <rect x="26" y="7" width="1" height="1" fill="#1B1D29" />
    <rect x="27" y="6" width="1" height="1" fill="#1B1D29" />
    <rect x="28" y="5" width="1" height="1" fill="#1B1D29" />
    <rect x="29" y="4" width="2" height="1" fill="#1B1D29" />
    <rect x="29" y="3" width="1" height="2" fill="#1B1D29" />

    {/* Torso */}
    <rect x="10" y="15" width="10" height="8" fill="#FFFFFF" />
    <rect x="9" y="16" width="1" height="6" fill="#1B1D29" />
    <rect x="20" y="16" width="1" height="6" fill="#1B1D29" />
    <rect x="10" y="23" width="10" height="1" fill="#1B1D29" />
    <rect x="10" y="21" width="10" height="2" fill="#E2E8F0" />

    {/* Chest Core + Pixel Orange Checkmark */}
    <rect x="13" y="16" width="5" height="5" fill="#1B1D29" />
    <rect x="14" y="18" width="1" height="1" fill="#F16A2E" />
    <rect x="15" y="19" width="1" height="1" fill="#F16A2E" />
    <rect x="16" y="18" width="1" height="1" fill="#F16A2E" />
    <rect x="17" y="17" width="1" height="1" fill="#F16A2E" />

    {/* Legs & Boots */}
    <rect x="10" y="24" width="3" height="4" fill="#FFFFFF" />
    <rect x="9" y="24" width="1" height="4" fill="#1B1D29" />
    <rect x="13" y="24" width="1" height="4" fill="#1B1D29" />
    <rect x="9" y="28" width="5" height="1" fill="#1B1D29" />
    <rect x="10" y="27" width="3" height="1" fill="#CBD5E1" />

    <rect x="17" y="24" width="3" height="3" fill="#FFFFFF" />
    <rect x="16" y="24" width="1" height="3" fill="#1B1D29" />
    <rect x="20" y="24" width="1" height="3" fill="#1B1D29" />
    <rect x="17" y="27" width="4" height="1" fill="#1B1D29" />
    <rect x="18" y="26" width="2" height="1" fill="#CBD5E1" />

    {/* Pixel Shield (lower left) */}
    <rect x="3" y="16" width="7" height="1" fill="#1B1D29" />
    <rect x="2" y="17" width="1" height="5" fill="#1B1D29" />
    <rect x="10" y="17" width="1" height="5" fill="#1B1D29" />
    <rect x="3" y="22" width="1" height="2" fill="#1B1D29" />
    <rect x="9" y="22" width="1" height="2" fill="#1B1D29" />
    <rect x="4" y="24" width="1" height="1" fill="#1B1D29" />
    <rect x="8" y="24" width="1" height="1" fill="#1B1D29" />
    <rect x="5" y="25" width="3" height="1" fill="#1B1D29" />
    {/* Shield Silver Rim & Orange Face */}
    <rect x="3" y="17" width="7" height="5" fill="#E2E8F0" />
    <rect x="4" y="22" width="5" height="2" fill="#E2E8F0" />
    <rect x="5" y="24" width="3" height="1" fill="#E2E8F0" />
    <rect x="4" y="18" width="5" height="4" fill="#F16A2E" />
    <rect x="5" y="22" width="3" height="2" fill="#F16A2E" />
    {/* White Checkmark on Shield */}
    <rect x="4" y="20" width="1" height="1" fill="#FFFFFF" />
    <rect x="5" y="21" width="1" height="1" fill="#FFFFFF" />
    <rect x="6" y="20" width="1" height="1" fill="#FFFFFF" />
    <rect x="7" y="19" width="1" height="1" fill="#FFFFFF" />
  </svg>
);

export const MascotDisplay: React.FC<MascotDisplayProps> = ({
  variant = 'medallion',
  size = 'md',
  floating = false,
  themeOverride,
  alt = 'Actake Accountability Mascot',
  className = '',
}) => {
  const { mascotTheme } = useMascotTheme();
  const activeTheme = themeOverride ?? mascotTheme;
  const [imgFailed, setImgFailed] = useState(false);
  const styles = VARIANT_CLASSES[variant];
  const isTiny = size === 'xs';

  if (activeTheme === 'modern-minimalist') {
    const minStyles = MINIMAL_VARIANT_FRAMES[variant];
    const isDarkSurface = variant === 'obsidian' || variant === 'celebration';
    return (
      <div
        role="img"
        aria-label={alt}
        data-mascot-theme="modern-minimalist"
        className={`relative shrink-0 overflow-hidden select-none flex items-center justify-center ${SIZE_CLASSES[size]} ${minStyles.frame} ${className}`}
      >
        {/* Subtle hairline geometric crosshair */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-2 rounded-[inherit] border ${
            isDarkSurface ? 'border-white/10' : 'border-[#111114]/[0.06]'
          }`}
        />
        {!isTiny && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[52%] h-[7%] rounded-full ${minStyles.shadow} ${
              floating ? 'actake-mascot-shadow' : ''
            }`}
          />
        )}
        <div
          className={`relative z-10 w-full h-full flex items-center justify-center ${
            floating ? 'actake-mascot-float' : ''
          }`}
        >
          <MinimalistMascotSvg darkSurface={isDarkSurface} />
        </div>
      </div>
    );
  }

  if (activeTheme === 'retro-pixel') {
    const pixStyles = PIXEL_VARIANT_FRAMES[variant];
    return (
      <div
        role="img"
        aria-label={alt}
        data-mascot-theme="retro-pixel"
        className={`relative shrink-0 overflow-hidden select-none flex items-center justify-center ${PIXEL_SIZE_RADIUS[size]} ${pixStyles.frame} ${className}`}
      >
        {/* Subtle CRT scanline texture */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${pixStyles.scanline}`}
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, #000 0px, #000 1px, transparent 1px, transparent 3px)',
          }}
        />
        {!isTiny && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-[8%] left-1/2 -translate-x-1/2 w-[56%] h-[8%] ${pixStyles.shadow} ${
              floating ? 'actake-mascot-shadow' : ''
            }`}
          />
        )}
        <div
          className={`relative z-10 w-full h-full flex items-center justify-center ${
            floating ? 'actake-mascot-float' : ''
          }`}
        >
          <RetroPixelMascotSvg />
        </div>
      </div>
    );
  }

  // Default: 'playful-3d' — original dimensional studio mascot
  return (
    <div
      data-mascot-theme="playful-3d"
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
  const { mascotTheme } = useMascotTheme();
  const isDark = theme === 'dark';
  const isPixel = mascotTheme === 'retro-pixel';
  const isMinimal = mascotTheme === 'modern-minimalist';

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
          className={`pointer-events-none absolute inset-0 ${
            isPixel ? 'rounded-2xl border-2 border-dashed' : 'rounded-[36px] border-2'
          } ${isDark ? 'border-white/12' : isMinimal ? 'border-[#111114]/15' : 'border-[#F2D9C9]/70'}`}
        />
        {!isPixel && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full actake-mascot-orbit"
            style={{
              background: isDark
                ? 'conic-gradient(from 0deg, transparent 0deg, transparent 225deg, #F16A2E 335deg, #FFB088 360deg)'
                : isMinimal
                  ? 'conic-gradient(from 0deg, transparent 0deg, transparent 245deg, #111114 345deg, #F16A2E 360deg)'
                  : 'conic-gradient(from 0deg, transparent 0deg, transparent 225deg, #F16A2E 340deg, #FF9C6E 360deg)',
              WebkitMask:
                'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
            }}
          />
        )}
        <MascotDisplay
          variant={isDark ? 'obsidian' : 'stage'}
          size={size}
          floating
          alt="Actake Mascot Loading"
          className={isPixel ? '' : 'rounded-full'}
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
