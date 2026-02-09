import React, { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';

const ROLE_FILTER = ['all', 'top', 'jungle', 'mid', 'bot', 'support'];
const ROLE_LABELS = { all: 'Tous', top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };

export default function ChampionSelector({ champions, unavailableIds, onSelect, onClose, target }) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dalia-surface/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div>
            <div className="text-sm font-semibold">{titleText}</div>
            <div className="text-xs text-dalia-muted">Choisir un champion</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-dalia-card text-dalia-muted hover:text-dalia-text">
            <X size={18} />
          </button>
        </div>

        {/* Search + filters */}
        <div className="p-3 space-y-2 border-b border-white/[0.06]">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dalia-muted" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full bg-dalia-card border border-dalia-border rounded-lg pl-8 pr-3 py-2 text-sm
                         text-dalia-text placeholder-dalia-muted focus:outline-none focus:border-dalia-accent"
            />
          </div>
          <div className="flex gap-1">
            {ROLE_FILTER.map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  roleFilter === r
                    ? 'bg-dalia-accent/20 text-dalia-accent'
                    : 'text-dalia-muted hover:text-dalia-text hover:bg-dalia-card'
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Champion grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-7 gap-1.5">
            {filtered.map((champ) => {
              const disabled = unavailableIds.has(champ.id);
              return (
                <button
                  key={champ.id}
                  disabled={disabled}
                  onClick={() => onSelect(champ)}
                  className={`relative rounded-lg overflow-hidden border transition-all group ${
                    disabled
                      ? 'opacity-25 cursor-not-allowed border-dalia-border grayscale'
                      : 'border-dalia-border hover:border-dalia-accent cursor-pointer'
                  }`}
                >
                  <img
                    src={champ.image_url}
                    alt={champ.name}
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent
                                  px-0.5 py-0.5 text-[8px] text-center truncate">
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
