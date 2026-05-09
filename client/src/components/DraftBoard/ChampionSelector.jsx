import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';
import { getDDragonChampUrl } from '../../lib/constants';

export default function ChampionSelector({ champions, unavailableIds, onSelect, onClose, target }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim();
    return champions
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [champions, debouncedQuery]);

  const isUnavailable = (id) => unavailableIds?.has(id);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 720, maxHeight: '82vh',
          background: 'var(--surface-card)',
          border: '2.5px solid #f0ebe0',
          boxShadow: '8px 8px 0 var(--accent)',
          display: 'flex', flexDirection: 'column',
          animation: 'scaleIn 0.14s ease-out both',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          borderBottom: '2px solid var(--border-default)',
          flexShrink: 0,
        }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: '0.15em', color: 'var(--accent)', marginRight: 4 }}>
            SÉLECTIONNER
          </div>
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', pointerEvents: 'none' }}/>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher un champion..."
              style={{
                width: '100%', padding: '8px 12px 8px 32px',
                background: 'var(--surface-elevated)',
                border: '2px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--f-mono)', fontSize: 12,
                outline: 'none',
                transition: 'border-color 0.1s',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '3px 3px 0 var(--accent)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border-subtle)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex' }}
          >
            <X size={18}/>
          </button>
        </div>

        {/* Grid */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
          gap: 6, alignContent: 'start',
        }}>
          {filtered.map(c => {
            const unavail = isUnavailable(c.id);
            return (
              <button
                key={c.id}
                onClick={() => !unavail && onSelect(c)}
                disabled={unavail}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '6px 4px',
                  background: 'var(--surface-elevated)',
                  border: '1.5px solid var(--border-subtle)',
                  cursor: unavail ? 'not-allowed' : 'pointer',
                  opacity: unavail ? 0.3 : 1,
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => {
                  if (!unavail) {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.background = 'var(--accent-subtle)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  e.currentTarget.style.background = 'var(--surface-elevated)';
                }}
              >
                <img src={getDDragonChampUrl(c.key)} alt={c.name} style={{ width: 54, height: 54, objectFit: 'cover' }}/>
                <span style={{
                  fontFamily: 'var(--f-display)', fontSize: 9, letterSpacing: '0.07em',
                  color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.2,
                  maxWidth: 68, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {c.name.toUpperCase()}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: 32, textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              AUCUN RÉSULTAT
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border-subtle)',
          fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)',
          letterSpacing: '0.08em', display: 'flex', gap: 16, flexShrink: 0,
        }}>
          <span>{filtered.length} champion{filtered.length !== 1 ? 's' : ''}</span>
          {unavailableIds?.size > 0 && <span style={{ color: 'var(--loss)' }}>{unavailableIds.size} indisponibles</span>}
          <span style={{ marginLeft: 'auto' }}>ESC pour fermer</span>
        </div>
      </div>
    </div>
  );
}
