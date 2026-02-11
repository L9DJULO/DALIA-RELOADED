import React, { useMemo } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import useUserStore, { TIERS } from '../../stores/userStore';

const TIER_STYLES = {
  S: { bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'text-red-400' },
  A: { bg: 'bg-orange-400/10', border: 'border-orange-400/30', label: 'text-orange-400' },
  B: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'text-amber-400' },
  C: { bg: 'bg-blue-400/10', border: 'border-blue-400/30', label: 'text-blue-400' },
  D: { bg: 'bg-slate-500/10', border: 'border-slate-500/30', label: 'text-slate-400' },
};

export default function RoleTierList({ role, champions }) {
  const { championPool, removeFromPool, changeTier } = useUserStore();
  const entries = championPool[role] || [];

  const grouped = useMemo(() => {
    const map = {};
    for (const t of TIERS) map[t] = [];
    for (const entry of entries) {
      const tier = entry.tier || 'B';
      if (!map[tier]) map[tier] = [];
      map[tier].push(entry);
    }
    return map;
  }, [entries]);

  const champMap = useMemo(() => {
    const m = {};
    for (const c of champions) m[c.id] = c;
    return m;
  }, [champions]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="text-4xl mb-3">🎮</div>
        <p className="text-slate-400 text-sm mb-1">Aucun champion dans le pool</p>
        <p className="text-slate-500 text-xs">Cliquez sur un champion à droite pour l'ajouter</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {TIERS.map((tier) => {
        const items = grouped[tier];
        if (!items || items.length === 0) return null;
        const style = TIER_STYLES[tier];
        
        return (
          <div key={tier} className={`rounded-xl border p-3 ${style.bg} ${style.border}`}>
            <div className={`text-xs font-bold mb-2 flex items-center gap-2 ${style.label}`}>
              <span className="w-5 h-5 rounded flex items-center justify-center bg-current/20 text-[10px]">
                {tier}
              </span>
              <span>Tier {tier}</span>
              <span className="text-slate-500 font-normal ml-auto">{items.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {items.map((entry) => {
                const champ = champMap[entry.champion_id];
                if (!champ) return null;
                return (
                  <div
                    key={entry.champion_id}
                    className="group relative w-12 h-12 rounded-lg overflow-hidden border border-slate-700
                               hover:border-slate-500 transition-all"
                  >
                    <img
                      src={champ.image_url}
                      alt={champ.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Hover controls */}
                    <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity
                                    flex flex-col items-center justify-center gap-0.5">
                      <button
                        onClick={() => {
                          const idx = TIERS.indexOf(tier);
                          if (idx > 0) changeTier(role, entry.champion_id, TIERS[idx - 1]);
                        }}
                        className="text-emerald-400 hover:text-emerald-300 p-0.5"
                        title="Monter"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => removeFromPool(role, entry.champion_id)}
                        className="text-red-400 hover:text-red-300 p-0.5"
                        title="Supprimer"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => {
                          const idx = TIERS.indexOf(tier);
                          if (idx < TIERS.length - 1) changeTier(role, entry.champion_id, TIERS[idx + 1]);
                        }}
                        className="text-blue-400 hover:text-blue-300 p-0.5"
                        title="Descendre"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    {/* Name tooltip */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[8px] text-center
                                    truncate text-white px-0.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {champ.name}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
