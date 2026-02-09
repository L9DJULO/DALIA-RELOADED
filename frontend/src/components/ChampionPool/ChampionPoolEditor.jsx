import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Plus, X } from 'lucide-react';
import useUserStore, { ROLES, TIERS } from '../../stores/userStore';
import RoleTierList from './RoleTierList';
import ChampionCard from './ChampionCard';

const ROLE_LABELS = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };
const ROLE_ICONS = { top: '⚔️', jungle: '🌿', mid: '🔮', bot: '🏹', support: '🛡️' };

const TIER_COLORS = {
  S: 'bg-red-500 hover:bg-red-600',
  A: 'bg-orange-500 hover:bg-orange-600',
  B: 'bg-dalia-accent hover:bg-dalia-accent/80',
  C: 'bg-blue-500 hover:bg-blue-600',
  D: 'bg-gray-500 hover:bg-gray-600',
};

/* ── Tier picker popover ── */
function TierPicker({ champion, position, onSelect, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-dalia-card border border-dalia-border rounded-lg shadow-xl p-2"
      style={{ left: position.x, top: position.y }}
    >
      <div className="text-xs text-dalia-muted mb-1.5 px-1 truncate max-w-[140px]">
        {champion.name}
      </div>
      <div className="flex gap-1">
        {TIERS.map((tier) => (
          <button
            key={tier}
            onClick={() => onSelect(tier)}
            className={`w-8 h-8 rounded-md text-xs font-bold text-white transition-colors ${TIER_COLORS[tier]}`}
          >
            {tier}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChampionPoolEditor({ champions }) {
  const [activeRole, setActiveRole] = useState('mid');
  const [search, setSearch] = useState('');
  const [filterByRole, setFilterByRole] = useState(false);
  const [tierPicker, setTierPicker] = useState(null); // { champion, x, y }
  const { championPool, addToPool, savePool } = useUserStore();

  const poolIdsForRole = useMemo(() => {
    const ids = new Set();
    for (const e of (championPool[activeRole] || [])) ids.add(e.champion_id);
    return ids;
  }, [championPool, activeRole]);

  const filteredChampions = useMemo(() => {
    let list = champions;
    // Optional role filter
    if (filterByRole) {
      list = list.filter((c) => c.roles.includes(activeRole));
    }
    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    // Sort: pool members first, then alphabetical
    list.sort((a, b) => {
      const aIn = poolIdsForRole.has(a.id) ? 0 : 1;
      const bIn = poolIdsForRole.has(b.id) ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [champions, activeRole, search, poolIdsForRole, filterByRole]);

  const handleChampClick = (champion, e) => {
    if (poolIdsForRole.has(champion.id)) return; // already in pool for this role
    const rect = e.currentTarget.getBoundingClientRect();
    setTierPicker({
      champion,
      x: Math.min(rect.left, window.innerWidth - 220),
      y: rect.bottom + 4,
    });
  };

  const handleTierSelect = (tier) => {
    if (tierPicker) {
      addToPool(activeRole, tierPicker.champion, tier);
      setTierPicker(null);
    }
  };

  const handleSave = async () => {
    await savePool(activeRole);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* ── Left: Tier list per role ── */}
      <div className="w-80 border-r border-dalia-border flex flex-col bg-dalia-surface">
        {/* Role tabs */}
        <div className="flex border-b border-dalia-border">
          {ROLES.map((role) => (
            <button
              key={role}
              onClick={() => { setActiveRole(role); setTierPicker(null); }}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                activeRole === role
                  ? 'bg-dalia-accent/15 text-dalia-accent border-b-2 border-dalia-accent'
                  : 'text-dalia-muted hover:text-dalia-text'
              }`}
            >
              <span className="block text-base">{ROLE_ICONS[role]}</span>
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        {/* Tier list */}
        <div className="flex-1 overflow-y-auto p-3">
          <RoleTierList role={activeRole} champions={champions} />
        </div>

        <div className="p-3 border-t border-dalia-border">
          <button onClick={handleSave} className="btn-primary w-full text-xs">
            Sauvegarder {ROLE_LABELS[activeRole]}
          </button>
        </div>
      </div>

      {/* ── Right: Champion browser ── */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-dalia-border flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dalia-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un champion…"
              className="w-full bg-dalia-card border border-dalia-border rounded-lg pl-9 pr-3 py-2 text-sm
                         text-dalia-text placeholder-dalia-muted focus:outline-none focus:border-dalia-accent"
            />
          </div>

          {/* Toggle: filter by role */}
          <button
            onClick={() => setFilterByRole(!filterByRole)}
            className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
              filterByRole
                ? 'border-dalia-accent bg-dalia-accent/15 text-dalia-accent'
                : 'border-dalia-border text-dalia-muted hover:text-dalia-text'
            }`}
          >
            {filterByRole ? `${ROLE_LABELS[activeRole]} uniquement` : 'Tous les champions'}
          </button>

          <span className="text-xs text-dalia-muted">
            {filteredChampions.length} champions • {(championPool[activeRole] || []).length} dans le pool
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-6 2xl:grid-cols-8 gap-2">
            {filteredChampions.map((champ) => {
              const inPool = poolIdsForRole.has(champ.id);
              return (
                <ChampionCard
                  key={champ.id}
                  champion={champ}
                  inPool={inPool}
                  onAdd={(e) => handleChampClick(champ, e)}
                  compact
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Tier picker popover */}
      {tierPicker && (
        <TierPicker
          champion={tierPicker.champion}
          position={{ x: tierPicker.x, y: tierPicker.y }}
          onSelect={handleTierSelect}
          onClose={() => setTierPicker(null)}
        />
      )}
    </div>
  );
}
