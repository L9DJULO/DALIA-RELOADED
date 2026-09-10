import React, { useState } from 'react';
import useUserStore from '../../stores/userStore';
import '../../workshop.css';
const DEFAULTS = { meta: 1, matchup: 1, synergy: 1, composition: 1, mastery: 1, draft_risk: 1 };
const LABELS = { meta: 'Méta', matchup: 'Matchups', synergy: 'Synergies', composition: 'Composition', mastery: 'Maîtrise', draft_risk: 'Adversaire à venir' };
const RANKS = [['', 'Automatique (League) ou inconnu'], ['iron', 'Fer'], ['bronze', 'Bronze'], ['silver', 'Argent'], ['gold', 'Or'], ['platinum', 'Platine'], ['emerald', 'Émeraude'], ['diamond', 'Diamant'], ['master_plus', 'Maître et plus']];
export default function DraftPreferences() {
  const user = useUserStore();
  const [weights, setWeights] = useState({ ...DEFAULTS, ...user.weightOverrides });
  const [saving, setSaving] = useState(false);
  const save = async settings => { setSaving(true); await user.updatePreferences(settings); setSaving(false); };
  return <section className="workshop">
    <h3>Préférences de draft</h3>
    <label><span><input type="checkbox" checked={user.enableWildcard} disabled={saving || !user.profileAvailable} onChange={e => save({ enable_wildcard: e.target.checked })}/> Proposer des champions hors de mon pool</span></label>
    <label><span><input type="checkbox" checked={user.enableOffMeta} disabled={saving || !user.profileAvailable} onChange={e => save({ enable_off_meta: e.target.checked })}/> Autoriser mes choix dans un rôle inhabituel</span></label>
    <label>Mon rang<select aria-label="Mon rang" value={user.rankTier || ''} disabled={saving || !user.profileAvailable} onChange={e => save({ rank_tier: e.target.value || null })}>
      {RANKS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <p className="muted">Le rang détecté par League a priorité. Il choisit les statistiques de ton niveau et le poids du confort.</p>
    <details><summary>Importance des critères</summary><p>Chaque critère est une contribution en points de win rate ; ces multiplicateurs (×0,5 à ×1,5) l'amplifient ou l'atténuent.</p>
      {Object.entries(weights).map(([key, value]) => <label key={key}>{LABELS[key]} · ×{Number(value).toFixed(2)}
        <input aria-label={`Importance ${LABELS[key]}`} type="range" min="0.5" max="1.5" step="0.05" value={value} onChange={e => setWeights(w => ({ ...w, [key]: Number(e.target.value) }))}/>
      </label>)}
      <div className="controls"><button disabled={saving || !user.profileAvailable} onClick={() => save({ weight_overrides: weights })}>Enregistrer</button>
        <button disabled={saving || !user.profileAvailable} onClick={() => { setWeights(DEFAULTS); save({ weight_overrides: null }); }}>Valeurs par défaut</button></div>
    </details>
    {user.error && <p role="alert">{user.error}</p>}
  </section>;
}
