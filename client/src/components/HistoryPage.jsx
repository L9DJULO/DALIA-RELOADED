import React, { useEffect, useRef, useState } from 'react';
import useDraftStore from '../stores/draftStore';
import { fetchHistory, fetchHistoryEntry, updateHistoryResult, apiErrorText } from '../services/api';
import { downloadReplay, validateReplay } from '../lib/replay';
import '../workshop.css';

// The list endpoint omits timelines (they can weigh hundreds of KB each); one entry's
// steps are fetched when the player actually replays or exports it.
const stepCount = entry => entry.timeline_steps ?? entry.timeline?.length ?? 0;

export default function HistoryPage({ onReplay }) {
  const [entries, setEntries] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const alive = useRef(true);
  async function load() {
    setLoading(true); setError('');
    try { const data = await fetchHistory(); if (alive.current) setEntries(data); }
    catch { if (alive.current) setError('Historique inaccessible. Tu peux toujours importer un replay local.'); }
    finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, []);
  function replay(session) {
    try { const valid = validateReplay(session); useDraftStore.getState().loadReplay(valid.steps, 0, true); onReplay(); }
    catch (e) { setError(e.message); }
  }
  async function withTimeline(entry, action) {
    setBusyId(entry.id); setError('');
    try {
      const steps = entry.timeline?.length ? entry.timeline : (await fetchHistoryEntry(entry.id)).timeline;
      if (alive.current) action({ schema_version: 1, steps: steps || [] });
    } catch (e) { if (alive.current) setError(apiErrorText(e, 'Étapes de cette draft inaccessibles. Réessaie.')); }
    finally { if (alive.current) setBusyId(null); }
  }
  async function importFile(e) {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 1024 * 1024) { setError('Fichier trop volumineux (1 Mo maximum).'); return; }
    try { replay(JSON.parse(await file.text())); } catch { setError('Ce fichier ne contient pas un replay JSON valide.'); }
    e.target.value = '';
  }
  async function result(id, value) {
    try {
      const entry = await updateHistoryResult(id, value);
      if (alive.current) setEntries(items => items.map(e => e.id === id ? { ...e, result: entry.result, notes: entry.notes } : e));
    }
    catch { if (alive.current) setError('Résultat non enregistré.'); }
  }
  return <main className="workshop history-page">
    <h2>Rejouer une draft</h2>
    <p>Avance étape par étape, relance l’analyse et teste une variante. Les analyses utilisent les données actuelles ; les instantanés conservent les choix observés.</p>
    <div className="controls"><button onClick={load} disabled={loading}>{loading ? 'Chargement…' : 'Actualiser'}</button>
      <label>Importer un replay JSON<input type="file" accept=".json,application/json" onChange={importFile}/></label>
      <button onClick={() => downloadReplay(useDraftStore.getState().exportSession())}>Exporter la draft actuelle</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!loading && !entries.length && <p>Aucune draft enregistrée. Utilise « Enregistrer » depuis le tableau de draft.</p>}
    {entries.map(entry => <article key={entry.id}>
      <h3>{entry.my_champion_name || 'Draft enregistrée'} · {entry.my_role} · {new Date(entry.timestamp).toLocaleString('fr-FR')}</h3>
      <p>Patch {entry.patch || 'inconnu'} · {stepCount(entry)} étapes · {entry.result || 'résultat non renseigné'}</p>
      <div className="controls">
        <button disabled={!stepCount(entry) || busyId === entry.id} onClick={() => withTimeline(entry, replay)}>Rejouer</button>
        <button disabled={!stepCount(entry) || busyId === entry.id} onClick={() => withTimeline(entry, downloadReplay)}>Exporter</button>
        <label>Résultat<select aria-label={`Résultat ${entry.id}`} value={entry.result || ''} onChange={e => result(entry.id, e.target.value)}>
          <option value="" disabled>Non renseigné</option><option value="win">Victoire</option><option value="loss">Défaite</option><option value="remake">Remake</option>
        </select></label>
      </div>
      {!stepCount(entry) && <p className="muted">Ancienne entrée : les étapes n’étaient pas enregistrées.</p>}
    </article>)}
  </main>;
}
