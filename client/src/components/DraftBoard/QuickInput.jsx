import React, { useState, useMemo, useRef } from 'react';
import { Zap } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import { getDDragonChampUrl, ROLES } from '../../lib/constants';

const ROLE_SHORT = { top: 'TOP', jungle: 'JGL', mid: 'MID', bot: 'ADC', support: 'SUP' };

export default function QuickInput({ champions }) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState('enemy');
  const inputRef = useRef(null);

  const enemyPicks = useDraftStore(s => s.enemyPicks);
  const setEnemyPick = useDraftStore(s => s.setEnemyPick);
  const setAllyPick  = useDraftStore(s => s.setAllyPick);

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return champions
      .filter(c => c.name.toLowerCase().startsWith(q) || c.id.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [champions, query]);

  const handleSelect = (champ) => {
    const c = { id: champ.id, key: champ.key, name: champ.name };
    if (target === 'enemy') {
      const emptyIdx = enemyPicks.findIndex(p => !p);
      if (emptyIdx >= 0) setEnemyPick(emptyIdx, c);
    } else {
      setAllyPick(target, c);
    }
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Zap size={12} style={{ color: 'var(--accent)', flexShrink: 0 }}/>

      <select
        value={target}
        onChange={e => setTarget(e.target.value)}
        style={{
          padding: '4px 8px',
          background: 'var(--surface-elevated)',
          border: '1.5px solid var(--border-subtle)',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--f-display)', fontSize: 10, letterSpacing: '0.1em',
          cursor: 'pointer', outline: 'none', flexShrink: 0,
        }}
      >
        <option value="enemy">ENNEMI</option>
        {ROLES.map(r => <option key={r} value={r}>{ROLE_SHORT[r]}</option>)}
      </select>

      <div style={{ flex: 1, position: 'relative' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Champion rapide..."
          style={{
            width: '100%', padding: '5px 10px',
            background: 'var(--surface-elevated)',
            border: '1.5px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--f-mono)', fontSize: 11,
            outline: 'none', transition: 'border-color 0.1s',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border-subtle)'}
          onKeyDown={e => {
            if (e.key === 'Escape') setQuery('');
            if (e.key === 'Enter' && matches.length >= 1) handleSelect(matches[0]);
          }}
        />

        {matches.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: 'var(--surface-overlay)',
            border: '2px solid var(--border-default)',
            boxShadow: '4px 4px 0 var(--accent)',
          }}>
            {matches.map(c => (
              <button
                key={c.id}
                onMouseDown={() => handleSelect(c)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '6px 10px',
                  background: 'transparent', border: 'none',
                  color: 'var(--text-primary)', cursor: 'pointer',
                  transition: 'background 0.1s', textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-muted)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <img src={getDDragonChampUrl(c.key)} alt={c.name} style={{ width: 24, height: 24, objectFit: 'cover', flexShrink: 0 }}/>
                <span style={{ fontFamily: 'var(--f-display)', fontSize: 12, letterSpacing: '0.06em' }}>{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
