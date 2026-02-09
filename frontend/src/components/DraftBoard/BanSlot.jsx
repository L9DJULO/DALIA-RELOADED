import React from 'react';
import { X, Ban } from 'lucide-react';

export default function BanSlot({ champion, onClick, onClear }) {
  return (
    <button
      onClick={champion ? undefined : onClick}
      className={`relative w-10 h-10 rounded-md border transition-all duration-200 group ${
        champion
          ? 'border-dalia-red/30 bg-dalia-card/60'
          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-dalia-red/30'
      }`}
    >
      {champion ? (
        <>
          <img
            src={`https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/${champion.key}.png`}
            alt={champion.name}
            className="w-full h-full object-cover rounded-md opacity-40 grayscale"
          />
          {/* Red X overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <X size={20} className="text-dalia-red" strokeWidth={3} />
          </div>
          {/* Name tooltip */}
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] text-dalia-muted
                          whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
            {champion.name}
          </div>
          {/* Clear on hover */}
          <div
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-dalia-red flex items-center justify-center
                       opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
          >
            <X size={8} className="text-white" />
          </div>
        </>
      ) : (
        <Ban size={14} className="text-dalia-muted mx-auto" />
      )}
    </button>
  );
}
