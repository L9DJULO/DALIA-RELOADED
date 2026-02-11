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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[640px] max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <div className="text-base font-semibold text-white">{titleText}</div>
            <div className="text-xs text-slate-500">Sélectionner un champion</div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search + filters */}
        <div className="p-4 space-y-3 border-b border-slate-800">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm
                         text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div className="flex gap-1.5">
            {ROLE_FILTER.map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  roleFilter === r
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Champion grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-8 gap-2">
            {filtered.map((champ) => {
              const disabled = unavailableIds.has(champ.id);
              return (
                <button
                  key={champ.id}
                  disabled={disabled}
                  onClick={() => onSelect(champ)}
                  className={`relative rounded-xl overflow-hidden border transition-all group ${
                    disabled
                      ? 'opacity-30 cursor-not-allowed border-slate-800 grayscale'
                      : 'border-slate-700 hover:border-amber-500 hover:scale-105 cursor-pointer'
                  }`}
                >
                  <img
                    src={champ.image_url}
                    alt={champ.name}
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent
                                  px-1 py-1 text-[9px] text-center truncate text-white font-medium">
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
