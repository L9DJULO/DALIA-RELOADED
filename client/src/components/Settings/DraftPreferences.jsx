import React, { useState } from 'react';
import useUserStore from '../../stores/userStore';
import '../../workshop.css';
const DEFAULTS = { meta: .07, matchup: .47, synergy: .07, composition: .13, mastery: .17, draft_risk: .08 };
const LABELS = { meta: 'Méta', matchup: 'Matchups', synergy: 'Synergies', composition: 'Composition', mastery: 'Maîtrise', draft_risk: 'Sécurité du pick' };
export default function DraftPreferences() {
  const user = useUserStore();
  const [weights, setWeights] = useState({ ...DEFAULTS, ...user.weightOverrides });
  const [saving, setSaving] = useState(false);
  const save = async settings => { setSaving(true); await user.updatePreferences(settings); setSaving(false); };
  return <section className="workshop">
    <h3>Préférences de draft</h3>
    <label><span><input type="checkbox" checked={user.enableWildcard} disabled={saving || !user.profileAvailable} onChange={e => save({ enable_wildcard: e.target.checked })}/> Proposer des champions hors de mon pool</span></label>
    <label><span><input type="checkbox" checked={user.enableOffMeta} disabled={saving || !user.profileAvailable} onChange={e => save({ enable_off_meta: e.target.checked })}/> Autoriser mes choix dans un rôle inhabituel</span></label>
    <details><summary>Pondération des critères</summary><p>Les poids sont normalisés ensemble puis adaptés au contexte de draft.</p>
      {Object.entries(weights).map(([key, value]) => <label key={key}>{LABELS[key]} · {Math.round(value * 100)}
        <input aria-label={`Poids ${LABELS[key]}`} type="range" min="0" max="1" step="0.01" value={value} onChange={e => setWeights(w => ({ ...w, [key]: Number(e.target.value) }))}/>
      </label>)}
      <div className="controls"><button disabled={saving || !user.profileAvailable || Object.values(weights).every(v => !v)} onClick={() => save({ weight_overrides: weights })}>Enregistrer les poids</button>
        <button disabled={saving || !user.profileAvailable} onClick={() => { setWeights(DEFAULTS); save({ weight_overrides: null }); }}>Valeurs par défaut</button></div>
    </details>
    {user.error && <p role="alert">{user.error}</p>}
  </section>;
}
