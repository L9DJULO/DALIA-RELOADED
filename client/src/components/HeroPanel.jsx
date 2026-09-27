// ─────────────────────────────────────────────
// HeroPanel.jsx — colonne gauche de la draft
// · Héros : le pick sélectionné, son avantage et son incertitude
// · Shortlist : un intervalle ±σ par pick, groupe de tête encadré
// ─────────────────────────────────────────────
import React from 'react';
import { champSplash, SHORTLIST, hasPoolForCurrentRole } from '../data/mock';
import { Portrait, Tag, tagLabel } from './Primitives';
import { StaleBanner } from './Draft/DraftStates';
import useDraftStore from '../stores/draftStore';
import { formatAdvantage, formatSd } from '../lib/scores';
import { heroNameSize, intervalGeometry, intervalScale } from '../lib/terms';
import { groupPeer, topGroupSize } from '../lib/draftView';

// ── Héros ──────────────────────────────────────
function Hero({ pick, idx, total, peer }) {
  return (
    <div key={idx} className="hero anim-hero-enter" style={{ backgroundImage: `url(${champSplash(pick.key)})` }}>
      <div className="hero__top">
        <span className="hero__flag">RECO {idx + 1} / {total}</span>
        <span className="hero__tags">
          {pick.tags.map(t => <Tag key={t} tag={t}/>)}
          {!pick.inPool && <span className="tag tag--warn">HORS POOL</span>}
        </span>
      </div>
      <div className="hero__bottom">
        <h2 className="hero__name anim-name-enter" style={{ '--hero-name': `${heroNameSize(pick.name)}px` }}>{pick.name}</h2>
        {pick.verdict && <p className="hero__verdict">{pick.verdict}</p>}
        <div className="hero__scoreline anim-score-enter">
          <div className="score" title={`Confiance des données : ${pick.confidence}/100`}>
            <b>{formatAdvantage(pick.score)}</b>
            {formatSd(pick.sd) && <em>{formatSd(pick.sd)}</em>}
          </div>
          <p className="hero__unit">
            PTS DE WIN RATE<br/>VS TON POOL
            {pick.winProb != null && <><br/>P(WIN) MODÈLE {pick.winProb.toFixed(1)} %</>}
          </p>
          {peer && <p className="hero__tie"><b>≈ {peer.name.toUpperCase()} {formatAdvantage(peer.score)}</b>même groupe de tête</p>}
        </div>
      </div>
    </div>
  );
}

// ── Ligne de shortlist ─────────────────────────
const Row = React.memo(function Row({ pick, idx, selected, scale, onSelect }) {
  const isSel = idx === selected;
  const g = intervalGeometry(pick.score, pick.sd, scale);
  const tags = pick.tags.map(tagLabel).filter(Boolean).slice(0, 2);
  return (
    <button className="row" aria-pressed={isSel} onClick={() => onSelect(idx)}>
      <span className="row__rank">{String(idx + 1).padStart(2, '0')}</span>
      <Portrait champ={pick} size={36}/>
      <span className="row__who">
        <span className="row__name">{pick.name}</span>
        <span className="row__tags">
          {!pick.inPool && <span className="is-warn">HORS POOL</span>}
          {tags.length > 0 && <span>{tags.join(' · ')}</span>}
        </span>
      </span>
      <span className="ci" aria-hidden="true">
        <i className="ci__zero"/>
        {g.width > 0 && <i className="ci__band" style={{ left: `${g.left}%`, width: `${g.width}%` }}/>}
        <i className="ci__point" style={{ left: `${g.point}%` }}/>
      </span>
      <span className="row__score">{formatAdvantage(pick.score)}<small>{formatSd(pick.sd) || 'pts WR'}</small></span>
    </button>
  );
});

// ── HeroPanel ──────────────────────────────────
function HeroPanel({ selected, onSelect }) {
  // Subscribed so a new analysis re-renders even when `selected` stays at 0.
  useDraftStore(s => s.recommendations);
  const stale = useDraftStore(s => s.stale);
  const picks = SHORTLIST.map(p => p);
  const pick = picks[selected] || picks[0];
  const scale = intervalScale(picks);
  const groupSize = topGroupSize(picks);
  const rows = picks.map((p, i) => (
    <Row key={`${p.key}-${i}`} pick={p} idx={i} selected={selected} scale={scale} onSelect={onSelect}/>
  ));

  return (
    <div className={`hero-panel ${stale ? 'is-stale' : ''}`}>
      {stale && <StaleBanner/>}
      <Hero pick={pick} idx={selected} total={picks.length} peer={groupPeer(picks, selected)}/>
      <div className="shortlist">
        <div className="shortlist__head">
          <h3>Shortlist</h3>
          <span className="axis" aria-hidden="true"><span>−{scale}</span><span>0</span><span>+{scale}</span></span>
          <span/>
        </div>
        {!hasPoolForCurrentRole() && (
          <p className="notice notice--warn">Aucun pool pour ce rôle : toutes les recommandations sont affichées.</p>
        )}
        <div className="shortlist__rows">
          {groupSize > 1 ? (
            <div className="top-group" role="group" aria-label="Groupe de tête : écart plus petit que l'incertitude">
              <span className="top-group__lbl" aria-hidden="true" title="L'écart entre ces picks est plus petit que leur incertitude">Groupe de tête · choix équivalents</span>
              {rows.slice(0, groupSize)}
            </div>
          ) : rows.slice(0, groupSize)}
          {rows.slice(groupSize)}
        </div>
      </div>
    </div>
  );
}

export default React.memo(HeroPanel);
