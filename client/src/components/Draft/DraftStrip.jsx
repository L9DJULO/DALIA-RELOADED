// ─────────────────────────────────────────────
// DraftStrip.jsx — bandeau de draft : bans, picks, tour, ANALYSER
// Remplace le board complet : chaque emplacement est un bouton qui ouvre la recherche.
// ─────────────────────────────────────────────
import React, { useMemo, useState } from 'react';
import useDraftStore from '../../stores/draftStore';
import useLCUStore from '../../stores/lcuStore';
import { champIcon, ROLE_LABEL } from '../../data/mock';
import { timerView } from '../../lib/timer';
import { turnView } from '../../lib/draftView';
import ChampionSearch from './ChampionSearch';

const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];

// ── Emplacement de pick ─────────────────────────
function PickSlot({ side, label, champ, mine, onClick }) {
  const display = ROLE_LABEL[label] ?? label;
  return (
    <button
      className={`slot ${champ ? '' : 'slot--empty'} ${mine ? 'slot--mine se-corners' : ''}`}
      aria-label={`${side} ${label} : ${champ?.name || 'vide'}`}
      title={champ ? `${champ.name} · ${display}` : `${display} : ajouter un champion`}
      onClick={onClick}
    >
      {champ ? <img src={champIcon(champ.key)} alt="" width="46" height="46"/> : <span className="slot__role">{display}</span>}
    </button>
  );
}

// ── Emplacement de ban ──────────────────────────
function BanSlot({ side, index, champ, onClick }) {
  return (
    <button
      className={`ban ${champ ? 'ban--filled' : ''}`}
      aria-label={`${side} ban ${index + 1} : ${champ?.name || 'vide'}`}
      title={champ ? `${champ.name} (banni)` : 'Ajouter un ban'}
      onClick={onClick}
    >
      {champ ? <img src={champIcon(champ.key)} alt="" width="24" height="24"/> : <span aria-hidden="true">+</span>}
    </button>
  );
}

// ── Bouton ANALYSER ─────────────────────────────
function AnalyseButton() {
  const loading = useDraftStore(s => s.loading);
  return (
    <button
      className="btn btn--primary analyse-btn"
      onClick={() => useDraftStore.getState().getRecommendations()}
      disabled={loading}
      title="Raccourci : Entrée"
    >
      {loading ? 'ANALYSE…' : 'ANALYSER'}
    </button>
  );
}

// ── Tour en cours (mode direct) ─────────────────
function Turn() {
  const mode = useDraftStore(s => s.mode);
  const myTeam = useDraftStore(s => s.myTeam);
  const connected = useLCUStore(s => s.connected);
  const inChampSelect = useLCUStore(s => s.inChampSelect);
  const actionType = useLCUStore(s => s.currentActionType);
  const isMyTurn = useLCUStore(s => s.isMyTurn);
  const pickCount = useLCUStore(s => s.pickSequence.length);
  const remaining = useLCUStore(s => s.timerRemaining);
  const turn = turnView({ live: mode === 'live' && connected, inChampSelect, actionType, isMyTurn, pickCount, myTeam });
  if (!turn) return null;
  const urgent = turn.mine && timerView({ active: true, remaining }).danger;
  return <p className={`turn ${turn.mine ? 'turn--mine' : ''} ${urgent ? 'turn--hot' : ''}`} aria-live="polite">{turn.label}</p>;
}

// ── Une équipe : bans + picks ───────────────────
function TeamSide({ side, ally, picks, bans, myRole, onPick, onBan }) {
  const slots = ROLES.map((role, i) => {
    const label = ally ? role : `P${i + 1}`;
    const champ = ally ? picks[role] : picks[i];
    return (
      <PickSlot key={role} side={side} label={label} champ={champ} mine={ally && role === myRole && !champ} onClick={() => onPick(role, i)}/>
    );
  });
  const banRow = (
    <div className="bans" role="group" aria-label={`Bans ${side}`}>
      {bans.map((b, i) => <BanSlot key={i} side={side} index={i} champ={b} onClick={() => onBan(i)}/>)}
    </div>
  );
  return (
    <div className={`strip__team strip__team--${side}`} role="group" aria-label={`Équipe ${side} · ${ally ? 'alliée' : 'ennemie'}`}>
      {side === 'blue' && <span className="strip__side strip__side--blue" aria-hidden="true">BLUE</span>}
      {side === 'blue' && banRow}
      <div className="picks">{slots}</div>
      {side === 'red' && banRow}
      {side === 'red' && <span className="strip__side strip__side--red" aria-hidden="true">RED</span>}
    </div>
  );
}

export default function DraftStrip() {
  const { myTeam, myRole, allyPicks, enemyPicks, blueBans, redBans, setBan, setAllyPick, setEnemyPick, getAllUnavailableIds } = useDraftStore();
  const [active, setActive] = useState(null);
  const blueIsAlly = myTeam === 'blue';
  const unavailable = useMemo(() => getAllUnavailableIds(), [allyPicks, enemyPicks, blueBans, redBans]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(champ) {
    if (!active) return;
    const { type, team, role, index } = active;
    const isAllySide = (team === 'blue') === blueIsAlly;
    const current = type === 'ban'
      ? (team === 'blue' ? blueBans : redBans)[index]
      : isAllySide ? allyPicks[role] : enemyPicks[index];
    if ((current?.id ?? null) === (champ?.id ?? null)) {
      // Nothing changes: do not leave live sync or touch the timeline for a no-op click.
      setActive(null);
      return;
    }
    useDraftStore.getState().setMode('manual');
    if (type === 'ban') setBan(team, index, champ);
    else if (isAllySide) setAllyPick(role, champ);
    else setEnemyPick(index, champ);
    setActive(null);
  }

  const sideProps = side => {
    const ally = (side === 'blue') === blueIsAlly;
    return {
      side, ally, myRole,
      picks: ally ? allyPicks : enemyPicks,
      bans: side === 'blue' ? blueBans : redBans,
      onPick: (role, index) => setActive({ type: 'pick', team: side, role, index, title: ally ? `${side} ${ROLE_LABEL[role]}` : `${side} P${index + 1}` }),
      onBan: index => setActive({ type: 'ban', team: side, index, title: `${side} ban ${index + 1}` }),
    };
  };

  return (
    <div className="strip">
      <TeamSide {...sideProps('blue')}/>
      <div className="strip__center">
        <Turn/>
        <AnalyseButton/>
      </div>
      <TeamSide {...sideProps('red')}/>
      {active && (
        <ChampionSearch
          title={`Emplacement ${active.title.toUpperCase()}`}
          unavailable={unavailable}
          onSelect={handleSelect}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
