import React from 'react';

interface BrandMarkProps {
  inverted?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const BrandMark: React.FC<BrandMarkProps> = ({ inverted = false, size = 'md' }) => {
  const sizeClass =
    size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-xl' : 'text-2xl';
  const darkText = inverted ? 'text-white' : 'text-[#181E25]';

  return (
    <span
      className={`inline-flex items-baseline font-display font-extrabold tracking-tight select-none whitespace-nowrap shrink-0 ${sizeClass}`}
    >
      <span className={darkText}>ac</span>
      <span className={`relative inline-block ${darkText}`}>
        t
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="w-[0.58em] h-[0.58em] text-[#EC6B3F] absolute -top-[0.12em] -right-[0.22em]"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 13l5 5L20 6" />
        </svg>
      </span>
      <span className="text-[#EC6B3F]">ake</span>
    </span>
  );
};
