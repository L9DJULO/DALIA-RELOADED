import React from 'react';
import { X } from 'lucide-react';
import { getDDragonChampUrl } from '../../lib/constants';

const ROLE_SHORT = { top: 'TOP', jungle: 'JGL', mid: 'MID', bot: 'ADC', support: 'SUP' };

export default function DraftSlot({ role, champion, isMySlot, team, onClick, onClear, label }) {
  const teamColor = team === 'blue' ? '#4a8bff' : 'var(--accent)';
  const borderColor = isMySlot
    ? 'var(--accent)'
    : champion
      ? teamColor
      : 'var(--border-subtle)';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 8px', marginBottom: 3,
        background: isMySlot ? 'var(--accent-subtle)' : 'transparent',
        border: `1.5px solid ${borderColor}`,
        cursor: 'pointer', position: 'relative',
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
          style={{ width: 34, height: 34, objectFit: 'cover', flexShrink: 0, border: `1.5px solid ${teamColor}` }}
        />
      ) : (
        <div style={{
          width: 34, height: 34, flexShrink: 0,
          background: 'var(--surface-overlay)',
          border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}>+</span>
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
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            {isMySlot ? '▸ CHOISIR' : '—'}
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
