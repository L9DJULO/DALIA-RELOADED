// ─────────────────────────────────────────────
// App.jsx — shell + topbar + navigation
// ─────────────────────────────────────────────
import React, { useState, useEffect, lazy, Suspense } from 'react';
import HeroPanel           from './components/HeroPanel';
import DraftPanel          from './components/DraftPanel';
const ChampionPoolEditor = lazy(() => import('./components/ChampionPool/ChampionPoolEditor'));
const SettingsPage       = lazy(() => import('./components/Settings/SettingsPage'));
const DuoPanel           = lazy(() => import('./components/DuoQ/DuoPanel'));
const AuthPage           = lazy(() => import('./components/Auth/AuthPage'));
import { LCUBadge }        from './components/Primitives';
import useDraftStore       from './stores/draftStore';
import useLCUStore         from './stores/lcuStore';
import useUserStore        from './stores/userStore';
import useAuthStore        from './stores/authStore';
import logoSrc             from './assets/logo.png';

// ── Logo ────────────────────────────────────────
function DaliaMoon({ size = 32 }) {
  return (
    <img src={logoSrc} alt="DALIA" width={size} height={size}
      style={{ objectFit: 'contain', display: 'block', flexShrink: 0 }}/>
  );
}

// ── Accent palette ──────────────────────────────
const ACCENTS = [
  { id:'red',     hex:'#d91e2b', label:'ROUGE'   },
  { id:'violet',  hex:'#7b2cff', label:'VIOLET'  },
  { id:'acid',    hex:'#e5ff00', label:'ACIDE'   },
  { id:'cyan',    hex:'#00e7ff', label:'CYAN'    },
  { id:'magenta', hex:'#ff1ec0', label:'MAGENTA' },
  { id:'toxic',   hex:'#26ff6e', label:'TOXIC'   },
];

const NAV_TABS = [
  { id: 'draft',    label: 'DRAFT'      },
  { id: 'pool',     label: 'POOL'       },
  { id: 'duo',      label: 'DUO Q'      },
  { id: 'settings', label: 'PARAMÈTRES' },
];

const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
const ROLE_SHORT = { top: 'TOP', jungle: 'JGL', mid: 'MID', bot: 'ADC', support: 'SUP' };

// ── Live timer — branché sur lcuStore ────────────
function LiveTimerChip() {
  const connected     = useLCUStore(s => s.connected);
  const inChampSelect = useLCUStore(s => s.inChampSelect);
  const raw           = useLCUStore(s => s.timerRemaining);
  const active = connected && inChampSelect;
  const t      = active ? Math.max(0, Math.round(raw)) : null;
  const danger = active && t !== null && t <= 10;

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 6,
      padding: '6px 12px',
      border: `var(--edge-weight) solid ${danger ? 'var(--accent)' : 'var(--bone-0)'}`,
      background: danger ? 'var(--accent)' : 'var(--ink-2)',
    }}>
      <span style={{
        fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 22,
        color: danger ? 'var(--accent-ink)' : active ? 'var(--bone-0)' : 'var(--bone-3)',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>
        {active ? String(t).padStart(2, '0') : '--'}
      </span>
      <span style={{
        fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.2em',
        color: danger ? 'var(--accent-ink)' : 'var(--bone-2)',
      }}>
        SEC
      </span>
    </div>
  );
}

// ── Side + Role selector ────────────────────────
function SideRoleChip() {
  const myTeam   = useDraftStore(s => s.myTeam);
  const myRole   = useDraftStore(s => s.myRole);
  const setMyTeam = useDraftStore(s => s.setMyTeam);
  const setMyRole = useDraftStore(s => s.setMyRole);
  const autoDetected = useDraftStore(s => s.autoDetected);
  const [roleOpen, setRoleOpen] = useState(false);

  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      {/* Side toggle */}
      <div style={{ display:'flex', gap:0 }}>
        {['blue','red'].map(side => {
          const active = myTeam === side;
          return (
            <button
              key={side}
              onClick={() => setMyTeam(side)}
              style={{
                padding:'4px 10px',
                fontFamily:'var(--f-display)', fontSize:10, fontWeight:700, letterSpacing:'0.14em',
                background: active ? (side==='blue' ? '#3a7fff' : 'var(--accent)') : 'var(--ink-3)',
                color: active ? (side==='blue' ? '#fff' : 'var(--accent-ink)') : 'var(--bone-3)',
                border:`1.5px solid ${active ? (side==='blue' ? '#6aa0ff' : 'var(--accent)') : 'var(--ink-5)'}`,
                borderRight: side==='blue' ? 0 : undefined,
                cursor:'pointer', transition:'all 0.1s',
              }}
            >{side.toUpperCase()}</button>
          );
        })}
      </div>

      {/* Role dropdown */}
      <div style={{ position:'relative' }}>
        <button
          onClick={() => setRoleOpen(v => !v)}
          style={{
            display:'flex', alignItems:'center', gap:5,
            padding:'4px 10px',
            fontFamily:'var(--f-display)', fontSize:10, fontWeight:700, letterSpacing:'0.14em',
            background:'var(--ink-3)',
            color:'var(--bone-0)',
            border:'1.5px solid var(--ink-5)',
            cursor:'pointer',
          }}
        >
          {ROLE_SHORT[myRole]} <span style={{ fontSize:8, color:'var(--bone-3)' }}>▾</span>
        </button>
        {roleOpen && (
          <>
            <div style={{ position:'fixed', inset:0, zIndex:30 }} onClick={() => setRoleOpen(false)}/>
            <div style={{
              position:'absolute', left:0, top:'calc(100% + 4px)',
              background:'var(--ink-2)', border:'var(--edge-weight) solid var(--bone-0)',
              boxShadow:'4px 4px 0 var(--ink-0)',
              zIndex:40, minWidth:80,
            }}>
              {ROLES.map(r => (
                <button
                  key={r}
                  onClick={() => { setMyRole(r); setRoleOpen(false); }}
                  style={{
                    display:'block', width:'100%',
                    padding:'7px 14px',
                    fontFamily:'var(--f-display)', fontSize:11, letterSpacing:'0.1em',
                    background: myRole===r ? 'var(--accent-muted)' : 'transparent',
                    color: myRole===r ? 'var(--accent)' : 'var(--bone-1)',
                    border:'none',
                    borderBottom:'1px solid var(--ink-5)',
                    cursor:'pointer', textAlign:'left',
                  }}
                >{ROLE_SHORT[r]}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {autoDetected && (
        <span style={{ fontFamily:'var(--f-mono)', fontSize:9, letterSpacing:'0.1em', color:'var(--ok)', opacity:0.8 }}>LCU</span>
      )}
    </div>
  );
}

// ── Topbar ──────────────────────────────────────
function Topbar({ accent, onAccent, page, onPage }) {
  const [accentOpen, setAccentOpen] = useState(false);
  const connected = useLCUStore(s => s.connected);

  return (
    <header style={{
      height: 48, display:'flex', alignItems:'center', gap:0,
      padding:'0 20px', flexShrink:0,
      background:'var(--ink-1)',
      borderBottom:'var(--edge-weight) solid var(--bone-0)',
      position:'relative', zIndex:20,
    }}>
      {/* Brand */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <DaliaMoon size={28}/>
        <span style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:16, letterSpacing:'0.3em', color:'var(--bone-0)' }}>DALIA</span>
        <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--bone-2)', letterSpacing:'0.15em' }}>/ DRAFT</span>
      </div>

      {/* Nav tabs */}
      <div style={{ display:'flex', alignItems:'stretch', height:'100%', marginLeft:28, gap:0 }}>
        {NAV_TABS.map(({ id, label }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => onPage(id)}
              style={{
                padding: '0 18px',
                fontFamily: 'var(--f-display)', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--bone-2)',
                border: 'none',
                borderBottom: active ? 'none' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--bone-0)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--bone-2)'; }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Side + Role (always visible — affects ANALYSER payload) */}
      <div style={{ marginLeft:20 }}>
        <SideRoleChip/>
      </div>

      {/* Right controls */}
      <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
        <LCUBadge connected={connected}/>

        <div style={{ width:1, height:22, background:'var(--ink-5)' }}/>

        {/* Accent picker */}
        <div style={{ position:'relative' }}>
          <button
            onClick={() => setAccentOpen(v => !v)}
            style={{
              display:'flex', alignItems:'center', gap:8,
              fontFamily:'var(--f-mono)', fontSize:10, letterSpacing:'0.12em',
              color:'var(--bone-2)', background:'none', border:'none', cursor:'pointer',
            }}
          >
            <span style={{ width:14, height:14, background:'var(--accent)', display:'inline-block', border:'1.5px solid var(--bone-0)' }}/>
            ACCENT ▾
          </button>
          {accentOpen && (
            <>
              <div style={{ position:'fixed', inset:0, zIndex:30 }} onClick={() => setAccentOpen(false)}/>
              <div style={{
                position:'absolute', right:0, top:'calc(100% + 6px)',
                background:'var(--ink-2)', border:'var(--edge-weight) solid var(--bone-0)',
                boxShadow:'4px 4px 0 var(--ink-0)',
                padding:8, zIndex:40, display:'flex', flexDirection:'column', gap:3, width:140,
              }}>
                {ACCENTS.map(a => (
                  <button key={a.id} onClick={() => { onAccent(a.id); setAccentOpen(false); }} style={{
                    display:'flex', alignItems:'center', gap:8,
                    padding:'6px 8px',
                    fontFamily:'var(--f-display)', fontSize:11, letterSpacing:'0.1em',
                    background: accent === a.id ? 'var(--accent-muted)' : 'transparent',
                    border: accent === a.id ? '1px solid var(--accent)' : '1px solid transparent',
                    color: accent === a.id ? 'var(--accent)' : 'var(--bone-1)',
                    cursor:'pointer', textAlign:'left',
                  }}>
                    <span style={{ width:12, height:12, background:a.hex, display:'inline-block', flexShrink:0 }}/>
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <LiveTimerChip/>
      </div>
    </header>
  );
}

// ── État vide avant premier ANALYSER ────────────
function EmptyRecsPanel({ loading }) {
  return (
    <div style={{
      borderRight: 'var(--edge-weight) solid var(--bone-0)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 18, padding: 40,
      background: 'var(--ink-1)',
      backgroundImage: 'repeating-linear-gradient(-35deg, transparent 0 22px, rgba(244,239,230,0.025) 22px 23px)',
    }}>
      {loading ? (
        <>
          <div style={{ width: 40, height: 40, border: '3px solid var(--ink-5)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--bone-2)' }}>
            ANALYSE EN COURS…
          </span>
        </>
      ) : (
        <>
          <div style={{ width: 56, height: 56, border: '2px dashed var(--ink-5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 28, color: 'var(--ink-5)' }}>?</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 16, letterSpacing: '0.18em', color: 'var(--bone-2)', marginBottom: 8 }}>
              AUCUNE RECOMMANDATION
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bone-3)', letterSpacing: '0.08em', lineHeight: 1.7 }}>
              Remplis le board puis clique<br/>
              <span style={{ color: 'var(--accent)', letterSpacing: '0.2em' }}>ANALYSER</span> pour obtenir des picks.
            </div>
          </div>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── App ─────────────────────────────────────────
export default function App() {
  const [selected, setSelected] = useState(0);
  const [accent, setAccent]     = useState(
    () => document.documentElement.dataset.accent || localStorage.getItem('dalia_accent') || 'red'
  );
  const [page, setPage] = useState('draft');

  // Subscribe so App (and its children) re-render when recommendations or loading changes
  const recommendations = useDraftStore(s => s.recommendations);
  const draftLoading    = useDraftStore(s => s.loading);
  const draftError      = useDraftStore(s => s.error);
  const hasRecs         = recommendations.length > 0;

  // Auth gate — re-render whenever the token changes (login/logout).
  const token = useAuthStore(s => s.token);
  const isAuthed = !!token;

  useEffect(() => {
    // Apply saved accent on mount
    document.documentElement.dataset.accent = accent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    // Start LCU polling + load user profile only once authenticated.
    useLCUStore.getState().startPolling(2000);
    useUserStore.getState().loadProfile();
    return () => useLCUStore.getState().stopPolling();
  }, [isAuthed]);

  const handleAccent = (id) => {
    setAccent(id);
    document.documentElement.dataset.accent = id;
    localStorage.setItem('dalia_accent', id);
  };

  // Not logged in → auth page (replaces the whole shell).
  if (!isAuthed) {
    return (
      <Suspense fallback={<div style={{height:'100vh',background:'var(--ink-0)'}}/>}>
        <AuthPage/>
      </Suspense>
    );
  }

  return (
    <div style={{ height:'100vh', display:'grid', gridTemplateRows:'48px 1fr', background:'var(--ink-0)', position:'relative' }}>
      <Topbar accent={accent} onAccent={handleAccent} page={page} onPage={setPage}/>

      {/* Bandeau d'erreur ANALYSER */}
      {draftError && (
        <div
          onClick={() => useDraftStore.setState({ error: null })}
          style={{
            position: 'absolute', top: 48, left: 0, right: 0, zIndex: 100,
            background: 'rgba(255,40,50,0.92)', color: '#fff',
            fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.08em',
            padding: '8px 20px',
            borderBottom: '2px solid var(--bad)',
            cursor: 'pointer',
          }}
        >
          ! ANALYSER — {draftError} &nbsp;·&nbsp; <span style={{ opacity: 0.7 }}>cliquer pour fermer</span>
        </div>
      )}

      {page === 'draft' && (
        <div style={{ display:'grid', gridTemplateColumns:'40% 60%', overflow:'hidden' }}>
          {hasRecs
            ? <HeroPanel selected={selected} onSelect={setSelected}/>
            : <EmptyRecsPanel loading={draftLoading}/>
          }
          <DraftPanel selected={selected}/>
        </div>
      )}

      {page === 'pool' && (
        <div style={{ overflow: 'hidden' }}>
          <Suspense fallback={<div style={{height:'100%'}}/>}>
            <ChampionPoolEditor/>
          </Suspense>
        </div>
      )}

      {page === 'duo' && (
        <div style={{ overflow: 'auto' }}>
          <Suspense fallback={<div style={{height:'100%'}}/>}>
            <DuoPanel/>
          </Suspense>
        </div>
      )}

      {page === 'settings' && (
        <div style={{ overflow: 'hidden' }}>
          <Suspense fallback={<div style={{height:'100%'}}/>}>
            <SettingsPage/>
          </Suspense>
        </div>
      )}
    </div>
  );
}
