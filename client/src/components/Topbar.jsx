// ─────────────────────────────────────────────
// Topbar.jsx — marque, navigation, équipe/rôle, client League, chrono
// ─────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import DaliaLogo from './DaliaLogo';
import useDraftStore from '../stores/draftStore';
import useLCUStore from '../stores/lcuStore';
import { timerView, pickOrderLabel } from '../lib/timer';
import useTimerRemaining from '../lib/useTimerRemaining';

export const NAV_TABS = [
  { id: 'draft',    label: 'DRAFT' },
  { id: 'pool',     label: 'POOL' },
  { id: 'duo',      label: 'DUO Q' },
  { id: 'history',  label: 'REPLAYS' },
  { id: 'settings', label: 'PARAMÈTRES' },
];

const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
const ROLE_SHORT = { top: 'TOP', jungle: 'JGL', mid: 'MID', bot: 'ADC', support: 'SUP' };

// ── Équipe, rôle, ordre de pick ─────────────────
function DraftContext() {
  const myTeam = useDraftStore(s => s.myTeam);
  const myRole = useDraftStore(s => s.myRole);
  const myPickOrder = useDraftStore(s => s.myPickOrder);
  const setMyTeam = useDraftStore(s => s.setMyTeam);
  const setMyRole = useDraftStore(s => s.setMyRole);
  const autoDetected = useDraftStore(s => s.autoDetected);
  const mode = useDraftStore(s => s.mode);
  const liveSelect = useLCUStore(s => s.connected && s.inChampSelect) && mode === 'live';
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="ctx">
      <div className="seg side-seg" role="group" aria-label="Mon équipe">
        {['blue', 'red'].map(side => (
          <button key={side} data-side={side} aria-pressed={myTeam === side} onClick={() => setMyTeam(side)}
            disabled={liveSelect} title={liveSelect ? 'Équipe lue dans le client League' : undefined}>
            {side.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="role-menu" ref={menuRef}>
        <button className="role-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Mon rôle : ${ROLE_SHORT[myRole]}`} onClick={() => setOpen(v => !v)}>
          {ROLE_SHORT[myRole]} <span className="role-btn__caret" aria-hidden="true">▾</span>
        </button>
        {open && (
          <div className="menu" role="menu">
            {ROLES.map(r => (
              <button key={r} role="menuitemradio" aria-checked={myRole === r} onClick={() => { setMyRole(r); setOpen(false); }}>
                {ROLE_SHORT[r]}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="pick-order">{pickOrderLabel(myPickOrder || 1)}</span>
      {autoDetected && <span className="auto-flag" title="Équipe et rôle détectés par le client League">AUTO</span>}
    </div>
  );
}

// ── Client League ───────────────────────────────
function LcuStatus() {
  const connected = useLCUStore(s => s.connected);
  return (
    <span className={`lcu ${connected ? 'lcu--on' : ''}`} title={connected ? 'Client League connecté' : 'Client League non détecté'}>
      <span className={`dot ${connected ? 'dot--on' : ''}`} aria-hidden="true"/>
      <span className="lcu__label">{connected ? 'CLIENT LEAGUE' : 'HORS LIGNE'}</span>
    </span>
  );
}

// ── Chrono, branché sur le client League ────────
function Timer() {
  const connected = useLCUStore(s => s.connected);
  const inChampSelect = useLCUStore(s => s.inChampSelect);
  const active = connected && inChampSelect;
  const remaining = useTimerRemaining(active);
  const view = timerView({ active, remaining });
  return (
    <>
      <div className={`timer ${view.text === '--' ? 'timer--idle' : ''} ${view.danger ? 'timer--danger' : ''}`}
        role="timer" aria-label={view.text === '--' ? 'Pas de sélection en cours' : `${Number(view.text)} secondes restantes`}>
        <span className="timer__n">{view.text}</span><span className="timer__u">S</span>
      </div>
      <span className={`drain ${view.danger ? 'drain--danger' : ''}`} style={{ width: `${view.ratio * 100}%` }} aria-hidden="true"/>
    </>
  );
}

export default function Topbar({ page, onPage }) {
  return (
    <header className="topbar">
      <div className="brand">
        <DaliaLogo size={26} alt=""/>
        <span className="brand__name">DALIA</span>
      </div>
      <nav className="nav" aria-label="Navigation principale">
        {NAV_TABS.map(({ id, label }) => (
          <button key={id} className="nav__tab" aria-current={page === id ? 'page' : undefined} onClick={() => onPage(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="topbar__right">
        <DraftContext/>
        <LcuStatus/>
        <Timer/>
      </div>
    </header>
  );
}
