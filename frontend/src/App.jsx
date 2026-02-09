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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl font-display text-dalia-accent mb-4">DALIA</div>
          <div className="text-dalia-muted animate-pulse">Chargement des champions…</div>
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
