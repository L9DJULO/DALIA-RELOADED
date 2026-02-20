import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import AuthPage from './components/Auth/AuthPage';
import ChampionPoolEditor from './components/ChampionPool/ChampionPoolEditor';
import DraftBoard from './components/DraftBoard/DraftBoard';
import DraftHistory from './components/History/DraftHistory';
import InsightsPage from './components/Insights/InsightsPage';
import MLPage from './components/ML/MLPage';
import SettingsPage from './components/Settings/SettingsPage';
import LCUOverlay from './components/Overlay/LCUOverlay';
import { fetchChampions, fetchPatch } from './services/api';
import useAuthStore from './stores/authStore';
import useUserStore from './stores/userStore';

function ProtectedApp() {
  const [champions, setChampions] = useState([]);
  const [patchInfo, setPatchInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const loadProfile = useUserStore((s) => s.loadProfile);

  useEffect(() => {
    const init = async () => {
      try {
        const [champs, patch] = await Promise.all([
          fetchChampions(),
          fetchPatch(),
        ]);
        setChampions(Array.isArray(champs) ? champs : []);
        setPatchInfo(patch);
        // Load the user's pool from the server
        await loadProfile();
      } catch (e) {
        console.error('Init failed:', e);
        setChampions([]);
        setPatchInfo({ version: '?', patch: '?' });
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-base">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-amber-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-900 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="text-sm font-semibold text-slate-200 mb-1">DALIA</div>
          <div className="text-xs text-slate-500">Chargement…</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <LCUOverlay champions={champions} />
      <Routes>
        <Route element={<Layout patchInfo={patchInfo} />}>
          <Route path="/" element={<Navigate to="/draft" replace />} />
          <Route path="/pool" element={<ChampionPoolEditor champions={champions} />} />
          <Route path="/draft" element={<DraftBoard champions={champions} />} />
          <Route path="/history" element={<DraftHistory champions={champions} />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/ml" element={<MLPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        {isAuthenticated ? (
          <ProtectedApp />
        ) : (
          <Routes>
            <Route path="*" element={<AuthPage />} />
          </Routes>
        )}
      </BrowserRouter>
    </ErrorBoundary>
  );
}
