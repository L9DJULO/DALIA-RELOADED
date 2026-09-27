import React, { useId, useState } from 'react';
import useUserStore from '../../stores/userStore';
import { SectionLbl } from '../Primitives';

const DEFAULTS = { meta: 1, matchup: 1, synergy: 1, composition: 1, mastery: 1, draft_risk: 1 };
const LABELS = { meta: 'Force sur le patch', matchup: 'Contre leurs picks', synergy: 'Synergie alliés', composition: 'Équilibre de la compo', mastery: 'Ta maîtrise', draft_risk: 'Risque de counter' };
const RANKS = [['', 'Automatique (League) ou inconnu'], ['iron', 'Fer'], ['bronze', 'Bronze'], ['silver', 'Argent'], ['gold', 'Or'], ['platinum', 'Platine'], ['emerald', 'Émeraude'], ['diamond', 'Diamant'], ['master_plus', 'Maître et plus']];
const times = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DraftPreferences({ n }) {
  const user = useUserStore();
  const [weights, setWeights] = useState({ ...DEFAULTS, ...user.weightOverrides });
  const [saving, setSaving] = useState(false);
  const rankId = useId();
  const save = async settings => { setSaving(true); await user.updatePreferences(settings); setSaving(false); };
  const locked = saving || !user.profileAvailable;
  return (
    <section className="panel prefs">
      <SectionLbl n={n}>Préférences de draft</SectionLbl>
      <label className="check">
        <input type="checkbox" checked={user.enableWildcard} disabled={locked} onChange={e => save({ enable_wildcard: e.target.checked })}/>
        Proposer des champions hors de mon pool
      </label>
      <label className="check">
        <input type="checkbox" checked={user.enableOffMeta} disabled={locked} onChange={e => save({ enable_off_meta: e.target.checked })}/>
        Autoriser mes choix dans un rôle inhabituel
      </label>
      <div className="prefs__rank">
        <label className="field-label" htmlFor={rankId}>Mon rang</label>
        <select id={rankId} className="select" aria-label="Mon rang" value={user.rankTier || ''} disabled={locked} onChange={e => save({ rank_tier: e.target.value || null })}>
          {RANKS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <p className="muted">Le rang détecté par League a priorité. Il choisit les statistiques de ton niveau et le poids du confort.</p>
      </div>
      <details className="disclosure">
        <summary>Importance des critères</summary>
        <div className="disclosure__body">
          <p className="muted">Chaque critère est une contribution en points de win rate ; ces multiplicateurs (×0,5 à ×1,5) l'amplifient ou l'atténuent.</p>
          {Object.entries(weights).map(([key, value]) => (
            <label key={key} className="prefs__weight">
              <span className="prefs__weight-lbl">{LABELS[key]}<span className="num">×{times.format(Number(value))}</span></span>
              <input className="range" aria-label={`Importance ${LABELS[key]}`} type="range" min="0.5" max="1.5" step="0.05" value={value}
                onChange={e => setWeights(w => ({ ...w, [key]: Number(e.target.value) }))}/>
            </label>
          ))}
          <div className="prefs__actions">
            <button className="btn btn--sm btn--primary" disabled={locked} onClick={() => save({ weight_overrides: weights })}>Enregistrer</button>
            <button className="btn btn--sm btn--ghost" disabled={locked} onClick={() => { setWeights(DEFAULTS); save({ weight_overrides: null }); }}>Valeurs par défaut</button>
          </div>
        </div>
      </details>
      {user.error && <p className="notice notice--bad" role="alert">{user.error}</p>}
    </section>
  );
}
