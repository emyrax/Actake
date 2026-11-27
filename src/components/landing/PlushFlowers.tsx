import React, { useId } from 'react';

interface PlushClusterProps {
  className?: string;
}

/**
 * Left 3D Plush Felt Flower Cluster
 * Matches the reference aesthetic:
 * - Large warm apricot/peach plush flower (#FFAC63)
 * - Medium coral-red flower (#F25C43) with cute kawaii face & rosy cheeks
 * - Lower periwinkle/lavender flower (#8A8EF2)
 * - Sunny yellow cushion petals (#FFD15C) & thick rounded green stems (#88B840)
 */
export const LeftPlushFlowerCluster: React.FC<PlushClusterProps> = ({ className = '' }) => {
  const uid = useId().replace(/:/g, '');

  return (
    <svg
      viewBox="0 0 420 410"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <defs>
        {/* Soft plush fuzzy shadow filter */}
        <filter id={`plushShadow-${uid}`} x="-20%" y="-20%" width="145%" height="145%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#B57444" floodOpacity="0.22" />
        </filter>

        {/* Soft plush ambient fuzz texture */}
        <filter id={`feltBlur-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" />
        </filter>

        {/* Apricot / Peach 3D petal gradient */}
        <radialGradient id={`peach-${uid}`} cx="36%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#FFE1B8" />
          <stop offset="48%" stopColor="#FFAC63" />
          <stop offset="88%" stopColor="#F38D3F" />
          <stop offset="100%" stopColor="#E1772B" />
        </radialGradient>

        {/* Coral / Red 3D petal gradient */}
        <radialGradient id={`coral-${uid}`} cx="35%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#FF9780" />
          <stop offset="46%" stopColor="#F25C43" />
          <stop offset="88%" stopColor="#D93E26" />
          <stop offset="100%" stopColor="#BE2F1A" />
        </radialGradient>

        {/* Periwinkle / Lavender 3D petal gradient */}
        <radialGradient id={`periwinkle-${uid}`} cx="36%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#C9CEFF" />
          <stop offset="48%" stopColor="#8A8EF2" />
          <stop offset="88%" stopColor="#696EDB" />
          <stop offset="100%" stopColor="#565AC2" />
        </radialGradient>

        {/* Sunny Yellow cushion gradient */}
        <radialGradient id={`yellow-${uid}`} cx="38%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#FFF0A8" />
          <stop offset="50%" stopColor="#FFD15C" />
          <stop offset="92%" stopColor="#F0AE28" />
        </radialGradient>

        {/* Thick plush green stem gradient */}
        <linearGradient id={`stem-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#A6D458" />
          <stop offset="52%" stopColor="#88B840" />
          <stop offset="100%" stopColor="#6D992D" />
        </linearGradient>

        {/* Center kawaii face cushion */}
        <radialGradient id={`faceCream-${uid}`} cx="40%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#FFF8EF" />
          <stop offset="70%" stopColor="#FFE0C2" />
          <stop offset="100%" stopColor="#F5BD93" />
        </radialGradient>
      </defs>

      <g filter={`url(#plushShadow-${uid})`}>
        {/* Stem 1: Tall center-left peach flower stem */}
        <path
          d="M178 415C178 360 182 285 186 220"
          stroke={`url(#stem-${uid})`}
          strokeWidth="28"
          strokeLinecap="round"
        />

        {/* Stem 2: Right coral flower stem */}
        <path
          d="M276 415C282 372 289 332 296 296"
          stroke={`url(#stem-${uid})`}
          strokeWidth="16"
          strokeLinecap="round"
        />

        {/* Bottom Sunny Yellow Plush Flower Cushion */}
        <g transform="translate(154, 378)">
          <circle cx="-36" cy="14" r="44" fill={`url(#yellow-${uid})`} />
          <circle cx="38" cy="16" r="44" fill={`url(#yellow-${uid})`} />
          <circle cx="0" cy="-16" r="34" fill={`url(#faceCream-${uid})`} />
          {/* Tiny peeking face */}
          <circle cx="-9" cy="-15" r="2.6" fill="#2A1E1B" />
          <circle cx="9" cy="-15" r="2.6" fill="#2A1E1B" />
          <ellipse cx="-14" cy="-10" rx="5.5" ry="3.2" fill="#FF8C8C" fillOpacity="0.65" />
          <ellipse cx="14" cy="-10" rx="5.5" ry="3.2" fill="#FF8C8C" fillOpacity="0.65" />
          <path d="M-3.5 -10C-1.8 -8 1.8 -8 3.5 -10" stroke="#2A1E1B" strokeWidth="1.8" strokeLinecap="round" />
        </g>

        {/* Large Warm Apricot / Peach Plush Flower (Top-Left Center) */}
        <g transform="translate(186, 178)">
          <circle cx="0" cy="-64" r="60" fill={`url(#peach-${uid})`} />
          <circle cx="64" cy="-14" r="58" fill={`url(#peach-${uid})`} />
          <circle cx="42" cy="56" r="56" fill={`url(#peach-${uid})`} />
          <circle cx="-42" cy="56" r="56" fill={`url(#peach-${uid})`} />
          <circle cx="-64" cy="-14" r="58" fill={`url(#peach-${uid})`} />
          {/* Plush center bud */}
          <circle cx="0" cy="4" r="36" fill={`url(#faceCream-${uid})`} />
          <circle cx="0" cy="4" r="29" fill="#FFCE9C" fillOpacity="0.55" filter={`url(#feltBlur-${uid})`} />
        </g>

        {/* Lower-Left Periwinkle / Lavender Plush Flower */}
        <g transform="translate(68, 316)">
          <circle cx="0" cy="-42" r="42" fill={`url(#periwinkle-${uid})`} />
          <circle cx="42" cy="-6" r="40" fill={`url(#periwinkle-${uid})`} />
          <circle cx="24" cy="40" r="40" fill={`url(#periwinkle-${uid})`} />
          <circle cx="-28" cy="40" r="40" fill={`url(#periwinkle-${uid})`} />
          <circle cx="-44" cy="-6" r="42" fill={`url(#periwinkle-${uid})`} />
          <circle cx="0" cy="4" r="24" fill={`url(#faceCream-${uid})`} />
        </g>

        {/* Medium Coral-Red Plush Flower with Cute Kawaii Face */}
        <g transform="translate(302, 278)">
          <circle cx="0" cy="-40" r="34" fill={`url(#coral-${uid})`} />
          <circle cx="40" cy="-10" r="34" fill={`url(#coral-${uid})`} />
          <circle cx="26" cy="36" r="33" fill={`url(#coral-${uid})`} />
          <circle cx="-26" cy="36" r="33" fill={`url(#coral-${uid})`} />
          <circle cx="-40" cy="-10" r="34" fill={`url(#coral-${uid})`} />
          {/* Cute Kawaii Face Center */}
          <circle cx="0" cy="4" r="24" fill={`url(#faceCream-${uid})`} />
          <circle cx="-8.5" cy="1.5" r="2.8" fill="#2A1E1B" />
          <circle cx="8.5" cy="1.5" r="2.8" fill="#2A1E1B" />
          <circle cx="-9.3" cy="0.6" r="0.9" fill="#FFFFFF" />
          <circle cx="7.7" cy="0.6" r="0.9" fill="#FFFFFF" />
          <ellipse cx="-14" cy="6.5" rx="5" ry="3.2" fill="#FF7979" fillOpacity="0.62" />
          <ellipse cx="14" cy="6.5" rx="5" ry="3.2" fill="#FF7979" fillOpacity="0.62" />
          <path
            d="M-3.5 6.8C-1.8 9.2 1.8 9.2 3.5 6.8"
            stroke="#2A1E1B"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  );
};

/**
 * Right 3D Plush Felt Flower Cluster
 * Matches the reference aesthetic:
 * - Large peach flower (#FFAC63) with cute kawaii smiling face centered on upper blossom
 * - Coral-red plush flower (#F25C43) on the inner left
 * - Soft periwinkle/lavender flower (#8A8EF2) on the outer right
 * - Sunny yellow base accent & rounded green stems
 */
export const RightPlushFlowerCluster: React.FC<PlushClusterProps> = ({ className = '' }) => {
  const uid = useId().replace(/:/g, '');

  return (
    <svg
      viewBox="0 0 430 410"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <defs>
        <filter id={`plushShadowR-${uid}`} x="-20%" y="-20%" width="145%" height="145%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#B57444" floodOpacity="0.22" />
        </filter>

        <radialGradient id={`peachR-${uid}`} cx="36%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#FFE1B8" />
          <stop offset="48%" stopColor="#FFAC63" />
          <stop offset="88%" stopColor="#F38D3F" />
          <stop offset="100%" stopColor="#E1772B" />
        </radialGradient>

        <radialGradient id={`coralR-${uid}`} cx="35%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#FF9780" />
          <stop offset="46%" stopColor="#F25C43" />
          <stop offset="88%" stopColor="#D93E26" />
          <stop offset="100%" stopColor="#BE2F1A" />
        </radialGradient>

        <radialGradient id={`periwinkleR-${uid}`} cx="36%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#C9CEFF" />
          <stop offset="48%" stopColor="#8A8EF2" />
          <stop offset="88%" stopColor="#696EDB" />
          <stop offset="100%" stopColor="#565AC2" />
        </radialGradient>

        <radialGradient id={`yellowR-${uid}`} cx="38%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#FFF0A8" />
          <stop offset="50%" stopColor="#FFD15C" />
          <stop offset="92%" stopColor="#F0AE28" />
        </radialGradient>

        <linearGradient id={`stemR-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#A6D458" />
          <stop offset="52%" stopColor="#88B840" />
          <stop offset="100%" stopColor="#6D992D" />
        </linearGradient>

        <radialGradient id={`faceCreamR-${uid}`} cx="40%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#FFF8EF" />
          <stop offset="70%" stopColor="#FFE0C2" />
          <stop offset="100%" stopColor="#F5BD93" />
        </radialGradient>
      </defs>

      <g filter={`url(#plushShadowR-${uid})`}>
        {/* Stem 1: Tall center-right peach stem */}
        <path
          d="M236 415C236 360 232 292 228 228"
          stroke={`url(#stemR-${uid})`}
          strokeWidth="26"
          strokeLinecap="round"
        />

        {/* Stem 2: Inner coral flower stem */}
        <path
          d="M126 415C120 374 114 334 108 296"
          stroke={`url(#stemR-${uid})`}
          strokeWidth="15"
          strokeLinecap="round"
        />

        {/* Sunny Yellow Accent Petals at Bottom */}
        <g transform="translate(264, 382)">
          <circle cx="-38" cy="14" r="42" fill={`url(#yellowR-${uid})`} />
          <circle cx="36" cy="14" r="42" fill={`url(#yellowR-${uid})`} />
        </g>

        {/* Inner Coral-Red Plush Flower */}
        <g transform="translate(106, 276)">
          <circle cx="0" cy="-38" r="34" fill={`url(#coralR-${uid})`} />
          <circle cx="38" cy="-8" r="33" fill={`url(#coralR-${uid})`} />
          <circle cx="24" cy="36" r="32" fill={`url(#coralR-${uid})`} />
          <circle cx="-24" cy="36" r="32" fill={`url(#coralR-${uid})`} />
          <circle cx="-38" cy="-8" r="33" fill={`url(#coralR-${uid})`} />
          <circle cx="0" cy="4" r="22" fill={`url(#faceCreamR-${uid})`} />
        </g>

        {/* Outer-Right Periwinkle / Lavender Plush Flower */}
        <g transform="translate(348, 304)">
          <circle cx="0" cy="-42" r="42" fill={`url(#periwinkleR-${uid})`} />
          <circle cx="44" cy="-6" r="42" fill={`url(#periwinkleR-${uid})`} />
          <circle cx="26" cy="42" r="40" fill={`url(#periwinkleR-${uid})`} />
          <circle cx="-26" cy="42" r="40" fill={`url(#periwinkleR-${uid})`} />
          <circle cx="-42" cy="-6" r="40" fill={`url(#periwinkleR-${uid})`} />
          <circle cx="0" cy="4" r="24" fill={`url(#faceCreamR-${uid})`} />
        </g>

        {/* Hero Large Peach Plush Flower with Adorable Smiling Face */}
        <g transform="translate(226, 174)">
          <circle cx="0" cy="-64" r="60" fill={`url(#peachR-${uid})`} />
          <circle cx="64" cy="-14" r="58" fill={`url(#peachR-${uid})`} />
          <circle cx="42" cy="56" r="56" fill={`url(#peachR-${uid})`} />
          <circle cx="-42" cy="56" r="56" fill={`url(#peachR-${uid})`} />
          <circle cx="-64" cy="-14" r="58" fill={`url(#peachR-${uid})`} />

          {/* Kawaii Face Cushion */}
          <circle cx="0" cy="-4" r="36" fill={`url(#faceCreamR-${uid})`} />
          {/* Eyes */}
          <circle cx="-13" cy="-8" r="4.2" fill="#2A1E1B" />
          <circle cx="13" cy="-8" r="4.2" fill="#2A1E1B" />
          <circle cx="-14.3" cy="-9.5" r="1.4" fill="#FFFFFF" />
          <circle cx="11.7" cy="-9.5" r="1.4" fill="#FFFFFF" />
          {/* Rosy Cheeks */}
          <ellipse cx="-21" cy="0.5" rx="7.5" ry="4.5" fill="#FF7B7B" fillOpacity="0.65" />
          <ellipse cx="21" cy="0.5" rx="7.5" ry="4.5" fill="#FF7B7B" fillOpacity="0.65" />
          {/* Sweet Smile */}
          <path
            d="M-5 0.5C-2.5 4.2 2.5 4.2 5 0.5"
            stroke="#2A1E1B"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  );
};
