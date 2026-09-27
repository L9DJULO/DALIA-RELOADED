// ─────────────────────────────────────────────
// DraftStates.jsx — avant analyse, analyse en cours, conseils périmés
// ─────────────────────────────────────────────
import React from 'react';
import useDraftStore from '../../stores/draftStore';
import useUserStore from '../../stores/userStore';
import useChampionsStore from '../../stores/championsStore';
import { ROLE_LABEL } from '../../data/mock';
import { Portrait, TierBadge } from '../Primitives';

const TIER_ORDER = ['S', 'A', 'B', 'C', 'D'];

/** Names joined the French way: "Syndra", "Syndra et Lee Sin", "A, B et C". */
function frenchList(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
}

// ── Avant la première analyse ───────────────────
export function BeforeAnalysis() {
  const myRole = useDraftStore(s => s.myRole);
  const myPickOrder = useDraftStore(s => s.myPickOrder);
  const enemyPicks = useDraftStore(s => s.enemyPicks);
  const pool = useUserStore(s => s.championPool[myRole] || []);
  const byId = useChampionsStore(s => s.byId);
  const entries = [...pool].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)).slice(0, 8);
  const enemies = enemyPicks.filter(Boolean).map(c => c.name);

  return (
    <div className="before">
      <p className="lbl">Avant analyse</p>
      <h2 className="before__title">Ton pool {ROLE_LABEL[myRole]}</h2>
      {entries.length > 0 ? (
        <ul className="before__pool">
          {entries.map(e => {
            const champ = byId[e.champion_id] || { key: e.champion_key, name: e.champion_key };
            return (
              <li key={e.champion_id} className="before__champ" title={champ.name}>
                <Portrait champ={champ} size={48}/>
                <TierBadge tier={e.tier}/>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="notice notice--warn">Aucun champion dans ton pool pour ce rôle : l'analyse proposera toute la méta.</p>
      )}
      <p className="before__text">
        Tu picks en {(myPickOrder || 1) === 1 ? '1ʳᵉ' : `${myPickOrder}ᵉ`} position.
        {enemies.length > 0 && <> {frenchList(enemies)} {enemies.length > 1 ? 'sont' : 'est'} déjà en face.</>}
      </p>
      <p className="before__hint">
        Complète la draft dans le bandeau, puis lance <b>ANALYSER</b> ou appuie sur <span className="kbd">Entrée</span>.
      </p>
    </div>
  );
}

// ── Première analyse en cours ───────────────────
export function AnalysisSkeleton() {
  return (
    <div className="skeleton" role="status" aria-label="Analyse en cours">
      <div className="skel skeleton__hero"/>
      <div className="skel skeleton__line"/>
      <div className="skel skeleton__line skeleton__line--short"/>
      {[0, 1, 2, 3].map(i => <div key={i} className="skel skeleton__row" style={{ opacity: 1 - i * 0.18 }}/>)}
    </div>
  );
}

// ── Conseils périmés ────────────────────────────
export function StaleBanner() {
  const loading = useDraftStore(s => s.loading);
  return (
    <div className="banner banner--warn stale-banner" role="status">
      <span>La draft a changé : relance l'analyse pour actualiser les conseils.</span>
      <button className="btn btn--sm" disabled={loading} onClick={() => useDraftStore.getState().getRecommendations()}>
        {loading ? 'Analyse…' : 'Relancer'}
      </button>
    </div>
  );
}

// ── Colonne « Pourquoi » avant analyse ──────────
export function WhyEmpty() {
  return (
    <div className="why-empty">
      <p className="lbl">Pourquoi</p>
      <p>Après l'analyse, cette colonne explique le pick sélectionné : les raisons du moteur, puis ce qui pèse pour et contre lui.</p>
      <ul className="why-empty__tips">
        <li>Clique sur un emplacement du bandeau pour saisir un champion ; tape son nom puis <span className="kbd">Entrée</span>.</li>
        <li>Les hachures signalent une estimation : bande d'incertitude, terme estimé, emplacement vide.</li>
      </ul>
    </div>
  );
}
