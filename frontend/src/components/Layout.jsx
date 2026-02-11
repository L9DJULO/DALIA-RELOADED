import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Swords, Users, Zap } from 'lucide-react';

const NAV = [
  { to: '/draft', label: 'Draft', icon: Swords, desc: 'Analyse en temps réel' },
  { to: '/pool', label: 'Champions', icon: Users, desc: 'Gérer mon pool' },
];

export default function Layout({ patchInfo }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* ── Header ── */}
      <header className="h-16 bg-slate-900/90 backdrop-blur-xl border-b border-slate-700/50 flex items-center px-6 shrink-0 relative z-30">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <span className="text-lg font-bold text-white tracking-tight">DALIA</span>
              <span className="text-[10px] text-slate-500 block -mt-1">Draft Assistant</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1 ml-10">
          {NAV.map(({ to, label, icon: Icon, desc }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} strokeWidth={2} className={isActive ? 'text-amber-500' : ''} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Right side info */}
        <div className="ml-auto flex items-center gap-4">
          {patchInfo && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-300">Patch {patchInfo.patch}</span>
            </div>
          )}
          <div className="text-xs text-slate-500">
            Données Ranked • Master+
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto bg-gradient-to-b from-slate-950 to-slate-900">
        <Outlet />
      </main>
    </div>
  );
}
