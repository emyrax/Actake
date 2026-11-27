import React, { useId } from 'react';

interface ThoughtCloudProps {
  lines: [string, string?];
  variant?: 'orange' | 'white';
  trailSide?: 'left' | 'right';
  size?: 'hero' | 'phone';
  className?: string;
}

/**
 * Scalloped puffy thought cloud SVG with soft drop shadow and trailing circles.
 * Used for left/right floating hero callouts and the inside-phone greeting bubble.
 */
export const ThoughtCloud: React.FC<ThoughtCloudProps> = ({
  lines,
  variant = 'orange',
  trailSide = 'right',
  size = 'hero',
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const isOrange = variant === 'orange';
  const isPhone = size === 'phone';

  const gradId = `cloudGrad-${uid}`;
  const shadowId = `cloudShadow-${uid}`;

  const viewW = isPhone ? 186 : 230;
  const viewH = isPhone ? 106 : 148;

  return (
    <div
      className={`relative select-none pointer-events-none ${className}`}
      style={{
        width: isPhone ? 148 : 196,
      }}
    >
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="20" y1="8" x2="180" y2="108" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF962E" />
            <stop offset="55%" stopColor="#FF7A0A" />
            <stop offset="100%" stopColor="#FF6000" />
          </linearGradient>
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow
              dx="0"
              dy={isPhone ? '4' : '10'}
              stdDeviation={isPhone ? '4' : '9'}
              floodColor={isOrange ? '#FF6B00' : '#B84A00'}
              floodOpacity={isOrange ? '0.32' : '0.18'}
            />
          </filter>
        </defs>

        {isPhone ? (
          <g filter={`url(#${shadowId})`}>
            {/* Scalloped compact white cloud for phone header */}
            <path
              d="M42 18C50 8 68 6 82 13C95 4 118 5 129 16C145 13 163 23 165 39C174 47 173 65 160 73C156 84 140 90 126 85C116 93 95 93 84 85C70 92 51 89 43 78C26 80 14 68 16 53C10 40 20 22 42 18Z"
              fill={isOrange ? `url(#${gradId})` : '#FFFFFF'}
            />
            {/* Trailing circles down-right toward prompt */}
            <circle
              cx="146"
              cy="94"
              r="6.2"
              fill={isOrange ? `url(#${gradId})` : '#FFFFFF'}
              fillOpacity={isOrange ? 1 : 0.85}
            />
            <circle
              cx="154"
              cy="107"
              r="3.8"
              fill={isOrange ? `url(#${gradId})` : '#FFFFFF'}
              fillOpacity={isOrange ? 1 : 0.65}
            />
          </g>
        ) : (
          <g filter={`url(#${shadowId})`}>
            {/* Puffy hero scalloped cloud */}
            <path
              d="M52 24C63 10 86 7 104 16C121 5 151 7 166 21C186 18 208 32 210 53C221 64 218 88 201 97C194 112 173 118 156 112C143 122 117 122 103 112C86 121 63 117 53 103C31 105 16 90 19 71C11 54 25 30 52 24Z"
              fill={isOrange ? `url(#${gradId})` : '#FFFFFF'}
            />
            {/* Glossy top-left sheen */}
            {isOrange && (
              <path
                d="M56 32C68 20 88 18 103 24"
                stroke="#FFFFFF"
                strokeOpacity="0.28"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            )}

            {/* Descending trailing orange circles */}
            {trailSide === 'right' ? (
              <>
                <circle cx="195" cy="122" r="10.5" fill={`url(#${gradId})`} />
                <circle cx="211" cy="141" r="6.2" fill={`url(#${gradId})`} />
              </>
            ) : (
              <>
                <circle cx="35" cy="122" r="10.5" fill={`url(#${gradId})`} />
                <circle cx="19" cy="141" r="6.2" fill={`url(#${gradId})`} />
              </>
            )}
          </g>
        )}
      </svg>

      {/* Crisp Centered Overlay Text */}
      <div
        className={`absolute inset-x-0 flex flex-col items-center justify-center text-center px-3 ${
          isPhone ? 'top-[13%] h-[66%]' : 'top-[14%] h-[62%]'
        }`}
      >
        <span
          className={`leading-[1.28] tracking-[-0.01em] ${
            isPhone
              ? 'text-[12.5px] font-bold text-[#1E2430]'
              : isOrange
                ? 'text-[11.5px] font-semibold text-white'
                : 'text-[12px] font-semibold text-[#1E2430]'
          }`}
        >
          {lines[0]}
        </span>
        {lines[1] && (
          <span
            className={`leading-[1.28] tracking-[-0.01em] ${
              isPhone
                ? 'text-[11.5px] font-semibold text-[#FF7A00]'
                : isOrange
                  ? 'text-[11.5px] font-semibold text-white'
                  : 'text-[12px] font-semibold text-[#1E2430]'
            }`}
          >
            {lines[1]}
          </span>
        )}
      </div>
    </div>
  );
};
