import React from 'react';

/**
 * DALIA Logo — Crystal/Diamond shape with a "D" letterform.
 * Unique identity, distinct from Blitz's lightning bolt.
 */
export default function DaliaLogo({ size = 24, className = '' }) {
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
        <linearGradient id="dalia-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
        <linearGradient id="dalia-shine" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      {/* Crystal/Diamond shape */}
      <path
        d="M16 2L28 12L16 30L4 12L16 2Z"
        fill="url(#dalia-grad)"
      />
      {/* Inner facet */}
      <path
        d="M16 2L28 12L16 18L4 12L16 2Z"
        fill="url(#dalia-shine)"
      />
      {/* Highlight edge */}
      <path
        d="M16 2L10 12L16 18L22 12L16 2Z"
        fill="rgba(255,255,255,0.12)"
      />
      {/* D letterform */}
      <text
        x="16"
        y="17"
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontFamily="Space Grotesk, Inter, sans-serif"
        fontWeight="700"
        fontSize="10"
        letterSpacing="-0.5"
      >
        D
      </text>
    </svg>
  );
}
