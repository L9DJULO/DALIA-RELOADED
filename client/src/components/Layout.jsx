import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Swords, Users, Clock, Settings, LogOut, User,
  Wifi, WifiOff, Gamepad2, Brain, ChevronRight,
} from 'lucide-react';
import useAuthStore from '../stores/authStore';
import useUserStore from '../stores/userStore';
import useLCUStore from '../stores/lcuStore';
import DaliaLogo from './DaliaLogo';

const NAV = [
  { to: '/draft', label: 'Draft', icon: Swords, desc: 'Draft Board' },
  { to: '/pool', label: 'Pool', icon: Users, desc: 'Champion Pool' },
  { to: '/insights', label: 'Insights', icon: Brain, desc: 'Stats & IA' },
  { to: '/history', label: 'Historique', icon: Clock, desc: 'Historique' },
];

const BOTTOM_NAV = [
  { to: '/settings', label: 'Paramètres', icon: Settings, desc: 'Settings' },
];

/* ── Sidebar Navigation Item ── */
function SidebarItem({ to, label, icon: Icon, desc }) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      className={({ isActive }) =>
        `group relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200 ${
          isActive
            ? 'bg-accent text-white shadow-glow'
            : 'text-txt-muted hover:text-txt-secondary hover:bg-surface-elevated'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={20} strokeWidth={isActive ? 2.2 : 1.7} />
          {/* Tooltip */}
          <div className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 rounded-lg
                          bg-surface-overlay border border-border text-txt-primary text-xs font-medium
                          opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50
                          shadow-lg">
            {desc || label}
            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-surface-overlay" />
          </div>
        </>
      )}
    </NavLink>
  );
}

/* ── LCU Status Badge ── */
function LCUBadge() {
  const lcuConnected = useLCUStore((s) => s.connected);
  const lcuInChampSelect = useLCUStore((s) => s.inChampSelect);
  const lcuGamePhase = useLCUStore((s) => s.gamePhase);

  const statusConfig = lcuConnected
    ? lcuInChampSelect
      ? { icon: Gamepad2, text: 'Champ Select', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', pulse: true }
      : { icon: Wifi, text: 'LoL', color: 'text-txt-muted bg-surface-elevated border-border-subtle', pulse: false }
    : { icon: WifiOff, text: 'LoL', color: 'text-txt-muted bg-transparent border-border-subtle', pulse: false };

  const { icon: StatusIcon, text, color, pulse } = statusConfig;

  return (
    <div
      className={`pill gap-1.5 ${color}`}
      title={
        lcuConnected
          ? lcuInChampSelect
            ? 'Connecte au client LoL -- Champ Select en cours'
            : `Connecte au client LoL${lcuGamePhase ? ` -- ${lcuGamePhase}` : ''}`
          : 'Client LoL non detecte'
      }
    >
      <StatusIcon size={11} className={pulse ? 'animate-pulse' : ''} />
      <span>{text}</span>
    </div>
  );
}

/* ── User Menu ── */
function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-surface-elevated transition-colors duration-150"
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent-muted">
          <User size={13} className="text-accent" />
        </div>
        <span className="text-xs font-medium text-txt-primary max-w-[100px] truncate">{user.username}</span>
        <ChevronRight size={12} className={`text-txt-muted transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-44 glass-panel p-1.5 z-50 animate-scale-in">
            <div className="px-3 py-2 mb-1">
              <div className="text-xs font-medium text-txt-primary">{user.username}</div>
              <div className="text-[10px] text-txt-muted truncate">{user.email || 'DALIA User'}</div>
            </div>
            <div className="divider" />
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="w-full flex items-center gap-2 px-3 py-2 mt-1 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut size={13} />
              Se deconnecter
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   LAYOUT — AppShell
   ══════════════════════════════════════════════════════════ */
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
      {/* ── Topbar ── */}
      <header
        className="h-12 flex items-center px-4 shrink-0 z-30 border-b"
        style={{
          background: 'var(--surface-glass)',
          backdropFilter: 'blur(16px) saturate(1.2)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Left: Brand */}
        <div className="flex items-center gap-2.5">
          <DaliaLogo size={22} />
          <span className="text-sm font-bold tracking-tight text-accent">DALIA</span>
          <span className="text-[10px] font-medium text-txt-muted hidden sm:block">Draft Assistant</span>
        </div>

        {/* Right: Status + User */}
        <div className="ml-auto flex items-center gap-2.5">
          {/* Patch info */}
          {patchInfo && (
            <div className="pill gap-1.5 bg-surface-elevated text-txt-muted border-border-subtle">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Patch {patchInfo.patch}</span>
            </div>
          )}

          {/* LCU */}
          <LCUBadge />

          {/* Separator */}
          <div className="w-px h-5 bg-border-subtle" />

          {/* User */}
          {user && <UserMenu user={user} onLogout={handleLogout} />}
        </div>
      </header>

      {/* ── Body: Sidebar + Content ── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside
          className="w-[60px] flex flex-col items-center py-3 shrink-0 border-r"
          style={{
            background: 'var(--surface-default)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <nav className="flex flex-col gap-1.5 flex-1" aria-label="Navigation principale">
            {NAV.map((item) => (
              <SidebarItem key={item.to} {...item} />
            ))}
          </nav>

          {/* Bottom nav */}
          <nav className="flex flex-col gap-1.5 mt-auto" aria-label="Navigation secondaire">
            {BOTTOM_NAV.map((item) => (
              <SidebarItem key={item.to} {...item} />
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
