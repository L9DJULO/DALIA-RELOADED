import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ChampionPoolEditor from './components/ChampionPool/ChampionPoolEditor';
import DraftBoard from './components/DraftBoard/DraftBoard';
import { fetchChampions, fetchPatch } from './services/api';

export default function App() {
  const [champions, setChampions] = useState([]);
  const [patchInfo, setPatchInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const [champs, patch] = await Promise.all([fetchChampions(), fetchPatch()]);
        setChampions(champs);
        setPatchInfo(patch);
      } catch (e) {
        console.error('Init failed:', e);
        // Set empty data so the UI still renders
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
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <svg className="w-6 h-6 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="text-xl font-bold text-white mb-1">DALIA</div>
          <div className="text-sm text-slate-500">Chargement des champions...</div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout patchInfo={patchInfo} />}>
          <Route path="/" element={<Navigate to="/draft" replace />} />
          <Route path="/pool" element={<ChampionPoolEditor champions={champions} />} />
          <Route path="/draft" element={<DraftBoard champions={champions} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
