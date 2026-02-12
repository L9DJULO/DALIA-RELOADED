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
        className={`relative group rounded-xl overflow-hidden border-2 transition-all duration-200 ${
          selected
            ? 'border-amber-500 ring-2 ring-amber-500/30'
            : inPool
                ? 'border-emerald-500/50 opacity-90'
                : 'border-slate-700 hover:border-slate-500 hover:scale-105'
        }`}
      >
        <img
          src={champion.image_url}
          alt={champion.name}
          className="w-full aspect-square object-cover"
          loading="lazy"
        />
        {/* Overlay on hover */}
        <div className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${
          inPool ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          {inPool ? (
            <ArrowUpDown size={18} className="text-amber-400" />
          ) : (
            <Plus size={20} className="text-white" />
          )}
        </div>
        {/* In-pool indicator */}
        {inPool && (
          <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check size={9} className="text-white" />
          </div>
        )}
        {/* Name */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent
                        px-1 py-1 text-[10px] text-center truncate text-white font-medium">
          {champion.name}
        </div>
      </button>
    );
  }

  // Expanded card (used in champion selector)
  return (
    <button
      onClick={handleClick}
      className={`rounded-xl border flex items-center gap-3 p-2.5 bg-slate-800/50 hover:bg-slate-800 transition-all w-full text-left ${
        selected ? 'border-amber-500 ring-1 ring-amber-500/30' : 'border-slate-700 hover:border-slate-600'
      }`}
    >
      <img
        src={champion.image_url}
        alt={champion.name}
        className="w-11 h-11 rounded-lg object-cover border border-slate-700"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{champion.name}</div>
        <div className="text-xs text-slate-400">
          {champion.roles?.join(', ')}
        </div>
      </div>
    </button>
  );
}
