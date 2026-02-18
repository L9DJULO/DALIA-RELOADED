import React from 'react';

// Icônes SVG officielles des rôles LoL
const ROLE_PATHS = {
  top: (
    <path d="M2 2h8v2H4v6H2V2zm12 0h6v10h-2V4h-4V2zm6 12v6h-8v-2h6v-4h2zM2 14h2v4h4v2H2v-6z" fill="currentColor"/>
  ),
  jungle: (
    <path d="M10 2L4 8l2 2 4-4 4 4 2-2-6-6zm0 6L6 12l4 6 4-6-4-4zm0 4l-2 3h4l-2-3z" fill="currentColor"/>
  ),
  mid: (
    <path d="M3 3l14 14M3 17L17 3M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" fill="none"/>
  ),
  bot: (
    <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 2a6 6 0 110 12 6 6 0 010-12zm0 2a4 4 0 100 8 4 4 0 000-8zm0 2a2 2 0 110 4 2 2 0 010-4z" fill="currentColor"/>
  ),
  support: (
    <path d="M10 2L6 6v4l4 4 4-4V6l-4-4zm0 2.8L12.2 7v2.2L10 11.2 7.8 9.2V7L10 4.8zM4 12v6h4v-4h4v4h4v-6l-2 2v2h-2v-2H8v2H6v-2l-2-2z" fill="currentColor"/>
  ),
};

const ROLE_LABELS = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };

export default function RoleIcon({ role, size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className={className}
      role="img"
      aria-label={ROLE_LABELS[role] || role}
    >
      {ROLE_PATHS[role]}
    </svg>
  );
}
