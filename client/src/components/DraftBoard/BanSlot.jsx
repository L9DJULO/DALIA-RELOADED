import React from 'react';
import { X, Ban } from 'lucide-react';
import { getDDragonChampUrl } from '../../lib/constants';

export default function BanSlot({ champion, onClick, onClear }) {
  return (
    <button
      onClick={champion ? undefined : onClick}
      aria-label={champion ? `Ban: ${champion.name}` : 'Selectionner un ban'}
      className={`relative w-11 h-11 rounded-xl border transition-all duration-200 group overflow-hidden ${
        champion
          ? 'border-red-500/20 bg-surface-elevated'
          : 'border-border-subtle hover:border-accent/40 bg-surface-elevated/50'
      }`}
    >
      {champion ? (
        <>
          <img
            src={getDDragonChampUrl(champion.key)}
            alt={champion.name}
            className="w-full h-full object-cover opacity-30 grayscale"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/8">
            <X size={18} className="text-red-500/80" strokeWidth={3} />
          </div>
          <div
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onClear(); } }}
            role="button"
            tabIndex={0}
            aria-label={`Retirer le ban ${champion.name}`}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center
                       opacity-0 group-hover:opacity-100 bg-surface-overlay border border-border
                       hover:bg-red-500 hover:border-red-500 cursor-pointer transition-all duration-150"
          >
            <X size={8} className="text-white" />
          </div>
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Ban size={13} className="text-txt-muted" aria-hidden="true" />
        </div>
      )}
    </button>
  );
}
