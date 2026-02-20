import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Swords, Users, Clock, Settings, LogOut, User, Wifi, WifiOff, Gamepad2 } from 'lucide-react';
import useAuthStore from '../stores/authStore';
import useUserStore from '../stores/userStore';
import useLCUStore from '../stores/lcuStore';
import DaliaLogo from './DaliaLogo';

const NAV = [
  { to: '/draft', label: 'Draft', icon: Swords },
  { to: '/pool', label: 'Pool', icon: Users },
  { to: '/history', label: 'Historique', icon: Clock },
];

const BOTTOM_NAV = [
  { to: '/settings', label: 'Paramètres', icon: Settings },
];

export default function Layout({ patchInfo }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetPool = useUserStore((s) => s.resetPool);
  const lcuConnected = useLCUStore((s) => s.connected);
  const lcuInChampSelect = useLCUStore((s) => s.inChampSelect);
  const lcuGamePhase = useLCUStore((s) => s.gamePhase);

  const handleLogout = () => {
    resetPool();
    logout();
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--surface-base)' }}>
      {/* ── Header ── */}
      <header
        className="h-12 flex items-center px-5 shrink-0 z-30"
        style={{
          background: 'var(--surface-default)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <DaliaLogo size={22} />
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--accent)' }}>DALIA</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {patchInfo && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Patch {patchInfo.patch}
            </div>
          )}

          {/* LCU connection status */}
          <div
            className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors duration-150 ${
              lcuConnected
                ? lcuInChampSelect
                  ? 'text-emerald-400 bg-emerald-500/8 border-emerald-500/20'
                  : 'text-[var(--text-muted)] bg-[var(--surface-elevated)] border-[var(--border-subtle)]'
                : 'text-[var(--text-muted)] bg-transparent border-[var(--border-subtle)]'
            }`}
            title={
              lcuConnected
                ? lcuInChampSelect
                  ? 'Connecté au client LoL — Champ Select en cours'
                  : `Connecté au client LoL${lcuGamePhase ? ` — ${lcuGamePhase}` : ''}`
                : 'Client LoL non détecté — Lancez League of Legends'
            }
          >
            {lcuConnected ? (
              lcuInChampSelect ? (
                <Gamepad2 size={11} className="animate-pulse" />
              ) : (
                <Wifi size={11} />
              )
            ) : (
              <WifiOff size={11} />
            )}
            <span>{lcuConnected ? (lcuInChampSelect ? 'Champ Select' : 'LoL') : 'LoL'}</span>
          </div>

          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Ranked Master+</span>

          {/* User info + logout */}
          {user && (
            <div className="flex items-center gap-2 ml-1 pl-3" style={{ borderLeft: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-muted)' }}>
                  <User size={12} style={{ color: 'var(--accent)' }} />
                </div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{user.username}</span>
              </div>
              <button
                onClick={handleLogout}
                title="Se déconnecter"
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors duration-150 hover:bg-red-500/10 hover:text-red-400"
                style={{ color: 'var(--text-muted)' }}
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
        <aside
          className="w-14 flex flex-col items-center py-3 shrink-0"
          style={{
            background: 'var(--surface-default)',
            borderRight: '1px solid var(--border-subtle)',
          }}
        >
          <nav className="flex flex-col gap-1 flex-1" aria-label="Navigation principale">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={label}
                aria-label={label}
                className={({ isActive }) =>
                  `relative w-10 h-10 flex items-center justify-center rounded-xl transition-colors duration-150 ${
                    isActive
                      ? 'text-white'
                      : 'hover:bg-[var(--accent-muted)]'
                  }`
                }
                style={({ isActive }) => isActive ? {
                  background: 'var(--accent)',
                } : {
                  color: 'var(--text-muted)',
                }}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r" style={{ background: 'var(--accent)' }} />
                    )}
                    <Icon size={20} strokeWidth={isActive ? 2 : 1.8} />
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
                  `relative w-10 h-10 flex items-center justify-center rounded-xl transition-colors duration-150 ${
                    isActive
                      ? 'text-white'
                      : 'hover:bg-[var(--accent-muted)]'
                  }`
                }
                style={({ isActive }) => isActive ? {
                  background: 'var(--accent)',
                } : {
                  color: 'var(--text-muted)',
                }}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r" style={{ background: 'var(--accent)' }} />
                    )}
                    <Icon size={18} strokeWidth={isActive ? 2 : 1.8} />
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
