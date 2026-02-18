import React, { useMemo } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import useUserStore, { TIERS } from '../../stores/userStore';

const TIER_STYLES = {
  S: { bg: 'bg-red-500/10', border: 'border-red-500/25', label: 'text-red-400' },
  A: { bg: 'bg-orange-400/10', border: 'border-orange-400/25', label: 'text-orange-400' },
  B: { bg: 'bg-amber-500/10', border: 'border-amber-500/25', label: 'text-amber-400' },
  C: { bg: 'bg-blue-400/10', border: 'border-blue-400/25', label: 'text-blue-400' },
  D: { bg: 'bg-slate-500/10', border: 'border-slate-500/25', label: 'text-slate-400' },
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
      <div className="text-center py-8">
        <p className="text-slate-400 text-sm mb-1">Pool vide</p>
        <p className="text-slate-500 text-[11px]">Cliquez sur un champion à droite pour l'ajouter</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {TIERS.map((tier) => {
        const items = grouped[tier];
        if (!items || items.length === 0) return null;
        const style = TIER_STYLES[tier];

        return (
          <div key={tier} className={`rounded-lg border p-2.5 ${style.bg} ${style.border}`}>
            <div className={`text-[11px] font-bold mb-2 flex items-center gap-1.5 ${style.label}`}>
              <span className="w-4 h-4 rounded flex items-center justify-center bg-current/10 text-[9px]">
                {tier}
              </span>
              <span>Tier {tier}</span>
              <span className="text-slate-600 font-normal ml-auto tabular-nums">{items.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((entry) => {
                const champ = champMap[entry.champion_id];
                if (!champ) return null;
                return (
                  <div
                    key={entry.champion_id}
                    className="group relative w-10 h-10 rounded-lg overflow-hidden border border-slate-700/50
                               hover:border-slate-500 transition-colors duration-150"
                  >
                    <img
                      src={champ.image_url}
                      alt={champ.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Hover controls */}
                    <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity duration-150
                                    flex flex-col items-center justify-center gap-px">
                      <button
                        onClick={() => {
                          const idx = TIERS.indexOf(tier);
                          if (idx > 0) changeTier(role, entry.champion_id, TIERS[idx - 1]);
                        }}
                        aria-label={`Monter ${champ.name}`}
                        className="text-emerald-400 hover:text-emerald-300 p-px"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => removeFromPool(role, entry.champion_id)}
                        aria-label={`Supprimer ${champ.name}`}
                        className="text-red-400 hover:text-red-300 p-px"
                      >
                        <X size={12} />
                      </button>
                      <button
                        onClick={() => {
                          const idx = TIERS.indexOf(tier);
                          if (idx < TIERS.length - 1) changeTier(role, entry.champion_id, TIERS[idx + 1]);
                        }}
                        aria-label={`Descendre ${champ.name}`}
                        className="text-blue-400 hover:text-blue-300 p-px"
                      >
                        <ChevronDown size={12} />
                      </button>
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
