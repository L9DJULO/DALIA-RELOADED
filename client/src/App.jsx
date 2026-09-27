// ─────────────────────────────────────────────
// App.jsx — coquille : barre du haut, alerte, pages
// ─────────────────────────────────────────────
import React, { useState, useEffect, lazy, Suspense } from 'react';
import Topbar              from './components/Topbar';
import DraftScreen         from './components/Draft/DraftScreen';
import useDraftStore       from './stores/draftStore';
import useUserStore        from './stores/userStore';
import useAuthStore        from './stores/authStore';
import useDuoStore         from './stores/duoStore';
import { startDraftSession } from './services/draftSession';
import { startAutoAnalysis } from './services/autoAnalysis';
const ChampionPoolEditor = lazy(() => import('./components/ChampionPool/ChampionPoolEditor'));
const SettingsPage       = lazy(() => import('./components/Settings/SettingsPage'));
const DuoPanel           = lazy(() => import('./components/DuoQ/DuoPanel'));
const AuthPage           = lazy(() => import('./components/Auth/AuthPage'));
const HistoryPage        = lazy(() => import('./components/HistoryPage'));

// ── App ─────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState('draft');

  const draftError = useDraftStore(s => s.error);

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
    const stopSession = startDraftSession();
    const stopAutoAnalysis = startAutoAnalysis();
    return () => { stopAutoAnalysis(); stopSession(); };
  }, [isAuthed, userId]);

  // Not logged in → auth page (replaces the whole shell).
  if (!isAuthed) {
    return <Suspense fallback={<div className="app"/>}><AuthPage/></Suspense>;
  }

  const fallback = <div className="empty" role="status">Chargement…</div>;
  return (
    <div className="app">
      <a className="skip-link" href="#contenu">Aller au contenu</a>
      <Topbar page={page} onPage={setPage}/>

      {draftError && (
        <div className="app-alert banner banner--bad" role="alert">
          <span>Analyse impossible<span className="banner__detail">{draftError}</span></span>
          <button className="btn btn--sm btn--ghost" onClick={() => useDraftStore.setState({ error: null })}>Fermer</button>
        </div>
      )}

      <main className="app__page" id="contenu" tabIndex={-1}>
        {page === 'draft' && <DraftScreen/>}
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
