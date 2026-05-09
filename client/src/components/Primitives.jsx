// ─────────────────────────────────────────────
// Primitives.jsx — shared atoms
// ─────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { champIcon, TAG_CFG, KIND_CFG, ROLE_LABEL } from '../data/mock';

// ── Timer ──────────────────────────────────────
export function useTimer(initial = 28) {
  const [t, setT] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => setT(v => (v > 0 ? v - 1 : initial)), 1000);
    return () => clearInterval(id);
  }, [initial]);
  return t;
}

// ── Portrait ────────────────────────────────────
export function Portrait({ champ, size = 48, banned = false, dim = false, className = '', style = {} }) {
  const base = {
    width: size, height: size,
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    flexShrink: 0,
  };
  if (!champ) {
    return (
      <div className="portrait portrait-empty" style={{ ...base, ...style }}/>
    );
  }
  return (
    <div
      className={`portrait ${banned ? 'portrait-banned' : ''} ${dim ? 'portrait-dim' : ''} ${className}`}
      style={{ ...base, ...style }}
    >
      <img src={champIcon(champ.key)} alt={champ.name} />
      {banned && <div className="portrait-ban-x">✕</div>}
    </div>
  );
}

// ── Tag ─────────────────────────────────────────
export function Tag({ tag }) {
  const cfg = TAG_CFG[tag];
  if (!cfg) return null;
  return <span className={`tag ${cfg.cls}`}>{cfg.label}</span>;
}

// ── Tier badge ──────────────────────────────────
export function TierBadge({ tier }) {
  if (!tier || tier === '—') return null;
  return <span className={`tier tier-${tier}`}>{tier}</span>;
}

// ── Role chip ────────────────────────────────────
export function RoleChip({ role }) {
  if (!role) return null;
  return (
    <span style={{
      fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--bone-2)',
      padding: '1px 4px', border: '1px solid var(--ink-5)',
      letterSpacing: '0.08em', flexShrink: 0,
    }}>
      {ROLE_LABEL[role] ?? role.slice(0, 3).toUpperCase()}
    </span>
  );
}

// ── Score bar ────────────────────────────────────
export function Bar({ label, value, max = 100 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--bone-2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontFamily: 'var(--f-display)', fontSize: 11, fontWeight: 700, color: 'var(--bone-0)' }}>{Math.round(value)}</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%` }}/>
      </div>
    </div>
  );
}

// ── Delta ────────────────────────────────────────
export function Delta({ value }) {
  if (Math.abs(value) < 0.5) {
    return <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--bone-3)' }}>≈</span>;
  }
  const pos = value > 0;
  return (
    <span style={{
      fontFamily: 'var(--f-mono)', fontWeight: 700, fontSize: 11,
      color: pos ? 'var(--ok)' : 'var(--bad)',
      minWidth: 46, textAlign: 'right', display: 'inline-block',
    }}>
      {pos ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

// ── Section label ────────────────────────────────
export function SectionLbl({ n, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      {n != null && (
        <span style={{
          fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)',
          padding: '2px 7px', border: '1.5px solid var(--accent)', letterSpacing: '0.1em',
        }}>{String(n).padStart(2, '0')}</span>
      )}
      <span style={{
        fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 13,
        letterSpacing: '0.12em', color: 'var(--bone-0)', textTransform: 'uppercase',
      }}>{children}</span>
    </div>
  );
}

// ── Reason bullet ────────────────────────────────
export function ReasonBullet({ reason }) {
  const text = typeof reason === 'string' ? reason : reason.text;
  const kind = typeof reason === 'string' ? 'info' : (reason.kind || 'info');
  const cfg  = KIND_CFG[kind] || KIND_CFG.info;
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      padding: '5px 10px',
      background: cfg.bg,
      borderLeft: `2.5px solid ${cfg.border}`,
      fontSize: 12, color: 'var(--bone-1)', lineHeight: 1.5,
    }}>
      <span style={{ color: cfg.color, fontFamily: 'var(--f-display)', fontSize: 11, flexShrink: 0, marginTop: 1, lineHeight: 1 }}>
        {cfg.bullet}
      </span>
      <span>{text}</span>
    </div>
  );
}

// ── Timer chip ────────────────────────────────────
export function TimerChip({ initial = 28 }) {
  const t = useTimer(initial);
  const danger = t <= 10;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 6,
      padding: '6px 12px',
      border: `var(--edge-weight) solid ${danger ? 'var(--accent)' : 'var(--bone-0)'}`,
      background: danger ? 'var(--accent)' : 'var(--ink-2)',
    }}>
      <span style={{
        fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 22,
        color: danger ? 'var(--accent-ink)' : 'var(--bone-0)',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>
        {String(t).padStart(2, '0')}
      </span>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.2em', color: danger ? 'var(--accent-ink)' : 'var(--bone-2)' }}>
        SEC
      </span>
    </div>
  );
}

// ── LCU badge ────────────────────────────────────
export function LCUBadge({ connected = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.12em', color: connected ? 'var(--ok)' : 'var(--bone-3)' }}>
      <span className={`lcu-dot ${connected ? 'lcu-on' : 'lcu-off'}`}/>
      {connected ? 'LCU CONNECTÉ' : 'LCU OFFLINE'}
    </div>
  );
}
