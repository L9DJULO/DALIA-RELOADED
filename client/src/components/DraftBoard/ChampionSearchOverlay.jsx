// ─────────────────────────────────────────────
// Champion search overlay — Soul Eater design tokens
// Click an empty draft slot → search → click champion
// ─────────────────────────────────────────────
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import useChampionsStore from '../../stores/championsStore';
import useDraftStore from '../../stores/draftStore';
import { getDDragonChampUrl } from '../../lib/constants';
import { champIcon } from '../../data/mock';

function imgFor(c) {
  return c.image_url || (c.key && getDDragonChampUrl(c.key)) || (c.key && champIcon(c.key));
}

function rankMatches(query, list, unavailableIds) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const c of list) {
    if (unavailableIds.has(c.id)) continue;
    const name = (c.name || '').toLowerCase();
    let rank = -1;
    if (name.startsWith(q)) rank = 0;
    else if (name.includes(q)) rank = 1;
    else {
      const parts = name.split(/\s|'/).filter(Boolean);
      if (parts.length > 1 && parts.every((p, i) => i >= q.length || p.startsWith(q[i]))) rank = 2;
    }
    if (rank >= 0) out.push({ c, rank });
  }
  out.sort((a, b) => a.rank - b.rank || a.c.name.localeCompare(b.c.name));
  return out.slice(0, 8).map(x => x.c);
}

export default function ChampionSearchOverlay({ slot, onClose }) {
  const { champions, loaded, load } = useChampionsStore();
  const { setBan, setAllyPick, setEnemyPick, getAllUnavailableIds } = useDraftStore();

  const [query, setQuery]   = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const unavailable = useMemo(() => getAllUnavailableIds(), [getAllUnavailableIds, champions.length]);
  const matches = useMemo(() => rankMatches(query, champions, unavailable), [query, champions, unavailable]);

  useEffect(() => { setCursor(0); }, [query]);

  const commit = useCallback((c) => {
    if (!c || !slot) return;
    const payload = { id: c.id, key: c.key, name: c.name };
    if (slot.type === 'ban') {
      setBan(slot.team, slot.index, payload);
    } else if (slot.type === 'ally') {
      setAllyPick(slot.role, payload);
    } else if (slot.type === 'enemy') {
      setEnemyPick(slot.index, payload);
    }
    onClose();
  }, [slot, setBan, setAllyPick, setEnemyPick, onClose]);

  const onKey = (e) => {
    if (e.key === 'Escape')        { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown'){ e.preventDefault(); setCursor(c => Math.min(matches.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp')  { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === 'Enter')    { e.preventDefault(); if (matches[cursor]) commit(matches[cursor]); }
  };

  const title = slot
    ? slot.type === 'ban'
      ? `BAN ${slot.team === 'blue' ? 'BLUE' : 'RED'} #${(slot.index ?? 0) + 1}`
      : slot.type === 'ally'
        ? `PICK ALLIÉ · ${(slot.role || '').toUpperCase()}`
        : `PICK ENNEMI #${(slot.index ?? 0) + 1}`
    : '';

  return (
    <div
      role="dialog"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position:'fixed', inset:0, zIndex:200,
        background:'rgba(5,5,8,0.78)',
        display:'flex', alignItems:'flex-start', justifyContent:'center',
        paddingTop:'14vh',
      }}
    >
      <div
        className="anim-fade-up"
        style={{
          width:'min(560px, 92vw)',
          background:'var(--ink-1)',
          border:'var(--edge-weight) solid var(--bone-0)',
          boxShadow:'6px 6px 0 var(--ink-0)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'9px 14px',
          borderBottom:'var(--edge-weight) solid var(--ink-5)',
          background:'var(--ink-2)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{
              fontFamily:'var(--f-mono)', fontSize:10, letterSpacing:'0.18em',
              color:'var(--accent)', padding:'2px 8px',
              border:'1.5px solid var(--accent)',
            }}>{slot?.type === 'ban' ? 'BAN' : 'PICK'}</span>
            <span style={{ fontFamily:'var(--f-display)', fontSize:12, fontWeight:700, letterSpacing:'0.18em', color:'var(--bone-0)' }}>
              {title}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background:'none', border:'none', cursor:'pointer',
              fontFamily:'var(--f-display)', fontSize:14, color:'var(--bone-2)',
              padding:'2px 8px',
            }}
            aria-label="Fermer"
          >✕</button>
        </div>

        {/* Search input */}
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Tapez 2-3 lettres…"
          style={{
            display:'block', width:'100%',
            padding:'13px 16px',
            background:'var(--ink-0)',
            color:'var(--bone-0)',
            fontFamily:'var(--f-mono)', fontSize:14, letterSpacing:'0.04em',
            border:'none', borderBottom:'var(--edge-weight) solid var(--ink-5)',
            outline:'none',
          }}
        />

        {/* Results */}
        <div style={{ maxHeight:340, overflowY:'auto', background:'var(--ink-1)' }}>
          {!query && (
            <div style={{
              padding:'18px 16px', fontFamily:'var(--f-mono)', fontSize:11,
              color:'var(--bone-3)', letterSpacing:'0.1em', textAlign:'center',
            }}>
              {loaded ? 'TAPEZ POUR RECHERCHER' : 'CHARGEMENT DES CHAMPIONS…'}
            </div>
          )}

          {query && matches.length === 0 && (
            <div style={{
              padding:'18px 16px', fontFamily:'var(--f-mono)', fontSize:11,
              color:'var(--bad)', letterSpacing:'0.08em', textAlign:'center',
            }}>
              ! Aucun champion — peut-être déjà ban/pick ?
            </div>
          )}

          {matches.map((c, i) => {
            const active = i === cursor;
            return (
              <button
                key={c.id}
                onMouseEnter={() => setCursor(i)}
                onClick={() => commit(c)}
                style={{
                  display:'flex', alignItems:'center', gap:12,
                  width:'100%', padding:'8px 14px',
                  background: active ? 'var(--accent-muted)' : 'transparent',
                  border:'none', borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                  cursor:'pointer', textAlign:'left',
                }}
              >
                <img
                  src={imgFor(c)}
                  alt=""
                  loading="lazy"
                  style={{ width:36, height:36, objectFit:'cover', flexShrink:0, border:'1px solid var(--ink-5)' }}
                />
                <span style={{
                  flex:1,
                  fontFamily:'var(--f-display)', fontWeight:700, fontSize:13, letterSpacing:'0.06em',
                  color: active ? 'var(--accent)' : 'var(--bone-0)',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                }}>
                  {c.name.toUpperCase()}
                </span>
                {Array.isArray(c.roles) && c.roles.length > 0 && (
                  <span style={{
                    fontFamily:'var(--f-mono)', fontSize:9, letterSpacing:'0.1em',
                    color:'var(--bone-3)',
                  }}>
                    {c.roles.slice(0,2).map(r => r.slice(0,3).toUpperCase()).join(' · ')}
                  </span>
                )}
                {active && (
                  <span style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--accent)', letterSpacing:'0.18em' }}>↵</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hints */}
        <div style={{
          display:'flex', gap:14,
          padding:'7px 14px',
          borderTop:'1px solid var(--ink-5)',
          background:'var(--ink-2)',
          fontFamily:'var(--f-mono)', fontSize:9, color:'var(--bone-3)', letterSpacing:'0.18em',
        }}>
          <span>↑↓ NAV</span>
          <span>↵ VALIDER</span>
          <span>ESC FERMER</span>
        </div>
      </div>
    </div>
  );
}
