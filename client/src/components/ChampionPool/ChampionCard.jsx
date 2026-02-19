import { Plus, Check, ArrowUpDown } from 'lucide-react';

export default function ChampionCard({ champion, inPool, onAdd, compact = false, onClick, selected }) {
  const handleClick = (e) => {
    if (onClick) return onClick(champion);
    if (onAdd) onAdd(e);
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        aria-label={`${champion.name}${inPool ? ' (dans le pool)' : ''}`}
        className={`relative group rounded-lg overflow-hidden border-2 transition-colors duration-150 ${
          selected
            ? 'border-amber-500 ring-1 ring-amber-500/30'
            : inPool
                ? 'border-emerald-500/40'
                : 'border-slate-700 hover:border-slate-500'
        }`}
      >
        <img
          src={champion.image_url}
          alt={champion.name}
          className="w-full aspect-square object-cover"
          loading="lazy"
        />
        {/* Overlay on hover */}
        <div className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity duration-150 ${
          inPool ? 'opacity-50 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          {inPool ? (
            <ArrowUpDown size={16} className="text-amber-400" aria-hidden="true" />
          ) : (
            <Plus size={18} className="text-white" aria-hidden="true" />
          )}
        </div>
        {/* In-pool indicator */}
        {inPool && (
          <div className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check size={8} className="text-white" aria-hidden="true" />
          </div>
        )}
        {/* Name */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent
                        px-1 py-0.5 text-[9px] text-center truncate text-white font-medium">
          {champion.name}
        </div>
      </button>
    );
  }

  // Expanded card
  return (
    <button
      onClick={handleClick}
      aria-label={champion.name}
      className={`rounded-lg border flex items-center gap-2.5 p-2 bg-surface-elevated/50 hover:bg-surface-elevated transition-colors duration-150 w-full text-left ${
        selected ? 'border-amber-500 ring-1 ring-amber-500/30' : 'border-slate-700 hover:border-slate-600'
      }`}
    >
      <img
        src={champion.image_url}
        alt={champion.name}
        className="w-10 h-10 rounded-lg object-cover border border-slate-700"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-100 truncate">{champion.name}</div>
        <div className="text-[11px] text-slate-400">
          {champion.roles?.join(', ')}
        </div>
      </div>
    </button>
  );
}
