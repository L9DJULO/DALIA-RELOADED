// ─────────────────────────────────────────────
// ReplayBar.jsx — avancer dans un replay, étape par étape
// ─────────────────────────────────────────────
import React from 'react';
import useDraftStore from '../../stores/draftStore';

export default function ReplayBar() {
  const timeline = useDraftStore(s => s.timeline);
  const position = useDraftStore(s => s.replayPosition) ?? 0;
  const loadReplay = useDraftStore(s => s.loadReplay);
  const forkReplay = useDraftStore(s => s.forkReplay);
  return (
    <div className="replaybar" role="group" aria-label="Replay">
      <span className="replaybar__lbl">REPLAY</span>
      <button className="btn btn--sm btn--ghost" disabled={position <= 0} onClick={() => loadReplay(timeline, position - 1)}>Étape précédente</button>
      <span className="replaybar__step" aria-live="polite">Étape {position + 1} / {timeline.length}</span>
      <button className="btn btn--sm btn--ghost" disabled={position >= timeline.length - 1} onClick={() => loadReplay(timeline, position + 1)}>Étape suivante</button>
      <button className="btn btn--sm" onClick={forkReplay}>Tester une variante</button>
      <span className="replaybar__note">Les analyses utilisent les données actuelles ; l'étape affichée ne révèle pas les picks suivants.</span>
    </div>
  );
}
