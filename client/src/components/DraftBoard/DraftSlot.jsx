import React from 'react';
import { X, User } from 'lucide-react';
import RoleIcon from '../RoleIcon';

const ROLE_LABELS = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };

/**
 * DraftSlot
 *
 * Props:
 *   role       — known role string (ally side). null/undefined for enemy ordered slots.
 *   label      — override label shown in slot (e.g. "Pick 1" for enemy slots)
 *   champion   — { id, key, name } or null
 *   isMySlot   — highlights slot with amber ring
 *   team       — "blue" | "red"
 *   onClick    — opens selector
 *   onClear    — removes champion
 *   champions  — full champion list for image lookup
 */
export default function DraftSlot({ role, label, champion, isMySlot, team, onClick, onClear, champions }) {
  const champData = champion ? champions?.find((c) => c.id === champion.id) : null;

  // Display label: explicit label > role label > "?"
  const displayLabel = label ?? (role ? ROLE_LABELS[role] : '?');
  const ariaLabel = champion
    ? `${displayLabel}: ${champion.name}`
    : `Choisir ${displayLabel}`;

  return (
    <div
      onClick={!champion ? onClick : undefined}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={(e) => { if (e.key === 'Enter' && !champion) onClick?.(); }}
      className={`relative flex items-center gap-2.5 rounded-lg border p-2 transition-colors duration-150 cursor-pointer group
        ${champion ? 'bg-surface-elevated/60' : 'bg-surface-elevated/20 hover:bg-surface-elevated/40'}
        ${isMySlot
          ? 'ring-1 ring-amber-500/40 border-amber-500/30'
          : team === 'blue'
            ? 'border-blue-500/15 hover:border-blue-500/30'
            : 'border-red-500/15 hover:border-red-500/30'}
        ${!champion ? 'hover:border-slate-600' : ''}
      `}
    >
      {/* Champion image or empty */}
      {champion && champData ? (
        <img
          src={champData.image_url}
          alt={champData.name}
          className="w-10 h-10 rounded-lg object-cover border border-slate-700"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-slate-700/30 border border-slate-600/30 flex items-center justify-center text-slate-500">
          <User size={16} aria-hidden="true" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-0.5">
          {role ? (
            <>
              <RoleIcon role={role} size={13} className="text-slate-500" />
              <span>{ROLE_LABELS[role]}</span>
            </>
          ) : (
            <span className="text-slate-500">{displayLabel}</span>
          )}
          {isMySlot && (
            <span className="px-1 py-px rounded text-[9px] bg-amber-500/15 text-amber-400 font-medium ml-1">
              MOI
            </span>
          )}
        </div>
        <div className="text-sm font-medium text-slate-100 truncate">
          {champion ? champion.name : <span className="text-slate-500 font-normal">Choisir…</span>}
        </div>
      </div>

      {/* Clear button */}
      {champion && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          aria-label={`Retirer ${champion.name}`}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center
                     opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:border-red-500 transition-opacity duration-150"
        >
          <X size={10} className="text-white" />
        </button>
      )}
    </div>
  );
}
