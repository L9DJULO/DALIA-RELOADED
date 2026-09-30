// ─────────────────────────────────────────────
// HistoryPage.jsx — Replays : drafts enregistrées, résultats, statistiques
// (fusion de l'ancienne page Données)
// ─────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import useDraftStore, { useStudioStore } from '../stores/draftStore';
import useHistoryStore from '../stores/historyStore';
import { fetchHistory, fetchHistoryEntry, updateHistoryResult, deleteHistoryEntry, apiErrorText } from '../services/api';
import { downloadReplay, validateReplay } from '../lib/replay';
import { formatAdvantage } from '../lib/scores';
import { RESULTS, resultView, statsSummary, formatWhen, stepCount } from '../lib/replaysView';
import { Portrait } from './Primitives';

function ReplayCard({ entry, busy, onReplay, onExport, onResult, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const steps = stepCount(entry);
  const name = entry.my_champion_name || 'Draft enregistrée';
  const result = resultView(entry.result);
  const champ = entry.my_champion_key ? { key: entry.my_champion_key, name } : null;
  return (
    <li className="replay">
      <Portrait champ={champ} size={48}/>
      <div className="replay__main">
        <h2 className="replay__title">
          {name}
          <small>{[entry.my_role, entry.my_team].filter(Boolean).join(' · ').toUpperCase()}</small>
        </h2>
        <div className="replay__meta">
          <span className={`pill ${result.tone ? `pill--${result.tone}` : ''}`}>{result.label}</span>
          {entry.recommendation_score != null && (
            <span className="pill">{entry.score_unit === 'wr_points' ? `${formatAdvantage(entry.recommendation_score)} CONSEILLÉ` : `SCORE ${Math.round(entry.recommendation_score)} · ANCIEN BARÈME`}</span>
          )}
          <span className="pill">PATCH {entry.patch || '?'}</span>
          {formatWhen(entry.timestamp || entry.created_at) && <span className="pill">{formatWhen(entry.timestamp || entry.created_at).toUpperCase()}</span>}
          <span className="pill">{steps} ÉTAPE{steps > 1 ? 'S' : ''}</span>
        </div>
        {!steps && <p className="replay__note">Ancienne entrée : les étapes n'étaient pas enregistrées.</p>}
      </div>
      <div className="replay__actions">
        <div className="seg" role="group" aria-label={`Résultat de la draft ${name}`}>
          {RESULTS.map(r => (
            <button key={r.value} aria-pressed={entry.result === r.value} onClick={() => onResult(entry.result === r.value ? null : r.value)}>{r.label}</button>
          ))}
        </div>
        <div className="replay__buttons">
          <button className="btn btn--primary btn--sm" disabled={!steps || busy} onClick={onReplay}>Rejouer</button>
          <button className="btn btn--sm" disabled={!steps || busy} onClick={onExport}>Exporter</button>
          {confirming ? (
            <span className="replay__confirm" role="group" aria-label="Confirmer la suppression">
              <button className="btn btn--sm btn--danger" onClick={onDelete}>Supprimer</button>
              <button className="btn btn--sm btn--ghost" onClick={() => setConfirming(false)}>Garder</button>
            </span>
          ) : (
            <button className="btn btn--sm btn--ghost" aria-label={`Supprimer la draft ${name}`} onClick={() => setConfirming(true)}>Supprimer…</button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function HistoryPage({ onReplay }) {
  const [entries, setEntries] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const stats = useHistoryStore(s => s.stats);
  const loadStats = useHistoryStore(s => s.loadStats);
  const alive = useRef(true);

  async function load() {
    setLoading(true); setError('');
    try { const data = await fetchHistory(); if (alive.current) setEntries(data); }
    catch { if (alive.current) setError('Historique inaccessible. Tu peux toujours importer un replay local.'); }
    finally { if (alive.current) setLoading(false); }
    void loadStats();
  }
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function replay(session) {
    try { const valid = validateReplay(session); useStudioStore.getState().loadReplay(valid.steps, 0, true); onReplay(); }
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
  async function setResult(id, value) {
    try {
      const entry = await updateHistoryResult(id, value);
      if (alive.current) setEntries(items => items.map(e => e.id === id ? { ...e, result: entry.result, notes: entry.notes } : e));
      void loadStats();
    }
    catch { if (alive.current) setError('Résultat non enregistré. Réessaie.'); }
  }
  async function remove(id) {
    try {
      await deleteHistoryEntry(id);
      if (alive.current) setEntries(items => items.filter(e => e.id !== id));
      void loadStats();
    }
    catch (e) { if (alive.current) setError(apiErrorText(e, 'Suppression impossible. Réessaie.')); }
  }

  const summary = statsSummary(stats);
  return (
    <div className="replays">
      <header className="page-head">
        <div>
          <h1 className="page-head__title">Replays</h1>
          <p className="page-head__sub">Rejoue une draft étape par étape, relance l'analyse et teste une variante. Les analyses utilisent les données actuelles ; les étapes gardent les choix observés.</p>
        </div>
        <div className="page-head__aside">
          <button className="btn btn--sm" onClick={load} disabled={loading}>{loading ? 'Chargement…' : 'Actualiser'}</button>
          <label className="btn btn--sm file-btn">
            Importer un replay JSON
            <input type="file" className="visually-hidden" accept=".json,application/json" onChange={importFile}/>
          </label>
          <button className="btn btn--sm" onClick={() => downloadReplay(useDraftStore.getState().exportSession())}>Exporter la draft actuelle</button>
        </div>
      </header>
      <div className="page-body">
        {summary.length > 0 && (
          <dl className="stats">
            {summary.map(s => <div key={s.label} className="stats__item"><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
          </dl>
        )}
        {error && <p className="notice notice--bad" role="alert">{error}</p>}
        {loading && !entries.length && <p className="empty" role="status">Chargement…</p>}
        {!loading && !entries.length && (
          <div className="empty">
            <p className="empty__title">Aucune draft enregistrée</p>
            <p>Utilise « Enregistrer » dans la barre d'état de la draft.</p>
          </div>
        )}
        {entries.length > 0 && (
          <ul className="replay-list">
            {entries.map(entry => (
              <ReplayCard
                key={entry.id}
                entry={entry}
                busy={busyId === entry.id}
                onReplay={() => withTimeline(entry, replay)}
                onExport={() => withTimeline(entry, downloadReplay)}
                onResult={value => setResult(entry.id, value)}
                onDelete={() => remove(entry.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
