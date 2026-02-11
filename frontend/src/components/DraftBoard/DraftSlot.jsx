import React from 'react';
import { X, User } from 'lucide-react';
import RoleIcon from '../RoleIcon';

const ROLE_LABELS = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };

export default function DraftSlot({ role, champion, isMySlot, team, onClick, onClear, champions }) {
  const champData = champion ? champions?.find((c) => c.id === champion.id) : null;

  return (
    <div
      onClick={!champion ? onClick : undefined}
      className={`relative flex items-center gap-3 rounded-xl border p-2.5 transition-all duration-200 cursor-pointer group
        ${champion ? 'bg-slate-800/80' : 'bg-slate-800/30 hover:bg-slate-800/50'}
        ${isMySlot 
          ? 'ring-2 ring-amber-500/50 border-amber-500/30' 
          : team === 'blue' 
            ? 'border-blue-500/20 hover:border-blue-500/40' 
            : 'border-red-500/20 hover:border-red-500/40'}
        ${!champion ? 'hover:border-slate-600' : ''}
      `}
    >
      {/* Champion image or empty */}
      {champion && champData ? (
        <img
          src={champData.image_url}
          alt={champData.name}
          className="w-11 h-11 rounded-lg object-cover border border-slate-700"
        />
      ) : (
        <div className="w-11 h-11 rounded-lg bg-slate-700/50 border border-slate-600/50 flex items-center justify-center text-slate-500">
          <User size={18} />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-0.5">
          <RoleIcon role={role} size={14} className="text-slate-500" />
          <span>{ROLE_LABELS[role]}</span>
          {isMySlot && (
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-400 font-medium ml-1">
              MOI
            </span>
          )}
        </div>
        <div className="text-sm font-medium text-white truncate">
          {champion ? champion.name : <span className="text-slate-500 font-normal">Choisir...</span>}
        </div>
      </div>

      {/* Clear button */}
      {champion && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center
                     opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:border-red-500 transition-all"
        >
          <X size={10} className="text-white" />
        </button>
      )}
    </div>
  );
}
