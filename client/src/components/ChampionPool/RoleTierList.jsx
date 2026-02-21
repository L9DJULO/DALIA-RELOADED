import React, { useMemo } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import useUserStore from '../../stores/userStore';
import { TIERS } from '../../lib/constants';

const TIER_STYLES = {
  S: { bg: 'bg-red-500/10', border: 'border-red-500/25', label: 'text-red-400' },
  A: { bg: 'bg-orange-400/10', border: 'border-orange-400/25', label: 'text-orange-400' },
  B: { bg: 'bg-amber-500/10', border: 'border-amber-500/25', label: 'text-amber-400' },
  C: { bg: 'bg-blue-400/10', border: 'border-blue-400/25', label: 'text-blue-400' },
  D: { bg: 'bg-surface-elevated', border: 'border-border-subtle', label: 'text-txt-muted' },
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
    for (const c of (Array.isArray(champions) ? champions : [])) m[c.id] = c;
    return m;
  }, [champions]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-txt-secondary mb-1">Pool vide</p>
        <p className="text-[11px] text-txt-muted">{"Cliquez sur un champion a droite pour l'ajouter"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {TIERS.map((tier) => {
        const items = grouped[tier];
        if (!items || items.length === 0) return null;
        const style = TIER_STYLES[tier];

        return (
          <div key={tier} className={`rounded-xl border p-2.5 ${style.bg} ${style.border}`}>
            <div className={`text-[11px] font-bold mb-2 flex items-center gap-1.5 ${style.label}`}>
              <span className="w-5 h-5 rounded-lg flex items-center justify-center bg-current/10 text-[10px] font-bold">
                {tier}
              </span>
              <span>Tier {tier}</span>
              <span className="font-normal ml-auto tabular-nums text-txt-muted">{items.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((entry) => {
                const champ = champMap[entry.champion_id];
                if (!champ) return null;
                return (
                  <div
                    key={entry.champion_id}
                    className="group relative w-10 h-10 rounded-xl overflow-hidden border border-border-subtle hover:border-accent/40 transition-all duration-200"
                  >
                    <img
                      src={champ.image_url}
                      alt={champ.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Hover controls */}
                    <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity duration-200
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
