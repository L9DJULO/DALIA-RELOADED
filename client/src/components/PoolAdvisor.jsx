import React, { useEffect, useRef, useState } from 'react';
import useUserStore from '../stores/userStore';
import { fetchPoolAdvice, apiErrorText } from '../services/api';
import { ROLE_LABEL } from '../data/mock';

export default function PoolAdvisor({ role }) {
  const championPool = useUserStore(s => s.championPool);
  const profileAvailable = useUserStore(s => s.profileAvailable);
  const userLoading = useUserStore(s => s.loading);
  const addToPool = useUserStore(s => s.addToPool);
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const request = useRef(null);
  // Only a role change resets the advice: adding a suggested champion must keep the
  // other suggestions on screen so several can be added in a row.
  useEffect(() => { request.current?.abort(); setData(null); setLoading(false); setError(''); return () => request.current?.abort(); }, [role]);
  const inPool = id => (championPool[role] || []).some(e => e.champion_id === id);
  async function analyze() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    try { const result = await fetchPoolAdvice(role, championPool, controller.signal); if (!controller.signal.aborted) setData(result); }
    catch (e) { if (!controller.signal.aborted) setError(apiErrorText(e, 'Analyse du pool indisponible. Réessaie.')); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return (
    <details className="disclosure pool-advisor">
      <summary>Améliorer mon pool {ROLE_LABEL[role] || role}</summary>
      <div className="disclosure__body">
        <p className="muted">Cherche un champion qui apporte de nouvelles réponses de draft.</p>
        <div><button className="btn btn--sm" onClick={analyze} disabled={loading || userLoading}>{loading ? 'Analyse…' : 'Identifier les manques'}</button></div>
        {error && <p className="notice notice--bad" role="alert">{error}</p>}
        {data && (
          <div className="advice" aria-live="polite">
            <p><strong>Déjà couvert :</strong> {data.covered.join(', ') || 'aucun outil renseigné'}</p>
            <p><strong>Options manquantes :</strong> {data.gaps.join(', ') || 'ton pool couvre les dimensions étudiées'}</p>
            <ul className="advice__list">
              {data.suggestions.map(c => (
                <li key={c.champion_id} className="advice__item">
                  <h4>{c.champion_name}</h4>
                  <p>{c.reason}</p>
                  <ol>{c.learning_plan.map(step => <li key={step}>{step}</li>)}</ol>
                  {inPool(c.champion_id)
                    ? <p className="muted">Ajouté au pool. Relance l'analyse pour recalculer les manques.</p>
                    : <button className="btn btn--sm" disabled={!profileAvailable} onClick={() => addToPool(role, { id: c.champion_id, key: c.champion_key }, 'D')}>Ajouter au niveau D — à apprendre</button>}
                </li>
              ))}
            </ul>
            <p className="muted">{data.method} {data.note}</p>
          </div>
        )}
      </div>
    </details>
  );
}
