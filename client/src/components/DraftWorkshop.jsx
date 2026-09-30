// ─────────────────────────────────────────────
// DraftWorkshop.jsx — comparaison de deux champions, interactions de kits
// ─────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatAdvantage, formatSd } from '../lib/scores';
import { TERM_LABEL, TERM_TECHNICAL } from '../lib/terms';
import { useDraft, useDraftApi } from '../stores/draftContext';
import useUserStore from '../stores/userStore';
import useChampionsStore from '../stores/championsStore';
import useLCUStore from '../stores/lcuStore';
import useDuoStore from '../stores/duoStore';
import { compareChampions, apiErrorText } from '../services/api';

const signed = value => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

export function MechanicsDetails({ rules = [] }) {
  if (!rules.length) return <p className="muted">Aucune interaction spécifique couverte par les règles actuelles dans cette draft.</p>;
  return (
    <ul className="mechanics">
      {rules.map(rule => (
        <li key={rule.id} className="mechanic">
          <strong>{rule.text}</strong>
          <p>{rule.caveat}</p>
          <small>{signed(rule.score_delta)} points de règle · <a href={rule.source_url} target="_blank" rel="noreferrer">Kit du champion</a> · estimation stratégique</small>
        </li>
      ))}
    </ul>
  );
}

/** Two champions in the same draft; with `fixed`, the first one is that pick (live draft). */
export function ComparePanel({ fixed = null }) {
  // Subscribe to the exact inputs of a comparison; whole-store subscriptions made this
  // panel re-render (and re-sort the catalogue) on every LCU tick and pool autosave.
  const draftApi = useDraftApi();
  const revision = useDraft(s => s.revision);
  const myRole = useDraft(s => s.myRole);
  const championPool = useUserStore(s => s.championPool);
  const weightOverrides = useUserStore(s => s.weightOverrides);
  const duoActive = useDuoStore(s => s.duoActive);
  const partnerRole = useDuoStore(s => s.partnerRole);
  const champions = useChampionsStore(s => s.champions);
  const [left, setLeft] = useState(fixed ? String(fixed.id) : '');
  const [right, setRight] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const controller = useRef(null);
  const unavailable = useMemo(() => draftApi.getState().getAllUnavailableIds(), [draftApi, revision]);
  const options = useMemo(() => champions.filter(c => !unavailable.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)), [champions, unavailable]);
  useEffect(() => {
    controller.current?.abort(); setData(null); setError(''); setLoading(false);
    return () => controller.current?.abort();
  }, [revision, championPool, weightOverrides, duoActive, partnerRole, left, right]);
  async function compare() {
    controller.current?.abort();
    const pending = new AbortController(); controller.current = pending;
    setLoading(true); setError(''); setData(null);
    const draft = draftApi.getState();
    const user = useUserStore.getState();
    const partner = useDuoStore.getState().getDuoOptions();
    const summoner = useLCUStore.getState().summoner;
    try {
      const result = await compareChampions({ draft_state: draft.buildDraftState(), champion_pool: user.championPool,
        weight_overrides: user.weightOverrides, champion_ids: [Number(left), Number(right)],
        duo_active: !!partner?.active, duo_partner_role: partner?.partnerRole || null,
        enable_wildcard: user.enableWildcard, enable_off_meta: user.enableOffMeta,
        puuid: summoner?.puuid || null, region: summoner?.region || null,
        rank_bucket: summoner?.rankTier || user.rankTier || null }, pending.signal);
      if (!pending.signal.aborted) setData(result);
    } catch (e) {
      if (!pending.signal.aborted) setError(apiErrorText(e, 'Comparaison indisponible. Réessaie.'));
    } finally { if (!pending.signal.aborted) setLoading(false); }
  }
  const blocked = loading || !left || !right || left === right || unavailable.has(Number(left)) || unavailable.has(Number(right));
  return (
    <div className="compare">
      <p className="muted">{fixed
        ? `Même draft, même rôle, mêmes préférences. Choisis le champion à mettre face à ${fixed.name}.`
        : 'Même draft, même rôle, mêmes préférences. Choisis deux alternatives disponibles.'}</p>
      <div className="compare__controls">
        {(fixed ? [['Comparer avec', right, setRight]] : [['Champion A', left, setLeft], ['Champion B', right, setRight]]).map(([label, value, setter]) => (
          <label key={label} className="compare__field">
            <span className="field-label">{label}</span>
            <select className="select" aria-label={label} value={value} onChange={e => setter(e.target.value)}>
              <option value="">Choisir…</option>
              {options.filter(c => !fixed || c.id !== fixed.id).map(c => <option value={c.id} key={c.id}>{c.name}{c.roles?.includes(myRole) ? '' : ' · autre rôle'}</option>)}
            </select>
          </label>
        ))}
        <button className="btn btn--primary" onClick={compare} disabled={blocked}>{loading ? 'Comparaison…' : 'Comparer'}</button>
      </div>
      {error && <p className="notice notice--bad" role="alert">{error}</p>}
      {data && (
        <div className="compare__result" aria-live="polite">
          <h4 className="compare__verdict">
            {data.tied ? 'Choix équivalents : l’écart est sous l’incertitude' : `${data.score_delta > 0 ? data.left.champion_name : data.right.champion_name} est préféré de ${Math.abs(data.score_delta).toFixed(1)} points de win rate`}
          </h4>
          <div className="compare__table">
            <table className="data-table">
              <thead><tr><th scope="col">Critère</th><th scope="col">{data.left.champion_name}</th><th scope="col">{data.right.champion_name}</th><th scope="col">A − B</th></tr></thead>
              <tbody>
                {data.dimensions.map(d => (
                  <tr key={d.dimension}>
                    <th scope="row" title={TERM_TECHNICAL[d.dimension] || d.dimension}>{TERM_LABEL[d.dimension] || d.dimension}</th>
                    <td>{d.left.toFixed(1)}</td><td>{d.right.toFixed(1)}</td><td>{signed(d.delta)}</td>
                  </tr>
                ))}
                <tr className="compare__total">
                  <th scope="row">Avantage</th>
                  <td>{formatAdvantage(data.left.total_score)} {formatSd(data.left.score_sd)}</td>
                  <td>{formatAdvantage(data.right.total_score)} {formatSd(data.right.score_sd)}</td>
                  <td>{signed(data.score_delta)} (incertitude {formatSd(data.combined_sd)})</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted">{data.explanation}</p>
          <p className={data.wpa_delta_pp == null ? 'notice notice--warn' : 'notice'}>
            {data.wpa_delta_pp == null ? 'WPA indisponible : pas de modèle validé ou trop peu de contexte.' : `WPA estimé DALIA : ${signed(data.wpa_delta_pp)} points de probabilité pour A par rapport à B. Ce n'est pas une mesure Coachless.`}
          </p>
          <div className="compare__sides">
            {[data.left, data.right].map(rec => (
              <section key={rec.champion_id} className="compare__side">
                <h5>{rec.champion_name}</h5>
                <p className="lbl">Méta : {rec.meta_games ? `${rec.meta_games.toLocaleString('fr-FR')} parties · ${rec.meta_window === 'current' ? 'patch courant' : '30 derniers jours'}` : 'échantillon indisponible'}</p>
                {rec.verdict && <p className="compare__side-verdict">{rec.verdict}</p>}
                <MechanicsDetails rules={rec.mechanics}/>
                {rec.reasons.length > 0 && <ul className="compare__reasons">{rec.reasons.map((r, i) => <li key={i}>{r.text}</li>)}</ul>}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
