import React from 'react';
import { X, User } from 'lucide-react';

const ROLE_ICONS = { top: '⚔️', jungle: '🌿', mid: '🔮', bot: '🏹', support: '🛡️' };
const ROLE_LABELS = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };
const TEAM_BORDER = { blue: 'border-dalia-blue/40', red: 'border-dalia-red/40' };

export default function DraftSlot({ role, champion, isMySlot, team, onClick, onClear, champions }) {
  const champData = champion ? champions?.find((c) => c.id === champion.id) : null;

  return (
    <div
      onClick={!champion ? onClick : undefined}
      className={`relative flex items-center gap-2.5 rounded-lg border p-2 transition-all duration-200 cursor-pointer group
        ${champion ? 'bg-dalia-card/60 backdrop-blur-sm' : 'bg-white/[0.02] hover:bg-white/[0.04]'}
        ${isMySlot ? 'ring-1 ring-dalia-accent/40 border-dalia-accent/30 glow-accent' : TEAM_BORDER[team] || 'border-white/[0.06]'}
        ${!champion ? 'hover:border-dalia-accent/20' : ''}
      `}
    >
      {/* Champion image or empty */}
      {champion && champData ? (
        <img
          src={champData.image_url}
          alt={champData.name}
          className="w-10 h-10 rounded-md object-cover"
        />
      ) : (
        <div className="w-10 h-10 rounded-md bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-dalia-muted/40">
          <User size={16} />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-dalia-muted flex items-center gap-1">
          <span>{ROLE_ICONS[role]}</span>
          <span>{ROLE_LABELS[role]}</span>
          {isMySlot && <span className="tag tag-gold ml-1">MOI</span>}
        </div>
        <div className="text-sm font-medium truncate">
          {champion ? champion.name : <span className="text-dalia-muted italic">Choisir…</span>}
        </div>
      </div>

      {/* Damage type indicator */}
      {champData && (
        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
          champData.primary_damage_type === 'AD' ? 'bg-red-500/20 text-red-400' :
          champData.primary_damage_type === 'AP' ? 'bg-blue-500/20 text-blue-400' :
          'bg-purple-500/20 text-purple-400'
        }`}>
          {champData.primary_damage_type}
        </div>
      )}

      {/* Clear button */}
      {champion && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-dalia-red flex items-center justify-center
                     opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
          style={{ opacity: 1 }}
        >
          <X size={10} className="text-white" />
        </button>
      )}
    </div>
  );
}
