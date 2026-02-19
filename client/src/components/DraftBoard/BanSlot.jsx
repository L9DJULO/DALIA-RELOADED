import React from 'react';
import { X, Ban } from 'lucide-react';

export default function BanSlot({ champion, onClick, onClear }) {
  return (
    <button
      onClick={champion ? undefined : onClick}
      aria-label={champion ? `Ban: ${champion.name}` : 'Sélectionner un ban'}
      className={`relative w-10 h-10 rounded-lg border transition-colors duration-150 group overflow-hidden ${
        champion
          ? 'border-red-500/25 bg-surface-elevated'
          : 'border-slate-700 bg-surface-elevated/50 hover:bg-surface-elevated hover:border-slate-600'
      }`}
    >
      {champion ? (
        <>
          <img
            src={`https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/${champion.key}.png`}
            alt={champion.name}
            className="w-full h-full object-cover opacity-40 grayscale"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/10">
            <X size={20} className="text-red-500" strokeWidth={3} />
          </div>
          <div
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            role="button"
            aria-label={`Retirer le ban ${champion.name}`}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center
                       opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:border-red-500 cursor-pointer transition-opacity duration-150"
          >
            <X size={8} className="text-white" />
          </div>
        </>
      ) : (
        <Ban size={14} className="text-slate-600 mx-auto" aria-hidden="true" />
      )}
    </button>
  );
}
