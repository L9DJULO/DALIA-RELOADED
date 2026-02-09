import React from 'react';
import { Plus, Check } from 'lucide-react';

const DMG_COLORS = { AD: 'text-red-400', AP: 'text-blue-400', Mixed: 'text-purple-400' };

export default function ChampionCard({ champion, inPool, onAdd, compact = false, onClick, selected }) {
  const handleClick = (e) => {
    if (onClick) return onClick(champion);
    if (!inPool && onAdd) onAdd(e);
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        className={`relative group rounded-lg overflow-hidden border transition-all duration-150 ${
          selected
            ? 'border-dalia-accent ring-2 ring-dalia-accent/40'
            : inPool
                ? 'border-dalia-accent/50 opacity-80'
                : 'border-dalia-border hover:border-dalia-accent/50'
        }`}
      >
        <img
          src={champion.image_url}
          alt={champion.name}
          className="w-full aspect-square object-cover"
          loading="lazy"
        />
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity
                        flex items-center justify-center">
          {inPool ? (
            <Check size={18} className="text-dalia-green" />
          ) : (
            <Plus size={18} className="text-dalia-accent" />
          )}
        </div>
        {/* Name */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent
                        px-1 py-0.5 text-[9px] text-center truncate">
          {champion.name}
        </div>
        {/* Damage type dot */}
        <div className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${
          champion.primary_damage_type === 'AD' ? 'bg-red-400' :
          champion.primary_damage_type === 'AP' ? 'bg-blue-400' : 'bg-purple-400'
        }`} />
      </button>
    );
  }

  // Expanded card (used in champion selector)
  return (
    <button
      onClick={handleClick}
      className={`card flex items-center gap-3 p-2 hover:bg-dalia-surface transition-colors w-full text-left ${
        selected ? 'border-dalia-accent ring-1 ring-dalia-accent/40' : ''
      }`}
    >
      <img
        src={champion.image_url}
        alt={champion.name}
        className="w-10 h-10 rounded-md object-cover"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{champion.name}</div>
        <div className="flex items-center gap-2 text-xs text-dalia-muted">
          <span className={DMG_COLORS[champion.primary_damage_type]}>
            {champion.primary_damage_type}
          </span>
          <span>{champion.roles?.join(', ')}</span>
        </div>
      </div>
    </button>
  );
}
