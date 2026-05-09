import React from 'react';
import logoSrc from '../assets/logo.png';

export default function DaliaLogo({ size = 24, className = '' }) {
  return (
    <img
      src={logoSrc}
      alt="DALIA"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain', display: 'block' }}
    />
  );
}
