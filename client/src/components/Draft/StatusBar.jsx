// ─────────────────────────────────────────────
// StatusBar.jsx — ce qui fonde les conseils, et les outils de la draft
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import { useDraft, useDraftApi, useIsStudio } from '../../stores/draftContext';
import useLCUStore from '../../stores/lcuStore';
import { saveHistoryEntry, apiErrorText } from '../../services/api';
import { historyPayload } from '../../lib/replay';
import { dataStatusParts } from '../../lib/draftView';

export default function StatusBar() {
  const draft = useDraft();
  const draftApi = useDraftApi();
  const studio = useIsStudio();
  const connected = useLCUStore(s => s.connected);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setMessage('');
    try { await saveHistoryEntry(historyPayload(draftApi.getState())); setMessage('Draft enregistrée dans Replays.'); }
    catch (e) { setMessage(apiErrorText(e, 'Enregistrement impossible. Réessaie.')); }
    finally { setSaving(false); }
  }

  const parts = dataStatusParts(draft.dataStatus);
  if (!studio && !connected) parts.unshift({ text: 'En attente du client League : le Studio reste disponible pour une draft à la main', warn: true });

  return (
    <footer className="statusbar">
      <p className="statusbar__data">
        {parts.length === 0 && <span>Aucune analyse pour cette draft</span>}
        {parts.map(p => <span key={p.text} className={p.warn ? 'is-warn' : ''}>{p.text}</span>)}
        {message && <span className="is-msg" role="status">{message}</span>}
      </p>
      <div className="statusbar__actions">
        {studio && (
          <>
            <label className="statusbar__field">
              <span>Ordre</span>
              <select className="select select--sm" aria-label="Ordre du pick" value={draft.myPickOrder} onChange={e => draft.setMyPickOrder(e.target.value)}>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button className="btn btn--sm btn--ghost" onClick={draft.undo} disabled={!draft.undoStack.length}>Annuler</button>
            <button className="btn btn--sm btn--ghost" onClick={() => { draft.resetDraft('manual'); setMessage(''); }}>Nouvelle draft</button>
          </>
        )}
        <button className="btn btn--sm" onClick={save} disabled={saving || !draft.timeline.length}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </footer>
  );
}
