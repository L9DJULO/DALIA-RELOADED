import React, { useMemo } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import useUserStore, { TIERS } from '../../stores/userStore';

const TIER_BG = {
  S: 'bg-red-500/10 border-red-500/30',
  A: 'bg-orange-400/10 border-orange-400/30',
  B: 'bg-dalia-accent/10 border-dalia-accent/30',
  C: 'bg-blue-400/10 border-blue-400/30',
  D: 'bg-gray-500/10 border-gray-500/30',
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
      <div className="text-center text-dalia-muted text-sm py-8">
        <p>Aucun champion dans le pool.</p>
        <p className="mt-1 text-xs">Cliquez sur un champion à droite pour l'ajouter.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {TIERS.map((tier) => {
        const items = grouped[tier];
        if (!items || items.length === 0) return null;
        return (
          <div key={tier} className={`rounded-lg border p-2 ${TIER_BG[tier]}`}>
            <div className={`text-xs font-bold mb-1.5 tier-${tier}`}>
              Tier {tier}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((entry) => {
                const champ = champMap[entry.champion_id];
                if (!champ) return null;
                return (
                  <div
                    key={entry.champion_id}
                    className="group relative w-12 h-12 rounded-md overflow-hidden border border-dalia-border
                               hover:border-dalia-accent transition-colors"
                  >
                    <img
                      src={champ.image_url}
                      alt={champ.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Hover controls */}
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity
                                    flex flex-col items-center justify-center gap-0.5">
                      <button
                        onClick={() => {
                          const idx = TIERS.indexOf(tier);
                          if (idx > 0) changeTier(role, entry.champion_id, TIERS[idx - 1]);
                        }}
                        className="text-dalia-green hover:text-white"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => removeFromPool(role, entry.champion_id)}
                        className="text-dalia-red hover:text-white"
                      >
                        <X size={12} />
                      </button>
                      <button
                        onClick={() => {
                          const idx = TIERS.indexOf(tier);
                          if (idx < TIERS.length - 1) changeTier(role, entry.champion_id, TIERS[idx + 1]);
                        }}
                        className="text-dalia-blue hover:text-white"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                    {/* Name tooltip */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[8px] text-center
                                    truncate text-dalia-text px-0.5">
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
