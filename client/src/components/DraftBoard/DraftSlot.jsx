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

  return (
    <div
      onClick={!champion ? onClick : undefined}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={(e) => { if (e.key === 'Enter' && !champion) onClick?.(); }}
      className={`relative flex items-center gap-2.5 rounded-xl p-2 transition-all duration-200 cursor-pointer group
        ${isMySlot ? 'ring-1 ring-violet-500/30' : ''}
      `}
      style={{
        background: champion ? 'var(--surface-elevated)' : 'transparent',
        border: isMySlot
          ? '1px solid rgba(139, 92, 246, 0.3)'
          : team === 'blue'
            ? '1px solid rgba(59, 130, 246, 0.15)'
            : '1px solid rgba(239, 68, 68, 0.15)',
      }}
    >
      {champion && champData ? (
        <img
          src={champData.image_url}
          alt={champData.name}
          className="w-10 h-10 rounded-xl object-cover"
          style={{ border: '1px solid var(--border-subtle)' }}
        />
      ) : (
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
          <User size={16} aria-hidden="true" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="text-[11px] flex items-center gap-1.5 mb-0.5" style={{ color: 'var(--text-secondary)' }}>
          {role ? (
            <>
              <RoleIcon role={role} size={13} className="opacity-60" />
              <span>{ROLE_LABELS[role]}</span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>{displayLabel}</span>
          )}
          {isMySlot && (
            <span className="px-1.5 py-px rounded-md text-[9px] font-bold text-white ml-1" style={{ background: 'var(--accent)' }}>
              MOI
            </span>
          )}
        </div>
        <div className="text-sm font-medium truncate" style={{ color: champion ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {champion ? champion.name : 'Choisir…'}
        </div>
      </div>

      {champion && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          aria-label={`Retirer ${champion.name}`}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center
                     opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:border-red-500 transition-all duration-200"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)' }}
        >
          <X size={10} className="text-white" />
        </button>
      )}
    </div>
  );
}
