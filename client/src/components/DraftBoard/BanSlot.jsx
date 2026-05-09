import React from 'react';
import { X } from 'lucide-react';
import { getDDragonChampUrl } from '../../lib/constants';

export default function BanSlot({ champion, onClick, onClear }) {
  return (
    <div
      onClick={onClick}
      title={champion ? champion.name : 'Cliquer pour bannir'}
      style={{
        width: 32, height: 32, flexShrink: 0,
        border: '1.5px solid ' + (champion ? 'var(--loss-border)' : 'var(--border-subtle)'),
        background: champion ? 'var(--loss-bg)' : 'var(--surface-overlay)',
        cursor: 'pointer', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'border-color 0.1s',
      }}
    >
      {champion ? (
        <>
          <img
            src={getDDragonChampUrl(champion.key)}
            alt={champion.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(60%) brightness(0.55)' }}
          />
          {/* Red X overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <X size={14} style={{ color: 'var(--loss)', opacity: 0.85 }}/>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onClear?.(); }}
            style={{
              position: 'absolute', top: -7, right: -7,
              background: 'var(--loss)', border: 'none',
              width: 14, height: 14, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0, zIndex: 1,
            }}
          >
            <X size={8} style={{ color: '#fff' }}/>
          </button>
        </>
      ) : (
        <span style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--text-muted)', lineHeight: 1 }}>×</span>
      )}
    </div>
  );
}
