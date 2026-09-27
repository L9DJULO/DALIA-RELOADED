// ─────────────────────────────────────────────
// StatusBar.jsx — ce qui fonde les conseils, et les outils de la draft
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import useDraftStore from '../../stores/draftStore';
import useLCUStore from '../../stores/lcuStore';
import { saveHistoryEntry, apiErrorText } from '../../services/api';
import { historyPayload } from '../../lib/replay';
import { dataStatusParts } from '../../lib/draftView';

export default function StatusBar() {
  const draft = useDraftStore();
  const connected = useLCUStore(s => s.connected);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setMessage('');
    try { await saveHistoryEntry(historyPayload(useDraftStore.getState())); setMessage('Draft enregistrée dans Replays.'); }
    catch (e) { setMessage(apiErrorText(e, 'Enregistrement impossible. Réessaie.')); }
    finally { setSaving(false); }
  }

  const parts = dataStatusParts(draft.dataStatus);
  if (draft.mode === 'live' && !connected) parts.unshift({ text: 'En attente du client League : le mode manuel reste disponible', warn: true });

  return (
    <footer className="statusbar">
      <p className="statusbar__data">
        {parts.length === 0 && <span>Aucune analyse pour cette draft</span>}
        {parts.map(p => <span key={p.text} className={p.warn ? 'is-warn' : ''}>{p.text}</span>)}
        {message && <span className="is-msg" role="status">{message}</span>}
      </p>
      <div className="statusbar__actions">
        <label className="statusbar__field">
          <span>Mode</span>
          <select className="select select--sm" value={draft.mode} onChange={e => draft.setMode(e.target.value)}>
            <option value="live">League en direct</option>
            <option value="manual">Manuel</option>
            {draft.mode === 'replay' && <option value="replay">Replay</option>}
          </select>
        </label>
        <label className="statusbar__field">
          <span>Ordre</span>
          <select className="select select--sm" aria-label="Ordre du pick" value={draft.myPickOrder} disabled={draft.mode === 'live'} onChange={e => draft.setMyPickOrder(e.target.value)}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button className="btn btn--sm btn--ghost" onClick={draft.undo} disabled={!draft.undoStack.length || draft.mode === 'live'}>Annuler</button>
        <button className="btn btn--sm btn--ghost" onClick={() => { draft.resetDraft('manual'); setMessage(''); }}>Nouvelle draft</button>
        <button className="btn btn--sm" onClick={save} disabled={saving || !draft.timeline.length}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </footer>
  );
}
