import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Swords, Users, Zap, Clock } from 'lucide-react';

const NAV = [
  { to: '/draft', label: 'Draft', icon: Swords },
  { to: '/pool', label: 'Pool', icon: Users },
  { to: '/history', label: 'Historique', icon: Clock },
];

export default function Layout({ patchInfo }) {
  return (
    <div className="h-screen flex flex-col bg-surface-base">
      {/* ── Compact header ── */}
      <header className="h-10 bg-surface border-b border-slate-700/50 flex items-center px-4 shrink-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-amber-500 flex items-center justify-center">
            <Zap size={14} className="text-slate-900" />
          </div>
          <span className="text-sm font-bold text-slate-100 tracking-tight">DALIA</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {patchInfo && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Patch {patchInfo.patch}
            </div>
          )}
          <span className="text-[10px] text-slate-600">Ranked Master+</span>
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-14 bg-surface border-r border-slate-700/50 flex flex-col items-center py-3 shrink-0">
          <nav className="flex flex-col gap-1" aria-label="Navigation principale">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={label}
                aria-label={label}
                className={({ isActive }) =>
                  `relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors duration-150 ${
                    isActive
                      ? 'bg-slate-800 text-amber-500'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-amber-500" />
                    )}
                    <Icon size={20} strokeWidth={1.8} />
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
