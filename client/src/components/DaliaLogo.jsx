import React from 'react';
import logoSrc from '../assets/logo.png';

/** The DALIA moon, the only logo of the app. */
export default function DaliaLogo({ size = 24, className = '', alt = 'DALIA', style }) {
  return <img src={logoSrc} alt={alt} width={size} height={size} className={`logo ${className}`} style={style}/>;
}
