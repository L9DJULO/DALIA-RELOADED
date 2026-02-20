/**
 * LCU Overlay — Clean floating overlay showing live draft state + recommendations.
 * Designed to sit on top of the LoL client during champ select.
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  Wifi, WifiOff, Gamepad2, Clock, Shield, Swords,
  ChevronDown, ChevronUp, Minimize2, Maximize2, X, Sparkles,
} from 'lucide-react';
import useLCUStore from '../../stores/lcuStore';
import useDraftStore from '../../stores/draftStore';
import useUserStore from '../../stores/userStore';
import RoleIcon from '../RoleIcon';
import { getScoreClasses } from '../../lib/scores';

const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion';

function ChampImg({ champKey, size = 28, className = '' }) {
  if (!champKey) return <div style={{ width: size, height: size }} className={`rounded bg-slate-800 ${className}`} />;
  return (
    <img
      src={`${DDRAGON}/${champKey}.png`}
      alt={champKey}
      className={`rounded ${className}`}
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
}

/* ── Timer display ── */
function Timer({ seconds, isMyTurn }) {
  const color = isMyTurn
    ? seconds <= 5 ? 'text-red-400 animate-pulse' : 'text-violet-400'
    : 'text-slate-400';
  return (
    <div className={`flex items-center gap-1 text-xs font-bold tabular-nums ${color}`}>
      <Clock size={11} />
      {seconds}s
    </div>
  );
}

/* ── Phase indicator ── */
function PhaseIndicator({ actionType, isMyTurn }) {
  if (!actionType) return null;
  const isBan = actionType === 'ban';
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
      isMyTurn
        ? isBan
          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'bg-slate-700/50 text-slate-400 border border-slate-600/50'
    }`}>
      {isBan ? <Shield size={10} /> : <Swords size={10} />}
      {isMyTurn ? 'À vous' : 'En attente'} · {isBan ? 'Ban' : 'Pick'}
    </div>
  );
}

/* ── Mini recommendation row ── */
function MiniRec({ rec, rank }) {
  const colors = getScoreClasses(rec.total_score);
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[10px] text-slate-500 w-3 text-center tabular-nums font-bold">{rank}</span>
      <ChampImg champKey={rec.champion_key} size={24} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-200 truncate">{rec.champion_name}</div>
        <div className="flex gap-1 mt-0.5">
          {rec.tags?.slice(0, 2).map((t, i) => (
            <span key={i} className="text-[9px] px-1 py-0 rounded bg-slate-700/50 text-slate-400">{t}</span>
          ))}
        </div>
      </div>
      <div className={`w-8 h-7 rounded border flex items-center justify-center text-[11px] font-bold tabular-nums ${colors.bg} ${colors.border} ${colors.text}`}>
        {rec.total_score.toFixed(0)}
      </div>
    </div>
  );
}

/* ── Pick/Ban row ── */
function PickRow({ role, champion, team }) {
  const teamColor = team === 'ally' ? 'border-l-blue-500' : 'border-l-red-500';
  return (
    <div className={`flex items-center gap-2 py-0.5 border-l-2 pl-2 ${teamColor}`}>
      <RoleIcon role={role} size={12} className="text-slate-500" />
      {champion ? (
        <>
          <ChampImg champKey={champion.key} size={22} />
          <span className="text-[11px] text-slate-300">{champion.name}</span>
        </>
      ) : (
        <span className="text-[11px] text-slate-600 italic">—</span>
      )}
    </div>
  );
}

/* ── Main Overlay ── */
export default function LCUOverlay({ champions }) {
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const offsetRef = useRef({ x: 0, y: 0 });

  const {
    connected, inChampSelect, gamePhase, myTeam, myRole,
    isMyTurn, timerRemaining, currentActionType,
    allyBans, enemyBans, allyPicks, enemyPicks,
  } = useLCUStore();

  const { recommendations } = useDraftStore();

  const topRecs = recommendations.slice(0, 5);

  // Drag handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('button')) return;
    setDragging(true);
    offsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e) => {
      setPosition({
        x: e.clientX - offsetRef.current.x,
        y: e.clientY - offsetRef.current.y,
      });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  // Don't show overlay when not in champ select
  if (!connected || !inChampSelect) {
    return (
      <div
        style={{ left: position.x, top: position.y }}
        className="fixed z-50 select-none"
        onMouseDown={handleMouseDown}
        ref={dragRef}
      >
        <div className="bg-surface/95 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-2xl p-3 cursor-move">
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <Wifi size={12} className="text-slate-400" />
                <span className="text-[11px] text-slate-400">
                  {gamePhase === 'Lobby' ? 'En lobby' : gamePhase === 'Matchmaking' ? 'Recherche…' : 'Connecté'}
                </span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-red-400" />
                <span className="text-[11px] text-red-400">LCU déconnecté</span>
              </>
            )}
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500 ml-1" />
            <span className="text-[9px] text-slate-600 font-medium">DALIA</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ left: position.x, top: position.y }}
      className="fixed z-50 select-none"
      onMouseDown={handleMouseDown}
      ref={dragRef}
    >
      <div className={`bg-surface/95 backdrop-blur-sm border rounded-xl shadow-2xl transition-all duration-200 ${
        isMyTurn ? 'border-violet-500/50 shadow-violet-500/10' : 'border-slate-700/50'
      }`} style={{ width: minimized ? 220 : 340 }}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/30 cursor-move">
          <div className="flex items-center gap-2">
            <Gamepad2 size={13} className="text-emerald-400 animate-pulse-soft" />
            <span className="text-[11px] font-bold text-slate-200">DALIA</span>
            <PhaseIndicator actionType={currentActionType} isMyTurn={isMyTurn} />
          </div>
          <div className="flex items-center gap-1.5">
            <Timer seconds={timerRemaining} isMyTurn={isMyTurn} />
            <button
              onClick={() => setMinimized(!minimized)}
              className="p-1 rounded text-slate-500 hover:text-slate-300 transition"
            >
              {minimized ? <Maximize2 size={11} /> : <Minimize2 size={11} />}
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* ── My info ── */}
            <div className="px-3 py-1.5 flex items-center gap-2 border-b border-slate-700/20">
              <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                myTeam === 'blue' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {myTeam === 'blue' ? 'Blue' : 'Red'}
              </div>
              <RoleIcon role={myRole} size={13} className="text-slate-400" />
              <span className="text-[11px] text-slate-300 capitalize">{myRole}</span>
            </div>

            {/* ── Bans ── */}
            {(allyBans.length > 0 || enemyBans.length > 0) && (
              <div className="px-3 py-1.5 border-b border-slate-700/20">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider font-medium mb-1">Bans</div>
                <div className="flex gap-1">
                  {allyBans.map((b, i) => (
                    <ChampImg key={`ab${i}`} champKey={b?.key} size={22} className="opacity-50 grayscale" />
                  ))}
                  <div className="w-px bg-slate-700/50 mx-0.5" />
                  {enemyBans.map((b, i) => (
                    <ChampImg key={`eb${i}`} champKey={b?.key} size={22} className="opacity-50 grayscale" />
                  ))}
                </div>
              </div>
            )}

            {/* ── Picks ── */}
            <div className="px-3 py-1.5 border-b border-slate-700/20">
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <div>
                  <div className="text-[9px] text-blue-400/60 uppercase tracking-wider font-medium mb-0.5">
                    {myTeam === 'blue' ? 'Alliés' : 'Ennemis'}
                  </div>
                  {Object.entries(myTeam === 'blue' ? allyPicks : enemyPicks).map(([role, champ]) => (
                    <PickRow key={role} role={role} champion={champ} team={myTeam === 'blue' ? 'ally' : 'enemy'} />
                  ))}
                </div>
                <div>
                  <div className="text-[9px] text-red-400/60 uppercase tracking-wider font-medium mb-0.5">
                    {myTeam === 'blue' ? 'Ennemis' : 'Alliés'}
                  </div>
                  {Object.entries(myTeam === 'blue' ? enemyPicks : allyPicks).map(([role, champ]) => (
                    <PickRow key={role} role={role} champion={champ} team={myTeam === 'blue' ? 'enemy' : 'ally'} />
                  ))}
                </div>
              </div>
            </div>

            {/* ── Top Recommendations ── */}
            {topRecs.length > 0 && (
              <div className="px-3 py-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles size={11} className="text-violet-500" />
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Top picks</span>
                </div>
                <div className="space-y-0.5">
                  {topRecs.map((rec, i) => (
                    <MiniRec key={rec.champion_id} rec={rec} rank={i + 1} />
                  ))}
                </div>
              </div>
            )}

            {/* ── My Turn CTA ── */}
            {isMyTurn && currentActionType === 'pick' && topRecs.length > 0 && (
              <div className="px-3 pb-2">
                <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/25 text-center">
                  <span className="text-xs font-semibold text-violet-400">
                    Pick recommandé : {topRecs[0].champion_name}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
