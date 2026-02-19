import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Swords, Users, Zap, Clock, Brain, Cpu, Settings, LogOut, User } from 'lucide-react';
import useAuthStore from '../stores/authStore';
import useUserStore from '../stores/userStore';

const NAV = [
  { to: '/draft', label: 'Draft', icon: Swords },
  { to: '/pool', label: 'Pool', icon: Users },
  { to: '/history', label: 'Historique', icon: Clock },
  { to: '/insights', label: 'Insights', icon: Brain },
];

const ADMIN_NAV = [
  { to: '/ml', label: 'IA / ML', icon: Cpu },
];

const BOTTOM_NAV = [
  { to: '/settings', label: 'Paramètres', icon: Settings },
];

export default function Layout({ patchInfo }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetPool = useUserStore((s) => s.resetPool);

  const handleLogout = () => {
    resetPool();
    logout();
  };

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

          {/* User info + logout */}
          {user && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-700/50">
              <div className="flex items-center gap-1.5">
                <User size={12} className="text-slate-400" />
                <span className="text-xs text-slate-300 font-medium">{user.username}</span>
              </div>
              <button
                onClick={handleLogout}
                title="Se déconnecter"
                className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={13} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-14 bg-surface border-r border-slate-700/50 flex flex-col items-center py-3 shrink-0">
          <nav className="flex flex-col gap-1 flex-1" aria-label="Navigation principale">
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

            {/* Admin-only nav (ML) */}
            {user?.is_admin && ADMIN_NAV.map(({ to, label, icon: Icon }) => (
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

          {/* Bottom nav — Settings */}
          <nav className="flex flex-col gap-1 mt-auto" aria-label="Navigation secondaire">
            {BOTTOM_NAV.map(({ to, label, icon: Icon }) => (
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
                    <Icon size={18} strokeWidth={1.8} />
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
