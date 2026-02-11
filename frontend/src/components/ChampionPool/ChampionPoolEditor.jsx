import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Save, Check } from 'lucide-react';
import useUserStore, { ROLES, TIERS } from '../../stores/userStore';
import RoleTierList from './RoleTierList';
import ChampionCard from './ChampionCard';
import RoleIcon from '../RoleIcon';

const ROLE_LABELS = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };

const TIER_COLORS = {
  S: 'bg-red-500 hover:bg-red-400 shadow-red-500/30',
  A: 'bg-orange-500 hover:bg-orange-400 shadow-orange-500/30',
  B: 'bg-amber-500 hover:bg-amber-400 shadow-amber-500/30',
  C: 'bg-blue-500 hover:bg-blue-400 shadow-blue-500/30',
  D: 'bg-slate-500 hover:bg-slate-400 shadow-slate-500/30',
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
      className="fixed z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-3"
      style={{ left: position.x, top: position.y }}
    >
      <div className="text-xs text-slate-400 mb-2 px-1">
        Ajouter <span className="text-white font-medium">{champion.name}</span>
      </div>
      <div className="flex gap-1.5">
        {TIERS.map((tier) => (
          <button
            key={tier}
            onClick={() => onSelect(tier)}
            className={`w-9 h-9 rounded-lg text-sm font-bold text-white transition-all shadow-lg ${TIER_COLORS[tier]}`}
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
  const [tierPicker, setTierPicker] = useState(null);
  const [saved, setSaved] = useState(false);
  const { championPool, addToPool, savePool } = useUserStore();

  const poolIdsForRole = useMemo(() => {
    const ids = new Set();
    for (const e of (championPool[activeRole] || [])) ids.add(e.champion_id);
    return ids;
  }, [championPool, activeRole]);

  const filteredChampions = useMemo(() => {
    let list = champions;
    if (filterByRole) {
      list = list.filter((c) => c.roles.includes(activeRole));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const aIn = poolIdsForRole.has(a.id) ? 0 : 1;
      const bIn = poolIdsForRole.has(b.id) ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [champions, activeRole, search, poolIdsForRole, filterByRole]);

  const handleChampClick = (champion, e) => {
    if (poolIdsForRole.has(champion.id)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTierPicker({
      champion,
      x: Math.min(rect.left, window.innerWidth - 240),
      y: rect.bottom + 8,
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
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* ── Left: Tier list per role ── */}
      <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/50">
        {/* Role tabs */}
        <div className="flex border-b border-slate-800">
          {ROLES.map((role) => (
            <button
              key={role}
              onClick={() => { setActiveRole(role); setTierPicker(null); }}
              className={`flex-1 py-3 text-xs font-medium transition-all ${
                activeRole === role
                  ? 'bg-slate-800 text-white border-b-2 border-amber-500'
                  : 'text-slate-500 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <RoleIcon role={role} size={18} className="text-slate-400 group-hover:text-white mx-auto mb-1" />
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        {/* Tier list */}
        <div className="flex-1 overflow-y-auto p-4">
          <RoleTierList role={activeRole} champions={champions} />
        </div>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={handleSave} 
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              saved 
                ? 'bg-emerald-500 text-white' 
                : 'bg-amber-500 hover:bg-amber-400 text-white shadow-lg shadow-amber-500/25'
            }`}
          >
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saved ? 'Sauvegardé !' : `Sauvegarder ${ROLE_LABELS[activeRole]}`}
          </button>
        </div>
      </div>

      {/* ── Right: Champion browser ── */}
      <div className="flex-1 flex flex-col bg-slate-950">
        <div className="p-4 border-b border-slate-800 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un champion..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm
                         text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <button
            onClick={() => setFilterByRole(!filterByRole)}
            className={`text-xs px-3 py-2 rounded-lg border font-medium transition-all ${
              filterByRole
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
            }`}
          >
            {filterByRole ? `${ROLE_LABELS[activeRole]} uniquement` : 'Tous les champions'}
          </button>

          <div className="text-xs text-slate-500">
            <span className="text-slate-300 font-medium">{filteredChampions.length}</span> champions 
            <span className="mx-1.5">•</span>
            <span className="text-amber-400 font-medium">{(championPool[activeRole] || []).length}</span> dans le pool
          </div>
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
