// ─────────────────────────────────────────────
// ChampionSearch.jsx — dialogue de saisie : taper, ↑ ↓, Entrée, Échap
// ─────────────────────────────────────────────
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import useChampionsStore from '../../stores/championsStore';
import { champIcon } from '../../data/mock';
import { searchChampions } from '../../lib/championSearch';

export default function ChampionSearch({ title, onSelect, onClose, unavailable }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const champions = useChampionsStore(s => s.champions);
  const loaded = useChampionsStore(s => s.loaded);
  const load = useChampionsStore(s => s.load);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => searchChampions(champions, query, unavailable), [champions, query, unavailable]);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const optionId = c => `${listId}-${c.id}`;
  // The dialog owns its keys: once React has closed it, an Enter that reached `window`
  // would look like "Enter with nothing focused" and launch the analysis.
  function onKeyDown(e) {
    const handled = { Escape: () => onClose(), ArrowDown: () => setActive(i => Math.min(results.length - 1, i + 1)),
      ArrowUp: () => setActive(i => Math.max(0, i - 1)), Enter: () => results[active] && onSelect(results[active]) }[e.key];
    if (!handled) return;
    e.preventDefault();
    e.stopPropagation();
    handled();
  }

  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="search-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
        <div className="search-dialog__head">
          <span className="lbl">{title}</span>
          <button className="btn btn--sm btn--ghost" onClick={() => onSelect(null)}>Vider cet emplacement</button>
        </div>
        <input
          ref={inputRef}
          className="field"
          aria-label="Rechercher un champion"
          aria-controls={listId}
          aria-activedescendant={results[active] ? optionId(results[active]) : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Nom du champion…"
          autoComplete="off"
          spellCheck={false}
        />
        <ul className="search-results" role="listbox" id={listId} aria-label="Champions disponibles" ref={listRef}>
          {results.map((c, i) => (
            <li
              key={c.id}
              id={optionId(c)}
              role="option"
              aria-selected={i === active}
              className="search-option"
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => e.preventDefault()}
              onClick={() => onSelect(c)}
            >
              <img src={champIcon(c.key)} alt="" width="28" height="28"/>
              <span>{c.name.toUpperCase()}</span>
              {i === active && <span className="kbd" aria-hidden="true">ENTRÉE</span>}
            </li>
          ))}
        </ul>
        {query.trim() && results.length === 0 && (
          <p className="search-empty">Aucun champion disponible pour « {query} ».</p>
        )}
        <p className="search-hint">
          <span className="kbd">↑</span> <span className="kbd">↓</span> naviguer · <span className="kbd">Entrée</span> choisir · <span className="kbd">Échap</span> fermer
        </p>
      </div>
    </div>
  );
}
