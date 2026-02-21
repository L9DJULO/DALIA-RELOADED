import React, { useId } from 'react';

/**
 * DALIA Logo — Premium crystal/diamond monogram.
 */
export default function DaliaLogo({ size = 24, className = '' }) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-label="DALIA"
    >
      <defs>
        <linearGradient id={`${id}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#b09aff" />
          <stop offset="50%" stopColor="#7c5cfc" />
          <stop offset="100%" stopColor="#5b3ad9" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <filter id={`${id}-glow`}>
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Outer glow */}
      <path
        d="M16 2L28 12L16 30L4 12L16 2Z"
        fill={`url(#${id}-grad)`}
        filter={`url(#${id}-glow)`}
        opacity="0.5"
      />
      {/* Main crystal shape */}
      <path
        d="M16 2L28 12L16 30L4 12L16 2Z"
        fill={`url(#${id}-grad)`}
      />
      {/* Top facet highlight */}
      <path
        d="M16 2L28 12L16 18L4 12L16 2Z"
        fill={`url(#${id}-shine)`}
      />
      {/* Inner facet */}
      <path
        d="M16 2L10 12L16 18L22 12L16 2Z"
        fill="rgba(255,255,255,0.08)"
      />
      {/* D letterform */}
      <text
        x="16"
        y="17"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="800"
        fontSize="10"
        letterSpacing="-0.5"
      >
        D
      </text>
    </svg>
  );
}
