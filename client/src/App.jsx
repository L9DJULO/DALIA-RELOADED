// ─────────────────────────────────────────────
// App.jsx — coquille : barre du haut, alerte, pages
// ─────────────────────────────────────────────
import React, { useState, useEffect, lazy, Suspense } from 'react';
import Topbar              from './components/Topbar';
import HeroPanel           from './components/HeroPanel';
import DraftPanel          from './components/DraftPanel';
import useDraftStore       from './stores/draftStore';
import useUserStore        from './stores/userStore';
import useAuthStore        from './stores/authStore';
import useDuoStore         from './stores/duoStore';
import { startDraftSession } from './services/draftSession';
const ChampionPoolEditor = lazy(() => import('./components/ChampionPool/ChampionPoolEditor'));
const SettingsPage       = lazy(() => import('./components/Settings/SettingsPage'));
const DuoPanel           = lazy(() => import('./components/DuoQ/DuoPanel'));
const AuthPage           = lazy(() => import('./components/Auth/AuthPage'));
const HistoryPage        = lazy(() => import('./components/HistoryPage'));

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
  const [page, setPage] = useState('draft');

  // Subscribe so App (and its children) re-render when recommendations or loading changes
  const recommendations = useDraftStore(s => s.recommendations);
  const draftLoading    = useDraftStore(s => s.loading);
  const draftError      = useDraftStore(s => s.error);
  const hasRecs         = recommendations.length > 0;

  // Auth gate — re-render whenever the token changes (login/logout).
  const token = useAuthStore(s => s.token);
  const userId = useAuthStore(s => s.user?.id);
  const isAuthed = !!token;

  useEffect(() => {
    if (!isAuthed) return;
    useDraftStore.getState().resetDraft('live');
    // Start LCU polling + load user profile only once authenticated.
    useAuthStore.getState().refreshUser();
    useUserStore.getState().loadProfile(userId);
    useDuoStore.getState().loadDuoState();
    return startDraftSession();
  }, [isAuthed, userId]);

  useEffect(() => { setSelected(0); }, [recommendations]);

  // Not logged in → auth page (replaces the whole shell).
  if (!isAuthed) {
    return <Suspense fallback={<div className="app"/>}><AuthPage/></Suspense>;
  }

  const fallback = <div className="empty" role="status">Chargement…</div>;
  return (
    <div className="app">
      <Topbar page={page} onPage={setPage}/>

      {draftError && (
        <div className="app-alert banner banner--bad" role="alert">
          <span>Analyse impossible<span className="banner__detail">{draftError}</span></span>
          <button className="btn btn--sm btn--ghost" onClick={() => useDraftStore.setState({ error: null })}>Fermer</button>
        </div>
      )}

      <main className="app__page">
        {page === 'draft' && (
          <div className="draft-layout" style={{ display:'grid', gridTemplateColumns:'40% 60%', height:'100%', overflow:'hidden' }}>
            {hasRecs
              ? <HeroPanel selected={selected} onSelect={setSelected}/>
              : <EmptyRecsPanel loading={draftLoading}/>
            }
            <DraftPanel selected={selected}/>
          </div>
        )}
        <Suspense fallback={fallback}>
          {page === 'pool' && <ChampionPoolEditor/>}
          {page === 'duo' && <div className="page"><DuoPanel/></div>}
          {page === 'history' && <div className="page"><HistoryPage onReplay={() => setPage('draft')}/></div>}
          {page === 'settings' && <SettingsPage/>}
        </Suspense>
      </main>
    </div>
  );
}
