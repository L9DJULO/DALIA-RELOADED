import React, { useEffect, useRef, useState } from 'react';
import useDraftStore from '../stores/draftStore';
import useUserStore from '../stores/userStore';
import useChampionsStore from '../stores/championsStore';
import useLCUStore from '../stores/lcuStore';
import useDuoStore from '../stores/duoStore';
import { compareChampions, saveHistoryEntry } from '../services/api';
import { historyPayload } from '../lib/replay';
import '../workshop.css';

const DIMENSIONS = { meta: 'Méta', matchup: 'Matchups', synergy: 'Synergies', composition: 'Composition', mastery: 'Maîtrise', draft_risk: 'Sécurité du pick', mechanics: 'Interactions de kits', wpa_adjustment: 'Ajustement WPA' };
const signed = value => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

export function MechanicsDetails({ rules = [] }) {
  if (!rules.length) return <p className="muted">Aucune interaction spécifique couverte par les règles actuelles dans cette draft.</p>;
  return <div className="mechanics-list">{rules.map(rule => <article key={rule.id}>
    <strong>{rule.text}</strong>
    <p>{rule.caveat}</p>
    <small>{signed(rule.score_delta)} points de règle · <a href={rule.source_url} target="_blank" rel="noreferrer">Kit du champion</a> · estimation stratégique</small>
  </article>)}</div>;
}

export function ComparePanel() {
  const draft = useDraftStore();
  const user = useUserStore();
  const duo = useDuoStore();
  const champions = useChampionsStore(s => s.champions);
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const controller = useRef(null);
  const unavailable = draft.getAllUnavailableIds();
  const options = champions.filter(c => !unavailable.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  useEffect(() => {
    controller.current?.abort(); setData(null); setError(''); setLoading(false);
    return () => controller.current?.abort();
  }, [draft.revision, user.championPool, user.weightOverrides, duo.duoActive, duo.partnerRole, left, right]);
  async function compare() {
    controller.current?.abort();
    const pending = new AbortController(); controller.current = pending;
    setLoading(true); setError(''); setData(null);
    const partner = duo.getDuoOptions();
    const summoner = useLCUStore.getState().summoner;
    try {
      const result = await compareChampions({ draft_state: draft.buildDraftState(), champion_pool: user.championPool,
        weight_overrides: user.weightOverrides, champion_ids: [Number(left), Number(right)],
        duo_active: !!partner?.active, duo_partner_role: partner?.partnerRole || null,
        duo_partner_pool: partner?.partnerPool || null,
        enable_wildcard: user.enableWildcard, enable_off_meta: user.enableOffMeta,
        puuid: summoner?.puuid || null, region: summoner?.region || null }, pending.signal);
      if (!pending.signal.aborted) setData(result);
    } catch (e) {
      if (!pending.signal.aborted) setError(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Comparaison indisponible. Réessaie.');
    } finally { if (!pending.signal.aborted) setLoading(false); }
  }
  return <section className="workshop">
    <h3>Comparer deux champions</h3>
    <p className="muted">Même draft, même rôle, mêmes préférences. Choisis deux alternatives disponibles.</p>
    <div className="controls">
      {[['Champion A', left, setLeft], ['Champion B', right, setRight]].map(([label, value, setter]) =>
        <label key={label}>{label}<select aria-label={label} value={value} onChange={e => setter(e.target.value)}>
          <option value="">Choisir…</option>{options.map(c => <option value={c.id} key={c.id}>{c.name}{c.roles?.includes(draft.myRole) ? '' : ' · autre rôle'}</option>)}
        </select></label>)}
      <button onClick={compare} disabled={loading || !left || !right || left === right || unavailable.has(Number(left)) || unavailable.has(Number(right))}>{loading ? 'Comparaison…' : 'Comparer'}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {data && <div aria-live="polite">
      <h4>{Math.abs(data.score_delta) < 0.1 ? 'Choix équivalents au score affiché' : `${data.score_delta > 0 ? data.left.champion_name : data.right.champion_name} est préféré de ${Math.abs(data.score_delta).toFixed(1)} points`}</h4>
      <table><thead><tr><th>Critère</th><th>{data.left.champion_name}</th><th>{data.right.champion_name}</th><th>A − B</th></tr></thead><tbody>
        {data.dimensions.map(d => <tr key={d.dimension}><th>{DIMENSIONS[d.dimension]}</th><td>{d.left.toFixed(1)}</td><td>{d.right.toFixed(1)}</td><td>{signed(d.delta)}</td></tr>)}
        <tr><th>Score final</th><td>{data.left.total_score}</td><td>{data.right.total_score}</td><td>{signed(data.score_delta)}</td></tr>
      </tbody></table>
      <p className="muted">{data.explanation}</p>
      <p>{data.wpa_delta_pp == null ? 'WPA indisponible : pas de modèle validé ou trop peu de contexte.' : `WPA estimé DALIA : ${signed(data.wpa_delta_pp)} points de probabilité pour A par rapport à B. Ce n'est pas une mesure Coachless.`}</p>
      {[data.left, data.right].map(rec => <section key={rec.champion_id}><h4>{rec.champion_name}</h4>
        <p className="muted">Méta : {rec.meta_games ? `${rec.meta_games.toLocaleString('fr-FR')} matchs · ${rec.meta_window === 'current' ? 'patch courant' : '30 derniers jours'}` : 'échantillon indisponible'}</p>
        <p>{rec.verdict}</p><MechanicsDetails rules={rec.mechanics}/>
        {rec.reasons.map((r, i) => <p key={i}>{r.text}</p>)}
      </section>)}
    </div>}
  </section>;
}

export default function DraftWorkshop() {
  const draft = useDraftStore();
  const connected = useLCUStore(s => s.connected);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true); setMessage('');
    try { await saveHistoryEntry(historyPayload(draft)); setMessage('Draft enregistrée dans Replays.'); }
    catch { setMessage('Enregistrement impossible. Réessaie.'); }
    finally { setSaving(false); }
  }
  return <div className="workshop draft-tools">
    <div className="controls">
      <label>Mode<select value={draft.mode} onChange={e => draft.setMode(e.target.value)}>
        <option value="live">League en direct</option><option value="manual">Manuel</option>
        {draft.mode === 'replay' && <option value="replay">Replay</option>}
      </select></label>
      <label>Ordre dans ton équipe<select aria-label="Ordre du pick" value={draft.myPickOrder} disabled={draft.mode === 'live'} onChange={e => draft.setMyPickOrder(e.target.value)}>
        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
      </select></label>
      <button onClick={draft.undo} disabled={!draft.undoStack.length || draft.mode === 'live'}>Annuler</button>
      <button onClick={() => { draft.resetDraft('manual'); setMessage(''); }}>Nouvelle draft</button>
      <button onClick={save} disabled={saving || !draft.timeline.length}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
    </div>
    {draft.mode === 'live' && !connected && <p className="muted">En attente du client League. Le mode manuel reste disponible.</p>}
    {draft.stale && <p role="status">La draft a changé : relance l’analyse pour actualiser les conseils.</p>}
    {message && <p role="status">{message}</p>}
    {draft.mode === 'replay' && <div className="controls">
      <button disabled={draft.replayPosition <= 0} onClick={() => draft.loadReplay(draft.timeline, draft.replayPosition - 1)}>Étape précédente</button>
      <span>Étape {(draft.replayPosition ?? 0) + 1} / {draft.timeline.length}</span>
      <button disabled={draft.replayPosition >= draft.timeline.length - 1} onClick={() => draft.loadReplay(draft.timeline, draft.replayPosition + 1)}>Étape suivante</button>
      <button onClick={draft.forkReplay}>Tester une variante</button>
    </div>}
    {draft.dataStatus && <p className="muted">Patch {draft.dataStatus.patch} · {draft.dataStatus.rank} {draft.dataStatus.meta_collected_at ? `· collecte ${new Date(draft.dataStatus.meta_collected_at * 1000).toLocaleString('fr-FR')}` : ''} · {draft.dataStatus.meta_available ? 'Statistiques disponibles' : 'Statistiques absentes : analyse des kits uniquement'}{draft.dataStatus.source_errors?.length ? ' · Source dégradée' : ''} · {draft.dataStatus.wpa_available ? 'WPA estimé DALIA' : 'WPA indisponible'}</p>}
    <details><summary>Comparer deux champions</summary><ComparePanel/></details>
  </div>;
}
