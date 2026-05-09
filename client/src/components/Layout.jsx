import React, { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Swords, Users, Settings, LogOut, User, Gamepad2, Wifi, WifiOff, Brain } from 'lucide-react';
import useAuthStore from '../stores/authStore';
import useUserStore from '../stores/userStore';
import useLCUStore from '../stores/lcuStore';
import DaliaLogo from './DaliaLogo';

const NAV = [
  { to: '/draft',    label: 'Draft',    icon: Swords,  desc: 'Draft Board' },
  { to: '/pool',     label: 'Pool',     icon: Users,   desc: 'Champion Pool' },
  { to: '/insights', label: 'Insights', icon: Brain,   desc: 'Stats & Historique' },
];
const BOTTOM_NAV = [
  { to: '/settings', label: 'Settings', icon: Settings, desc: 'Paramètres' },
];

function SidebarItem({ to, label, icon: Icon, desc }) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      title={desc}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 44, height: 44,
        background: isActive ? 'var(--accent)' : 'transparent',
        border: isActive ? '2px solid var(--text-primary)' : '2px solid transparent',
        boxShadow: isActive ? '3px 3px 0 var(--text-primary)' : 'none',
        color: isActive ? '#000' : 'var(--text-muted)',
        transition: 'all 0.1s',
        textDecoration: 'none',
      })}
      onMouseEnter={e => { if (!e.currentTarget.getAttribute('aria-current')) e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseLeave={e => { if (!e.currentTarget.getAttribute('aria-current')) e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      {({ isActive }) => <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8}/>}
    </NavLink>
  );
}

function LCUBadge() {
  const connected     = useLCUStore(s => s.connected);
  const inChampSelect = useLCUStore(s => s.inChampSelect);

  const cfg = connected
    ? inChampSelect
      ? { Icon: Gamepad2, label: 'CHAMP SELECT', color: 'var(--win)', bg: 'var(--win-bg)', border: 'var(--win-border)', pulse: true }
      : { Icon: Wifi,     label: 'LoL',          color: 'var(--text-muted)', bg: 'var(--surface-elevated)', border: 'var(--border-subtle)', pulse: false }
    : { Icon: WifiOff,   label: 'LoL',            color: 'var(--text-muted)', bg: 'transparent', border: 'var(--border-subtle)', pulse: false };

  return (
    <div
      className="pill"
      title={connected ? (inChampSelect ? 'Champ Select en cours' : 'Client LoL connecté') : 'Client LoL non détecté'}
      style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.color, gap: 6 }}
    >
      <span
        style={{
          width: 7, height: 7, borderRadius: '50%', background: cfg.color, flexShrink: 0,
          boxShadow: cfg.pulse ? `0 0 6px ${cfg.color}` : 'none',
          animation: cfg.pulse ? 'pulse-soft 1.8s ease-in-out infinite' : 'none',
        }}
      />
      <cfg.Icon size={11}/>
      <span style={{ fontFamily: 'var(--f-display)', fontSize: 10, letterSpacing: '0.1em' }}>{cfg.label}</span>
    </div>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px',
          background: open ? 'var(--surface-elevated)' : 'transparent',
          border: '2px solid ' + (open ? 'var(--border-default)' : 'transparent'),
          color: 'var(--text-primary)',
          cursor: 'pointer',
          transition: 'all 0.1s',
        }}
      >
        <div style={{
          width: 26, height: 26,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent-muted)',
          border: '1px solid var(--border-accent)',
        }}>
          <User size={12} style={{ color: 'var(--accent)' }}/>
        </div>
        <span style={{ fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.1em', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.username}
        </span>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)}/>
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4,
            width: 180,
            background: 'var(--surface-overlay)',
            border: '2px solid var(--border-default)',
            boxShadow: '4px 4px 0 var(--border-strong)',
            zIndex: 50,
            animation: 'scaleIn 0.12s ease-out both',
            padding: '8px 0',
          }}>
            <div style={{ padding: '6px 14px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 12, letterSpacing: '0.1em' }}>{user.username}</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email || 'DALIA User'}</div>
            </div>
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 14px',
                background: 'transparent',
                border: 'none',
                color: 'var(--loss)',
                fontFamily: 'var(--f-display)',
                fontSize: 11, letterSpacing: '0.1em',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--loss-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <LogOut size={12}/>
              SE DÉCONNECTER
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout({ patchInfo }) {
  const user      = useAuthStore(s => s.user);
  const logout    = useAuthStore(s => s.logout);
  const resetPool = useUserStore(s => s.resetPool);

  const handleLogout = () => { resetPool(); logout(); };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-base)' }}>
      {/* Topbar */}
      <header style={{
        height: 48, display: 'flex', alignItems: 'center', padding: '0 20px',
        flexShrink: 0, zIndex: 30,
        background: 'var(--surface-default)',
        borderBottom: 'var(--edge-weight) solid var(--text-primary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DaliaLogo size={28}/>
          <span style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 700, letterSpacing: '0.3em', color: 'var(--text-primary)' }}>DALIA</span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 0 }}>
          {patchInfo && (
            <div className="pill" style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)', marginRight: 12, gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--win)', boxShadow: '0 0 4px var(--win)' }}/>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10 }}>Patch {patchInfo.patch}</span>
            </div>
          )}
          <LCUBadge/>
          <div style={{ width: 1, height: 24, background: 'var(--border-subtle)', margin: '0 12px' }}/>
          {user && <UserMenu user={user} onLogout={handleLogout}/>}
        </div>
      </header>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <aside style={{
          width: 60, display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '12px 0', flexShrink: 0,
          background: 'var(--surface-default)',
          borderRight: 'var(--edge-weight) solid var(--border-subtle)',
          gap: 6,
        }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            {NAV.map(item => <SidebarItem key={item.to} {...item}/>)}
          </nav>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {BOTTOM_NAV.map(item => <SidebarItem key={item.to} {...item}/>)}
          </nav>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Outlet/>
        </main>
      </div>
    </div>
  );
}
