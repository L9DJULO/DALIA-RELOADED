import React, { useState, useCallback } from 'react';
import { RotateCcw, Sparkles, Shield, Users } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import useUserStore, { ROLES } from '../../stores/userStore';
import useHistoryStore from '../../stores/historyStore';
import useDuoStore from '../../stores/duoStore';
import DraftSlot from './DraftSlot';
import BanSlot from './BanSlot';
import ChampionSelector from './ChampionSelector';
import RecommendationPanel from '../Recommendations/RecommendationPanel';
import BanPanel from './BanPanel';
import LCUStatus from './LCUStatus';
import DuoPanel from '../DuoQ/DuoPanel';

const ROLE_LABELS = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };

export default function DraftBoard({ champions }) {
  const {
    myTeam, myRole,
    blueBans, redBans,
    allyPicks, enemyPicks,
    setMyTeam, setMyRole,
    setBan,
    setAllyPick, clearAllyPick,
    setEnemyPick, clearEnemyPick,
    resetDraft,
    loading,
    getRecommendations,
    recommendations, winProbability,
  } = useDraftStore();

  const { championPool, weightOverrides } = useUserStore();
  const { saveEntry } = useHistoryStore();

  // Panel state
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState(null); // {type:'ban'|'ally'|'enemy', ...}
  const [showBanPanel, setShowBanPanel] = useState(false);
  const [showDuoPanel, setShowDuoPanel] = useState(false);

  const duoActive = useDuoStore((s) => s.duoActive);
  const duoLinked = useDuoStore((s) => s.linked);
  const duoPartner = useDuoStore((s) => s.partner);
  const getDuoOptions = useDuoStore((s) => s.getDuoOptions);

  const unavailableIds = useDraftStore((s) => s.getAllUnavailableIds());

  const openSelector = (target) => {
    setSelectorTarget(target);
    setSelectorOpen(true);
  };

  const handleSelectChampion = (champion) => {
    if (!selectorTarget) return;
    const { type } = selectorTarget;
    if (type === 'ban') {
      setBan(selectorTarget.team, selectorTarget.index, { id: champion.id, key: champion.key, name: champion.name });
    } else if (type === 'ally') {
      setAllyPick(selectorTarget.role, { id: champion.id, key: champion.key, name: champion.name });
    } else if (type === 'enemy') {
      setEnemyPick(selectorTarget.index, { id: champion.id, key: champion.key, name: champion.name });
    }
    setSelectorOpen(false);
    setSelectorTarget(null);
  };

  const handleAnalyze = useCallback(async () => {
    const duoOptions = getDuoOptions();
    await getRecommendations(championPool, weightOverrides, duoOptions);

    // Auto-save draft entry to history
    const state = useDraftStore.getState();
    const allyP = Object.entries(state.allyPicks)
      .filter(([_, c]) => c)
      .map(([role, c]) => ({ champion_id: c.id, champion_key: c.key, champion_name: c.name, role }));
    const enemyP = state.enemyPicks
      .filter(Boolean)
      .map((c) => ({ champion_id: c.id, champion_key: c.key, champion_name: c.name, role: null }));

    const myPick = state.allyPicks[myRole];
    const recs = state.recommendations || [];
    const topRec = recs.length > 0 ? recs[0] : null;

    const myTeamBans = (myTeam === 'blue' ? state.blueBans : state.redBans)
      .filter(Boolean)
      .map((b) => ({ champion_id: b.id, champion_key: b.key, champion_name: b.name }));
    const enemyTeamBans = (myTeam === 'blue' ? state.redBans : state.blueBans)
      .filter(Boolean)
      .map((b) => ({ champion_id: b.id, champion_key: b.key, champion_name: b.name }));

    saveEntry({
      my_team: myTeam,
      my_role: myRole,
      my_champion_id: myPick?.id || null,
      my_champion_key: myPick?.key || '',
      my_champion_name: myPick?.name || '',
      ally_bans: myTeamBans,
      enemy_bans: enemyTeamBans,
      ally_picks: allyP,
      enemy_picks: enemyP,
      recommended_champion: topRec?.champion_key || '',
      recommendation_score: topRec?.total_score || null,
      win_probability: state.winProbability || null,
    });
  }, [championPool, weightOverrides, getRecommendations, getDuoOptions, myTeam, myRole, saveEntry]);

  // Visual layout: blue always left, red always right.
  // My team's column gets role-keyed slots; enemy column gets ordered slots (Pick 1-5).
  const isAllyBlue = myTeam === 'blue';
  const enemyTeam = isAllyBlue ? 'red' : 'blue';

  return (
    <div className="flex h-[calc(100vh-2.5rem)]">
      {/* ── Left: Draft board ── */}
      <div className="w-[520px] flex flex-col shrink-0" style={{ background: 'var(--surface-default)', borderRight: '1px solid var(--border-subtle)' }}>
        {/* Setup bar */}
        <div className="p-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Team selector */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-medium">Équipe</span>
                <div className="flex gap-0.5 rounded-xl p-0.5" style={{ background: 'var(--surface-elevated)' }}>
                  {['blue', 'red'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setMyTeam(t)}
                      aria-pressed={myTeam === t}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                        myTeam === t
                          ? t === 'blue' ? 'bg-blue-500 text-white shadow-sm' : 'bg-red-500 text-white shadow-sm'
                          : ''
                      }`}
                      style={myTeam !== t ? { color: 'var(--text-muted)' } : undefined}
                    >
                      {t === 'blue' ? 'Blue' : 'Red'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Role selector */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-medium">Rôle</span>
                <select
                  value={myRole}
                  onChange={(e) => setMyRole(e.target.value)}
                  aria-label="Rôle"
                  className="input-field px-2.5 py-1 text-xs font-medium"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* LCU Status + DuoQ indicator */}
            <div className="flex items-center gap-2">
              {duoActive && duoLinked && duoPartner && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-muted)', border: '1px solid var(--border-default)' }}>
                  <Users size={11} style={{ color: 'var(--accent)' }} />
                  <span className="text-[10px] font-medium" style={{ color: 'var(--accent)' }}>
                    Duo: {duoPartner.username}
                  </span>
                </div>
              )}
              <LCUStatus />
            </div>
          </div>
        </div>

        {/* Bans */}
        <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Bans</div>
          <div className="flex gap-4 justify-between">
            <div className="flex-1">
              <div className="text-[10px] text-blue-400/80 font-medium mb-1.5">Blue</div>
              <div className="flex gap-1">
                {blueBans.map((ban, i) => (
                  <BanSlot
                    key={`bb${i}`}
                    champion={ban}
                    onClick={() => openSelector({ type: 'ban', team: 'blue', index: i })}
                    onClear={() => setBan('blue', i, null)}
                  />
                ))}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[10px] text-red-400/80 font-medium mb-1.5 text-right">Red</div>
              <div className="flex gap-1 justify-end">
                {redBans.map((ban, i) => (
                  <BanSlot
                    key={`rb${i}`}
                    champion={ban}
                    onClick={() => openSelector({ type: 'ban', team: 'red', index: i })}
                    onClear={() => setBan('red', i, null)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Picks */}
        <div className="flex-1 px-3 py-2.5 overflow-y-auto">
          <div className="flex gap-4">
            {/* ── Left column (blue) ── */}
            <div className="flex-1 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider font-medium mb-1.5">
                <span className="text-blue-400/80">Blue</span>
                {isAllyBlue && (
                  <span className="ml-1.5 normal-case text-[9px]" style={{ color: 'var(--accent)', opacity: 0.7 }}>← mon équipe</span>
                )}
              </div>
              {isAllyBlue ? (
                // Ally side: role-keyed slots
                ROLES.map((role) => (
                  <DraftSlot
                    key={`ally-${role}`}
                    role={role}
                    champion={allyPicks[role]}
                    isMySlot={myRole === role}
                    team="blue"
                    onClick={() => openSelector({ type: 'ally', role })}
                    onClear={() => clearAllyPick(role)}
                    champions={champions}
                  />
                ))
              ) : (
                // Enemy side: ordered slots (Pick 1-5, roles unknown)
                enemyPicks.map((pick, i) => (
                  <DraftSlot
                    key={`enemy-blue-${i}`}
                    role={null}
                    label={`Pick ${i + 1}`}
                    champion={pick}
                    isMySlot={false}
                    team="blue"
                    onClick={() => openSelector({ type: 'enemy', index: i })}
                    onClear={() => clearEnemyPick(i)}
                    champions={champions}
                  />
                ))
              )}
            </div>

            {/* VS divider */}
            <div className="flex flex-col items-center justify-center py-2">
              <div className="w-px flex-1" style={{ background: 'var(--border-subtle)' }} />
              <div className="my-2 text-[10px] font-bold text-gradient">VS</div>
              <div className="w-px flex-1" style={{ background: 'var(--border-subtle)' }} />
            </div>

            {/* ── Right column (red) ── */}
            <div className="flex-1 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider font-medium mb-1.5 text-right">
                {!isAllyBlue && (
                  <span className="mr-1.5 normal-case text-[9px]" style={{ color: 'var(--accent)', opacity: 0.7 }}>mon équipe →</span>
                )}
                <span className="text-red-400/80">Red</span>
              </div>
              {!isAllyBlue ? (
                // Ally side: role-keyed slots
                ROLES.map((role) => (
                  <DraftSlot
                    key={`ally-${role}`}
                    role={role}
                    champion={allyPicks[role]}
                    isMySlot={myRole === role}
                    team="red"
                    onClick={() => openSelector({ type: 'ally', role })}
                    onClear={() => clearAllyPick(role)}
                    champions={champions}
                  />
                ))
              ) : (
                // Enemy side: ordered slots (Pick 1-5, roles unknown)
                enemyPicks.map((pick, i) => (
                  <DraftSlot
                    key={`enemy-red-${i}`}
                    role={null}
                    label={`Pick ${i + 1}`}
                    champion={pick}
                    isMySlot={false}
                    team="red"
                    onClick={() => openSelector({ type: 'enemy', index: i })}
                    onClear={() => clearEnemyPick(i)}
                    champions={champions}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-3 flex gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button onClick={handleAnalyze} disabled={loading} className="btn-primary flex-1" aria-label="Analyser le draft">
            <Sparkles size={15} />
            {loading ? 'Analyse…' : 'Analyser'}
          </button>
          <button
            onClick={() => { setShowDuoPanel(!showDuoPanel); if (!showDuoPanel) setShowBanPanel(false); }}
            className={`btn-secondary px-2.5 relative ${showDuoPanel ? '!border-[var(--accent)] !text-[var(--accent)]' : ''}`}
            title="DuoQ"
            aria-label="DuoQ"
          >
            <Users size={15} />
            {duoActive && duoLinked && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ring-2" style={{ background: 'var(--accent)', ringColor: 'var(--surface-default)' }} />
            )}
          </button>
          <button
            onClick={() => { setShowBanPanel(!showBanPanel); if (!showBanPanel) setShowDuoPanel(false); }}
            className={`btn-secondary px-2.5 ${showBanPanel ? 'border-red-500/40 text-red-400' : ''}`}
            title="Suggestions de bans"
            aria-label="Suggestions de bans"
          >
            <Shield size={15} />
          </button>
          <button onClick={resetDraft} className="btn-secondary px-2.5" title="Réinitialiser" aria-label="Réinitialiser le draft">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* ── Right: Recommendations, Ban Panel, or DuoQ Panel ── */}
      <div className="flex-1 overflow-y-auto" style={{ background: 'var(--surface-base)' }}>
        {showDuoPanel ? (
          <div className="p-4 max-w-lg mx-auto">
            <DuoPanel />
          </div>
        ) : showBanPanel ? (
          <div className="p-4">
            <BanPanel />
          </div>
        ) : (
          <RecommendationPanel champions={champions} />
        )}
      </div>

      {/* ── Champion selector overlay ── */}
      {selectorOpen && (
        <ChampionSelector
          champions={champions}
          unavailableIds={unavailableIds}
          onSelect={handleSelectChampion}
          onClose={() => setSelectorOpen(false)}
          target={selectorTarget}
        />
      )}
    </div>
  );
}

