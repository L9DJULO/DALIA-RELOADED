import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import RoleIcon from '../RoleIcon';
import { ROLES, ROLE_LABELS } from '../../lib/constants';

export default function ChampionSelector({ champions, unavailableIds, onSelect, onClose, target }) {
  // Default to the target role if available, otherwise 'all'
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState(target?.role || 'all');
  const panelRef = useRef(null);

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
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Selection de champion"
    >
      <div
        ref={panelRef}
        className="glass-panel w-[640px] max-h-[80vh] flex flex-col animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <div>
            <div className="text-sm font-semibold text-txt-primary">{titleText}</div>
            <div className="text-[11px] text-txt-muted">Selectionner un champion</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-txt-secondary hover:text-txt-primary hover:bg-surface-elevated transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search + filters */}
        <div className="p-4 space-y-3 border-b border-border-subtle">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-muted" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              aria-label="Rechercher un champion"
              className="input-field w-full pl-10 pr-3 py-2.5 text-sm"
            />
          </div>
          <div className="flex gap-1.5">
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(roleFilter === r ? 'all' : r)}
                aria-pressed={roleFilter === r}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border ${
                  roleFilter === r
                    ? 'bg-accent-muted text-accent border-accent/25'
                    : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-elevated border-transparent'
                }`}
              >
                <RoleIcon role={r} size={13} />
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
                  aria-label={`${champ.name}${disabled ? ' (indisponible)' : ''}`}
                  className={`relative rounded-xl overflow-hidden border transition-all duration-200 ${
                    disabled
                      ? 'opacity-20 cursor-not-allowed grayscale border-border-subtle'
                      : 'border-border-subtle hover:border-accent hover:scale-105 hover:shadow-glow cursor-pointer'
                  }`}
                >
                  <img
                    src={champ.image_url}
                    alt={champ.name}
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent
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
