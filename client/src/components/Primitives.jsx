// ─────────────────────────────────────────────
// Primitives.jsx — atomes partagés, stylés par classes (styles/components.css)
// ─────────────────────────────────────────────
import React from 'react';
import { champIcon, TAG_CFG, KIND_CFG } from '../data/mock';

// ── Portrait ────────────────────────────────────
export function Portrait({ champ, size = 48, banned = false, dim = false, className = '' }) {
  const box = { width: size, height: size };
  if (!champ) return <div className={`portrait portrait--empty ${className}`} style={box} aria-hidden="true"/>;
  return (
    <div className={`portrait ${banned ? 'portrait--banned' : ''} ${dim ? 'portrait--dim' : ''} ${className}`} style={box}>
      <img src={champIcon(champ.key)} alt={champ.name} width={size} height={size} loading="lazy"/>
      {banned && <div className="portrait__x" aria-hidden="true">✕</div>}
    </div>
  );
}

// ── Tag ─────────────────────────────────────────
export function Tag({ tag }) {
  const cfg = TAG_CFG[tag];
  if (!cfg) return null;
  return <span className={`tag ${cfg.cls}`}>{cfg.label}</span>;
}

/** Plain-text label of a tag, for compact rows. */
export function tagLabel(tag) {
  return TAG_CFG[tag]?.label || null;
}

// ── Niveau de pool ──────────────────────────────
export function TierBadge({ tier, large = false }) {
  if (!tier || tier === '—') return null;
  return <span className={`tier tier-${tier} ${large ? 'tier--lg' : ''}`}>{tier}</span>;
}

// ── Libellé de section numéroté ─────────────────
export function SectionLbl({ n, children, as: Heading = 'h2' }) {
  return (
    <div className="section-lbl">
      {n != null && <span className="section-lbl__n" aria-hidden="true">{String(n).padStart(2, '0')}</span>}
      <Heading className="section-lbl__t">{children}</Heading>
    </div>
  );
}

// ── Raison textuelle du moteur ──────────────────
export function ReasonItem({ reason }) {
  const text = typeof reason === 'string' ? reason : reason.text;
  const kind = typeof reason === 'string' ? 'info' : (reason.kind || 'info');
  const cfg = KIND_CFG[kind] || KIND_CFG.info;
  return (
    <li className={`reason reason--${cfg.tone}`}>
      <span className="reason__icon" aria-hidden="true">{cfg.bullet}</span>
      <span>{text}</span>
    </li>
  );
}
