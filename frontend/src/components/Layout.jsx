import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Swords, Users } from 'lucide-react';

const NAV = [
  { to: '/draft', label: 'Draft', icon: Swords },
  { to: '/pool', label: 'Mon Pool', icon: Users },
];

export default function Layout({ patchInfo }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="h-14 bg-dalia-surface/80 backdrop-blur-xl border-b border-white/[0.06] flex items-center px-5 gap-6 shrink-0 relative z-30">
        {/* Subtle gradient line at top */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-dalia-accent/40 to-transparent" />

        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="text-xl font-display text-dalia-accent tracking-[0.2em] font-bold">DALIA</span>
            <span className="absolute -bottom-1 left-0 right-0 h-[2px] bg-gradient-to-r from-dalia-accent/60 to-transparent rounded-full" />
          </div>
          {patchInfo && (
            <span className="text-[10px] text-dalia-muted/70 border border-dalia-border/40 rounded-md px-2 py-0.5 ml-1">
              {patchInfo.patch}
            </span>
          )}
        </div>

        <nav className="flex items-center gap-1 ml-6">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-dalia-accent/10 text-dalia-accent shadow-sm shadow-dalia-accent/10'
                    : 'text-dalia-muted hover:text-dalia-text hover:bg-white/[0.03]'
                }`
              }
            >
              <Icon size={15} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-[11px] text-dalia-muted/60">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-dalia-green animate-pulse" />
            <span>Emerald+</span>
          </div>
          <span className="text-dalia-border">|</span>
          <span>Ranked Solo</span>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
