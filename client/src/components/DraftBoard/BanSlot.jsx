import React from 'react';
import { X, Ban } from 'lucide-react';

export default function BanSlot({ champion, onClick, onClear }) {
  return (
    <button
      onClick={champion ? undefined : onClick}
      aria-label={champion ? `Ban: ${champion.name}` : 'Sélectionner un ban'}
      className={`relative w-10 h-10 rounded-xl border transition-colors duration-150 group overflow-hidden ${
        champion
          ? 'border-red-500/25'
          : 'hover:border-violet-500/40'
      }`}
      style={{ background: 'var(--surface-elevated)', borderColor: champion ? undefined : 'var(--border-subtle)' }}
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
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center
                       opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:border-red-500 cursor-pointer transition-opacity duration-150"
            style={{ background: 'var(--surface-overlay)', borderColor: 'var(--border-default)' }}
          >
            <X size={8} className="text-white" />
          </div>
        </>
      ) : (
        <Ban size={14} className="mx-auto" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
      )}
    </button>
  );
}
