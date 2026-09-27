// ─────────────────────────────────────────────
// DraftScreen.jsx — l'écran de draft, lisible d'un regard
// bandeau · (replay) · héros + shortlist | pourquoi · barre d'état
// ─────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import useDraftStore from '../../stores/draftStore';
import HeroPanel from '../HeroPanel';
import DraftStrip from './DraftStrip';
import ReplayBar from './ReplayBar';
import WhyPanel from './WhyPanel';
import StatusBar from './StatusBar';
import { AnalysisSkeleton, BeforeAnalysis } from './DraftStates';

export default function DraftScreen() {
  const [selected, setSelected] = useState(0);
  const recommendations = useDraftStore(s => s.recommendations);
  const loading = useDraftStore(s => s.loading);
  const mode = useDraftStore(s => s.mode);
  const hasRecs = recommendations.length > 0;

  useEffect(() => { setSelected(0); }, [recommendations]);

  // Entrée, quand rien n'a le focus, lance l'analyse.
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      const draft = useDraftStore.getState();
      if (!draft.loading) draft.getRecommendations();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="draft">
      <DraftStrip/>
      {mode === 'replay' && <ReplayBar/>}
      <div className="draft__main">
        <section className="draft__left" aria-label="Recommandations">
          {hasRecs ? <HeroPanel selected={selected} onSelect={setSelected}/> : loading ? <AnalysisSkeleton/> : <BeforeAnalysis/>}
        </section>
        <section className="draft__right" aria-label="Explication du pick">
          <WhyPanel selected={selected}/>
        </section>
      </div>
      <StatusBar/>
    </div>
  );
}
