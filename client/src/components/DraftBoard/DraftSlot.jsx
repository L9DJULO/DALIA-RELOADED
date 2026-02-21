import React from 'react';
import { X, User } from 'lucide-react';
import RoleIcon from '../RoleIcon';

const ROLE_LABELS = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };

export default function DraftSlot({ role, label, champion, isMySlot, team, onClick, onClear, champions }) {
  const champData = champion ? champions?.find((c) => c.id === champion.id) : null;
  const displayLabel = label ?? (role ? ROLE_LABELS[role] : '?');
  const ariaLabel = champion
    ? `${displayLabel}: ${champion.name}`
    : `Choisir ${displayLabel}`;

  const teamAccent = team === 'blue' ? 'blue' : 'red';
  const teamBorderColor = team === 'blue' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(239, 68, 68, 0.12)';

  return (
    <div
      onClick={!champion ? onClick : undefined}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={(e) => { if (e.key === 'Enter' && !champion) onClick?.(); }}
      className={`relative flex items-center gap-3 rounded-xl p-2.5 transition-all duration-200 cursor-pointer group
        ${champion ? 'bg-surface-elevated' : 'hover:bg-surface-elevated/50'}
        ${isMySlot ? 'ring-1 ring-accent/30' : ''}
      `}
      style={{
        border: isMySlot
          ? '1px solid var(--border-accent)'
          : `1px solid ${teamBorderColor}`,
      }}
    >
      {/* Champion portrait or placeholder */}
      {champion && champData ? (
        <div className="relative">
          <img
            src={champData.image_url}
            alt={champData.name}
            className="w-11 h-11 rounded-xl object-cover border border-border-subtle"
          />
          {/* Team color indicator */}
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-elevated ${
              teamAccent === 'blue' ? 'bg-blue-500' : 'bg-red-500'
            }`}
          />
        </div>
      ) : (
        <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-surface-elevated border border-border-subtle">
          <User size={16} className="text-txt-muted" aria-hidden="true" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] flex items-center gap-1.5 mb-0.5">
          {role ? (
            <>
              <RoleIcon role={role} size={13} className="text-txt-muted" />
              <span className="text-txt-secondary">{ROLE_LABELS[role]}</span>
            </>
          ) : (
            <span className="text-txt-muted">{displayLabel}</span>
          )}
          {isMySlot && (
            <span className="px-1.5 py-px rounded-md text-[9px] font-bold text-white bg-accent ml-1">
              MOI
            </span>
          )}
        </div>
        <div className={`text-sm font-medium truncate ${champion ? 'text-txt-primary' : 'text-txt-muted'}`}>
          {champion ? champion.name : 'Choisir...'}
        </div>
      </div>

      {/* Remove button */}
      {champion && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          aria-label={`Retirer ${champion.name}`}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center
                     opacity-0 group-hover:opacity-100 bg-surface-elevated border border-border
                     hover:bg-red-500 hover:border-red-500 transition-all duration-200 z-10"
        >
          <X size={10} className="text-white" />
        </button>
      )}
    </div>
  );
}
