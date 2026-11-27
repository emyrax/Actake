import React from 'react';

interface ActakeLogoProps {
  className?: string;
}

/**
 * Custom Actake Brand Logo:
 * Two overlapping tilted orange rounded-pill shapes + ExtraBold wordmark.
 */
export const ActakeLogo: React.FC<ActakeLogoProps> = ({ className = '' }) => (
  <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
    <svg
      width="32"
      height="32"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="actakeLogoMain" x1="6" y1="3" x2="22" y2="33" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFA238" />
          <stop offset="100%" stopColor="#FF6600" />
        </linearGradient>
        <linearGradient id="actakeLogoAccent" x1="16" y1="14" x2="32" y2="33" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFBC5E" />
          <stop offset="100%" stopColor="#FF7A00" />
        </linearGradient>
      </defs>
      {/* Tall left tilted streak pill */}
      <rect
        x="8"
        y="4"
        width="10.5"
        height="27"
        rx="5.25"
        transform="rotate(13 13 17.5)"
        fill="url(#actakeLogoMain)"
      />
      {/* Shorter right overlapping tilted pill */}
      <rect
        x="17.5"
        y="14"
        width="10.5"
        height="17.5"
        rx="5.25"
        transform="rotate(13 22.5 22.5)"
        fill="url(#actakeLogoAccent)"
      />
      {/* Subtle glossy inner specular highlight */}
      <rect
        x="11"
        y="7.5"
        width="2.4"
        height="9"
        rx="1.2"
        transform="rotate(13 12.2 12)"
        fill="#FFFFFF"
        fillOpacity="0.32"
      />
    </svg>
    <span className="text-[24px] font-extrabold tracking-[-0.03em] text-[#111318] leading-none">
      Actake
    </span>
  </span>
);

export const AppleIcon: React.FC<{ className?: string }> = ({ className = 'w-[18px] h-[18px]' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
  </svg>
);

export const GooglePlayIcon: React.FC<{ className?: string }> = ({
  className = 'w-[18px] h-[18px]',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M3.609 1.814L13.792 12 3.61 22.186a1.57 1.57 0 0 1-.61-1.246V3.06c0-.49.228-.948.609-1.246z"
      fill="#4285F4"
    />
    <path
      d="M17.185 8.607L13.792 12l3.393 3.393 3.842-2.188c.644-.367.644-1.293 0-1.66l-3.842-1.938z"
      fill="#FBBC05"
    />
    <path
      d="M3.609 22.186L13.792 12l3.393 3.393-12.14 6.912a1.52 1.52 0 0 1-1.436-.119z"
      fill="#EA4335"
    />
    <path
      d="M17.185 8.607L5.045 1.695a1.52 1.52 0 0 0-1.436.119L13.792 12l3.393-3.393z"
      fill="#34A853"
    />
  </svg>
);

export type StatusFaceKey = 'tired' | 'struggling' | 'neutral' | 'lockedIn';

export interface StatusFaceOption {
  id: StatusFaceKey;
  label: string;
  helper: string;
}

export const STATUS_FACE_OPTIONS: StatusFaceOption[] = [
  { id: 'tired', label: 'Tired', helper: 'Need a quick alarm nudge' },
  { id: 'struggling', label: 'Tough Day', helper: 'Keep your streak alive' },
  { id: 'neutral', label: 'Catching Up', helper: '1 check-in left today' },
  { id: 'lockedIn', label: 'Locked In', helper: 'Verified & earning splits' },
];

interface StatusFaceIconProps {
  kind: StatusFaceKey;
  active: boolean;
}

export const StatusFaceIcon: React.FC<StatusFaceIconProps> = ({ kind, active }) => {
  if (kind === 'tired') {
    const stroke = active ? '#FF7A00' : '#FFFFFF';
    return (
      <svg viewBox="0 0 36 36" className="w-7 h-7" fill="none" aria-hidden="true">
        <circle cx="18" cy="18" r="14" stroke={stroke} strokeWidth="2.1" />
        <circle cx="13" cy="15.5" r="1.6" fill={stroke} />
        <circle cx="23" cy="15.5" r="1.6" fill={stroke} />
        <path
          d="M13 23.5C14.5 21.3 21.5 21.3 23 23.5"
          stroke={stroke}
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === 'struggling') {
    const stroke = active ? '#FF7A00' : '#FFFFFF';
    return (
      <svg viewBox="0 0 36 36" className="w-7 h-7" fill="none" aria-hidden="true">
        <circle cx="18" cy="18" r="14" stroke={stroke} strokeWidth="2.1" />
        <path d="M11.5 13.5L15 15.2" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        <path d="M24.5 13.5L21 15.2" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        <circle cx="13.5" cy="17" r="1.4" fill={stroke} />
        <circle cx="22.5" cy="17" r="1.4" fill={stroke} />
        <path
          d="M13.5 23.8C15 22 21 22 22.5 23.8"
          stroke={stroke}
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (kind === 'neutral') {
    const stroke = active ? '#FF7A00' : '#FFFFFF';
    return (
      <svg viewBox="0 0 36 36" className="w-7 h-7" fill="none" aria-hidden="true">
        <circle cx="18" cy="18" r="14" stroke={stroke} strokeWidth="2.1" />
        <circle cx="13.2" cy="15.5" r="1.6" fill={stroke} />
        <circle cx="22.8" cy="15.5" r="1.6" fill={stroke} />
        <path d="M13.5 22.2H22.5" stroke={stroke} strokeWidth="2.1" strokeLinecap="round" />
      </svg>
    );
  }

  // lockedIn / happy verified face
  const stroke = active ? '#FF7A00' : '#FFFFFF';
  return (
    <svg viewBox="0 0 36 36" className="w-7 h-7" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="14" stroke={stroke} strokeWidth="2.1" />
      <path
        d="M11.8 15.5C12.4 14.1 14.2 14.1 14.8 15.5"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M21.2 15.5C21.8 14.1 23.6 14.1 24.2 15.5"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12.5 20.5C14 24.2 22 24.2 23.5 20.5"
        stroke={stroke}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
};
