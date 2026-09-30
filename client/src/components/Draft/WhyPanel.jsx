// ─────────────────────────────────────────────
// WhyPanel.jsx — colonne droite : pourquoi ce pick
// Raisons du moteur, termes groupés, lane, interactions de kits, comparaison.
// ─────────────────────────────────────────────
import React from 'react';
import { useDraft, useIsStudio } from '../../stores/draftContext';
import useLCUStore from '../../stores/lcuStore';
import { shortlist, champIcon } from '../../data/mock';
import { ReasonItem } from '../Primitives';
import { ComparePanel, MechanicsDetails } from '../DraftWorkshop';
import { WhyEmpty } from './DraftStates';
import { formatAdvantage, formatSd } from '../../lib/scores';
import { groupTerms, termBar, TERM_SOURCE_LABEL } from '../../lib/terms';
import { showBanAdvice, synergyNote } from '../../lib/draftView';

const pct = n => `${n.toFixed(1).replace('.', ',')} %`;

// ── Bans conseillés (phase de ban seulement) ────
function BanAdvice() {
  const suggestions = useDraft(s => s.banSuggestions);
  const mode = useDraft(s => s.mode);
  const allyPicks = useDraft(s => s.allyPicks);
  const enemyPicks = useDraft(s => s.enemyPicks);
  const actionType = useLCUStore(s => s.currentActionType);
  const pickCount = Object.values(allyPicks).filter(Boolean).length + enemyPicks.filter(Boolean).length;
  if (!suggestions?.length || !showBanAdvice({ mode, actionType, pickCount })) return null;
  return (
    <section className="why__block" aria-labelledby="ban-advice">
      <h3 id="ban-advice" className="why__h">Bans conseillés</h3>
      <ul className="ban-advice">
        {suggestions.slice(0, 3).map(b => (
          <li key={b.champion_id} className="ban-sug">
            <img src={champIcon(b.champion_key)} alt="" width="28" height="28"/>
            <span className="ban-sug__txt">
              <span className="ban-sug__name">{b.champion_name}</span>
              <span className="ban-sug__why" title={b.reason}>{b.reason}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Un terme : barre signée, texture selon la source, moustache ±σ ──
function TermRow({ term }) {
  const bar = termBar(term.value, term.sd);
  const source = TERM_SOURCE_LABEL[term.source] || term.source;
  const detail = [term.technical, source, term.sample ? `${term.sample.toLocaleString('fr-FR')} parties` : '', term.note].filter(Boolean).join(' · ');
  return (
    <div className="term" title={detail}>
      <span className="term__label">
        <span className="term__name">{term.label}</span>
        {term.note && <small>{term.note}</small>}
      </span>
      <span className="term__bar" aria-hidden="true">
        <i className="term__zero"/>
        {bar.width > 0 && <i className={`term__fill term__fill--${bar.side} ${term.estimated ? 'is-est' : ''}`} style={{ left: `${bar.left}%`, width: `${bar.width}%` }}/>}
        {bar.whiskerWidth > 0 && <i className="term__whisker" style={{ left: `${bar.whiskerLeft}%`, width: `${bar.whiskerWidth}%` }}/>}
      </span>
      <span className={`term__value term__value--${bar.side}`}>
        {formatAdvantage(term.value)} <small>{formatSd(term.sd)}</small>
      </span>
    </div>
  );
}

function TermGroups({ terms }) {
  const groups = groupTerms(terms);
  if (!groups.length) return <p className="muted">Pas de détail des termes pour ce pick.</p>;
  return (
    <div className="terms">
      {groups.map(g => (
        <div key={g.id} className="term-fam" role="group" aria-label={g.label}>
          <h4>{g.label}</h4>
          {g.terms.map(t => <TermRow key={t.name} term={t}/>)}
        </div>
      ))}
    </div>
  );
}

// ── Lane et alliés ──────────────────────────────
function Lane({ pick }) {
  if (!pick.matchups.length && !pick.synergies.length) return null;
  return (
    <section className="why__block" aria-labelledby="lane-h">
      <h3 id="lane-h" className="why__h">Face à eux, avec eux</h3>
      <ul className="lane">
        {pick.matchups.map((m, i) => {
          const tone = m.delta > 0 ? 'pos' : m.delta < 0 ? 'neg' : 'zero';
          return (
            <li key={`m${i}`} className={`mu ${m.isLane ? 'mu--lane' : ''}`}
              title={m.games ? `${m.games} parties · rôle en lane estimé à ${Math.round(m.laneProbability * 100)} %` : 'Estimation du kit, aucune partie observée'}>
              <span className="mu__who">{m.isLane && <span className="mu__lane" aria-label="adversaire de lane">⚔</span>}{m.name}</span>
              <b className={`mu__v mu__v--${tone}`}>{formatAdvantage(m.delta)}</b>
              <small>{m.games && m.wr != null ? `${pct(m.wr)} · ${m.games.toLocaleString('fr-FR')}` : 'pts kit'}</small>
            </li>
          );
        })}
        {pick.synergies.map((s, i) => {
          const note = synergyNote(s);
          return (
            <li key={`s${i}`} className="mu mu--ally" title={note.title}>
              <span className="mu__who"><span className="mu__lane" aria-label="allié">⟳</span>{s.name}</span>
              <b className={`mu__v mu__v--${s.delta > 0 ? 'pos' : s.delta < 0 ? 'neg' : 'zero'}`}>{formatAdvantage(s.delta)}</b>
              <small>{note.label}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function WhyPanel({ selected }) {
  const recommendations = useDraft(s => s.recommendations);
  const studio = useIsStudio();
  const hasRecs = recommendations.length > 0;
  const picks = shortlist(recommendations);
  const pick = picks[selected] || picks[0];

  return (
    <div className="why">
      <BanAdvice/>
      {hasRecs ? (
        <>
          <section className="why__block" aria-labelledby="why-title">
            <h2 id="why-title" className="why__title">
              Pourquoi {pick.name}
              <span className="lbl">{pick.reasons.length} raison{pick.reasons.length > 1 ? 's' : ''} · {pick.terms.length} terme{pick.terms.length > 1 ? 's' : ''}</span>
            </h2>
            {pick.reasons.length > 0
              ? <ul className="reasons">{pick.reasons.map((r, i) => <ReasonItem key={i} reason={r}/>)}</ul>
              : <p className="muted">Le moteur n'a pas donné de raison textuelle pour ce pick.</p>}
          </section>
          <section className="why__block" aria-labelledby="terms-h">
            <div className="why__head">
              <h3 id="terms-h" className="why__h">Ce qui pèse</h3>
              <p className="legend" aria-label="Légende">
                <span><i className="legend__obs"/>mesuré</span>
                <span><i className="legend__est"/>estimé</span>
                <span><i className="legend__sd"/>±σ</span>
              </p>
            </div>
            <TermGroups terms={pick.terms}/>
          </section>
          <Lane pick={pick}/>
          <section className="why__block" aria-labelledby="kits-h">
            <h3 id="kits-h" className="why__h">Interactions de kits</h3>
            <MechanicsDetails rules={pick.mechanics}/>
          </section>
        </>
      ) : <WhyEmpty/>}
      {studio ? (
        <details className="disclosure compare-disclosure">
          <summary>Comparer deux champions</summary>
          <div className="disclosure__body"><ComparePanel/></div>
        </details>
      ) : hasRecs && (
        <details className="disclosure compare-disclosure">
          <summary>Comparer {pick.name} avec un autre champion</summary>
          <div className="disclosure__body"><ComparePanel key={pick.id} fixed={pick}/></div>
        </details>
      )}
    </div>
  );
}
