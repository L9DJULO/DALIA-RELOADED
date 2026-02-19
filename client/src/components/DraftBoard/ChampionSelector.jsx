import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

const ROLE_FILTER = ['all', 'top', 'jungle', 'mid', 'bot', 'support'];
const ROLE_LABELS = { all: 'Tous', top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };

export default function ChampionSelector({ champions, unavailableIds, onSelect, onClose, target }) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const panelRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const filtered = useMemo(() => {
    let list = [...champions];
    if (roleFilter !== 'all') {
      list = list.filter((c) => c.roles?.includes(roleFilter));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const aUn = unavailableIds.has(a.id) ? 1 : 0;
      const bUn = unavailableIds.has(b.id) ? 1 : 0;
      if (aUn !== bUn) return aUn - bUn;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [champions, search, roleFilter, unavailableIds]);

  const titleText = target?.type === 'ban'
    ? `Ban ${target.team === 'blue' ? 'Blue' : 'Red'} #${(target.index || 0) + 1}`
    : `Pick ${target?.role || '?'} (${target?.team || '?'})`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Sélection de champion"
    >
      <div ref={panelRef} className="bg-surface border border-slate-700/50 rounded-lg w-[620px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-700/50">
          <div>
            <div className="text-sm font-semibold text-slate-100">{titleText}</div>
            <div className="text-[11px] text-slate-500">Sélectionner un champion</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-lg hover:bg-surface-elevated text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search + filters */}
        <div className="p-3 space-y-2 border-b border-slate-700/50">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              aria-label="Rechercher un champion"
              className="w-full bg-surface-elevated border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm
                         text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div className="flex gap-1">
            {ROLE_FILTER.map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                aria-pressed={roleFilter === r}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors duration-150 ${
                  roleFilter === r
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-surface-elevated border border-transparent'
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Champion grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-8 gap-1.5">
            {filtered.map((champ) => {
              const disabled = unavailableIds.has(champ.id);
              return (
                <button
                  key={champ.id}
                  disabled={disabled}
                  onClick={() => onSelect(champ)}
                  aria-label={`${champ.name}${disabled ? ' (indisponible)' : ''}`}
                  className={`relative rounded-lg overflow-hidden border transition-colors duration-150 ${
                    disabled
                      ? 'opacity-25 cursor-not-allowed border-slate-800 grayscale'
                      : 'border-slate-700 hover:border-amber-500 cursor-pointer'
                  }`}
                >
                  <img
                    src={champ.image_url}
                    alt={champ.name}
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent
                                  px-1 py-0.5 text-[9px] text-center truncate text-white font-medium">
                    {champ.name}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
