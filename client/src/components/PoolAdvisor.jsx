import React, { useEffect, useRef, useState } from 'react';
import useUserStore from '../stores/userStore';
import { fetchPoolAdvice } from '../services/api';
import '../workshop.css';

export default function PoolAdvisor({ role }) {
  const user = useUserStore();
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const request = useRef(null);
  useEffect(() => { request.current?.abort(); setData(null); setLoading(false); setError(''); return () => request.current?.abort(); }, [role, user.championPool]);
  async function analyze() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    try { const result = await fetchPoolAdvice(role, user.championPool, controller.signal); if (!controller.signal.aborted) setData(result); }
    catch { if (!controller.signal.aborted) setError('Analyse du pool indisponible. Réessaie.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return <details className="workshop pool-advisor"><summary>Améliorer mon pool {role}</summary>
    <p>Cherche un champion qui apporte de nouvelles réponses de draft.</p>
    <button onClick={analyze} disabled={loading || user.loading}>{loading ? 'Analyse…' : 'Identifier les manques'}</button>
    {error && <p role="alert">{error}</p>}
    {data && <div aria-live="polite">
      <p><strong>Déjà couvert :</strong> {data.covered.join(', ') || 'aucun outil renseigné'}</p>
      <p><strong>Options manquantes :</strong> {data.gaps.join(', ') || 'ton pool couvre les dimensions étudiées'}</p>
      {data.suggestions.map(c => <article key={c.champion_id}><h4>{c.champion_name}</h4><p>{c.reason}</p>
        <ol>{c.learning_plan.map(step => <li key={step}>{step}</li>)}</ol>
        <button disabled={!user.profileAvailable} onClick={() => user.addToPool(role, { id: c.champion_id, key: c.champion_key }, 'D')}>Ajouter au niveau D — à apprendre</button>
      </article>)}
      <p className="muted">{data.method} {data.note}</p>
    </div>}
  </details>;
}
