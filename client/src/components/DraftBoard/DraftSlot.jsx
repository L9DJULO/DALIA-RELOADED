import React from 'react';
import { X } from 'lucide-react';
import { getDDragonChampUrl } from '../../lib/constants';

const ROLE_SHORT = { top: 'TOP', jungle: 'JGL', mid: 'MID', bot: 'ADC', support: 'SUP' };

const FALLBACK_ICON = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"%3E%3Crect width="34" height="34" fill="%23222"%2F%3E%3Ccircle cx="17" cy="13" r="6" fill="%23444"%2F%3E%3Cellipse cx="17" cy="26" rx="10" ry="6" fill="%23444"%2F%3E%3C%2Fsvg%3E';

export default function DraftSlot({ role, champion, isMySlot, team, onClick, onClear, label }) {
  const teamColor = team === 'blue' ? '#4a8bff' : 'var(--accent)';
  const borderColor = isMySlot
    ? 'var(--accent)'
    : champion
      ? teamColor
      : 'var(--border-subtle)';

  const handleClick = () => {
    if (isMySlot && !champion) return; // slot réservé — pas de pick manuel
    onClick?.();
  };

  return (
    <div
      onClick={handleClick}
      title={isMySlot && !champion ? "C'est ton slot — utilise la recommandation ou laisse le LCU sync le remplir." : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 8px', marginBottom: 3,
        background: isMySlot ? 'var(--accent-subtle)' : 'transparent',
        border: `1.5px solid ${borderColor}`,
        cursor: isMySlot && !champion ? 'not-allowed' : 'pointer',
        position: 'relative',
        minHeight: 44,
        transition: 'border-color 0.1s, background 0.1s',
      }}
    >
      {/* My slot left bar */}
      {isMySlot && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--accent)' }}/>
      )}

      {/* Role label */}
      <div style={{
        width: 30, flexShrink: 0, textAlign: 'center',
        fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 10,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: isMySlot ? 'var(--accent)' : 'var(--text-muted)',
      }}>
        {role ? ROLE_SHORT[role] : (label || '—')}
      </div>

      {/* Portrait */}
      {champion ? (
        <img
          src={getDDragonChampUrl(champion.key)}
          alt={champion.name}
          onError={e => { e.currentTarget.src = FALLBACK_ICON; }}
          style={{ width: 34, height: 34, objectFit: 'cover', flexShrink: 0, border: `1.5px solid ${teamColor}` }}
        />
      ) : (
        <div style={{
          width: 34, height: 34, flexShrink: 0,
          background: 'var(--surface-overlay)',
          border: `1px solid ${isMySlot ? 'var(--accent)' : 'var(--border-subtle)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: isMySlot ? 'var(--accent)' : 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}>
            {isMySlot ? '★' : '+'}
          </span>
        </div>
      )}

      {/* Name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {champion ? (
          <div style={{
            fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 13,
            letterSpacing: '0.04em',
            color: isMySlot ? 'var(--text-primary)' : teamColor,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{champion.name}</div>
        ) : (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.06em', color: isMySlot ? 'var(--accent)' : 'var(--text-muted)' }}>
            {isMySlot ? '▸ TON SLOT' : '—'}
          </div>
        )}
      </div>

      {/* Clear */}
      {champion && (
        <button
          onClick={e => { e.stopPropagation(); onClear?.(); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }}
        >
          <X size={11}/>
        </button>
      )}
    </div>
  );
}
