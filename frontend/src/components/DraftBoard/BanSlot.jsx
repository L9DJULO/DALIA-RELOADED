import React from 'react';
import { X, Ban } from 'lucide-react';

export default function BanSlot({ champion, onClick, onClear }) {
  return (
    <button
      onClick={champion ? undefined : onClick}
      className={`relative w-11 h-11 rounded-lg border transition-all duration-200 group overflow-hidden ${
        champion
          ? 'border-red-500/30 bg-slate-800'
          : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600'
      }`}
    >
      {champion ? (
        <>
          <img
            src={`https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/${champion.key}.png`}
            alt={champion.name}
            className="w-full h-full object-cover opacity-40 grayscale"
          />
          {/* Red X overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/10">
            <X size={22} className="text-red-500" strokeWidth={3} />
          </div>
          {/* Name tooltip */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] text-slate-400
                          whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 px-1.5 py-0.5 rounded">
            {champion.name}
          </div>
          {/* Clear on hover */}
          <div
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center
                       opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:border-red-500 cursor-pointer transition-all"
          >
            <X size={8} className="text-white" />
          </div>
        </>
      ) : (
        <Ban size={16} className="text-slate-600 mx-auto" />
      )}
    </button>
  );
}
