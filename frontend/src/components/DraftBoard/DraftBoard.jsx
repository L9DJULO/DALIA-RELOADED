import React, { useState, useCallback } from 'react';
import { RotateCcw, Zap, Shield } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import useUserStore, { ROLES } from '../../stores/userStore';
import useHistoryStore from '../../stores/historyStore';
import DraftSlot from './DraftSlot';
import BanSlot from './BanSlot';
import ChampionSelector from './ChampionSelector';
import RecommendationPanel from '../Recommendations/RecommendationPanel';
import BanPanel from './BanPanel';
import LCUStatus from './LCUStatus';

const ROLE_LABELS = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };

export default function DraftBoard({ champions }) {
  const {
    myTeam, myRole,
    blueBans, redBans, bluePicks, redPicks,
    setMyTeam, setMyRole,
    setBan, setPick, clearPick, resetDraft,
    loading,
    getRecommendations,
    recommendations, winProbability,
  } = useDraftStore();

  const { championPool, weightOverrides } = useUserStore();
  const { saveEntry } = useHistoryStore();

  // Selector state
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState(null);
  const [showBanPanel, setShowBanPanel] = useState(false);

  const unavailableIds = useDraftStore((s) => s.getAllUnavailableIds());

  const openSelector = (target) => {
    setSelectorTarget(target);
    setSelectorOpen(true);
  };

  const handleSelectChampion = (champion) => {
    if (!selectorTarget) return;
    const { type, team, index, role } = selectorTarget;
    if (type === 'ban') {
      setBan(team, index, { id: champion.id, key: champion.key, name: champion.name });
    } else {
      setPick(team, role, { id: champion.id, key: champion.key, name: champion.name });
    }
    setSelectorOpen(false);
    setSelectorTarget(null);
  };

  const handleAnalyze = useCallback(async () => {
    await getRecommendations(championPool, weightOverrides);

    // Auto-save draft to history
    const state = useDraftStore.getState();
    const allyKey = myTeam === 'blue' ? 'bluePicks' : 'redPicks';
    const enemyKey = myTeam === 'blue' ? 'redPicks' : 'bluePicks';
    const allyP = Object.entries(state[allyKey])
      .filter(([_, c]) => c)
      .map(([role, c]) => ({ champion_id: c.id, champion_key: c.key, champion_name: c.name, role }));
    const enemyP = Object.entries(state[enemyKey])
      .filter(([_, c]) => c)
      .map(([role, c]) => ({ champion_id: c.id, champion_key: c.key, champion_name: c.name, role }));

    const myPick = state[allyKey][myRole];
    const recs = state.recommendations || [];
    const topRec = recs.length > 0 ? recs[0] : null;

    const historyEntry = {
      my_team: myTeam,
      my_role: myRole,
      my_champion_id: myPick?.id || null,
      my_champion_key: myPick?.key || '',
      my_champion_name: myPick?.name || '',
      ally_bans: (myTeam === 'blue' ? state.blueBans : state.redBans)
        .filter(Boolean)
        .map((b) => ({ champion_id: b.id, champion_key: b.key, champion_name: b.name })),
      enemy_bans: (myTeam === 'blue' ? state.redBans : state.blueBans)
        .filter(Boolean)
        .map((b) => ({ champion_id: b.id, champion_key: b.key, champion_name: b.name })),
      ally_picks: allyP,
      enemy_picks: enemyP,
      recommended_champion: topRec?.champion_key || '',
      recommendation_score: topRec?.total_score || null,
      win_probability: state.winProbability || null,
    };

    saveEntry(historyEntry);
  }, [championPool, weightOverrides, getRecommendations, myTeam, myRole, saveEntry]);

  return (
    <div className="flex h-[calc(100vh-2.5rem)]">
      {/* ── Left: Draft board ── */}
      <div className="w-[520px] border-r border-slate-700/50 flex flex-col bg-surface shrink-0">
        {/* Setup bar */}
        <div className="p-3 border-b border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Team selector */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-medium">Équipe</span>
                <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5">
                  {['blue', 'red'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setMyTeam(t)}
                      aria-pressed={myTeam === t}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-150 ${
                        myTeam === t
                          ? t === 'blue'
                            ? 'bg-blue-500 text-white'
                            : 'bg-red-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
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
                  className="bg-surface-elevated border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-medium focus:outline-none focus:border-amber-500 transition-colors"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* LCU Status */}
            <LCUStatus />
          </div>
        </div>

        {/* Bans */}
        <div className="px-3 py-2.5 border-b border-slate-700/50">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-2">Bans</div>
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
            {/* Blue team picks */}
            <div className="flex-1 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-blue-400/80 font-medium mb-1.5">Blue</div>
              {ROLES.map((role) => (
                <DraftSlot
                  key={`bp-${role}`}
                  role={role}
                  champion={bluePicks[role]}
                  isMySlot={myTeam === 'blue' && myRole === role}
                  team="blue"
                  onClick={() => openSelector({ type: 'pick', team: 'blue', role })}
                  onClear={() => clearPick('blue', role)}
                  champions={champions}
                />
              ))}
            </div>

            {/* VS divider */}
            <div className="flex flex-col items-center justify-center py-2">
              <div className="w-px flex-1 bg-slate-700/50" />
              <div className="my-2 text-[10px] text-slate-600 font-medium">VS</div>
              <div className="w-px flex-1 bg-slate-700/50" />
            </div>

            {/* Red team picks */}
            <div className="flex-1 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-red-400/80 font-medium mb-1.5 text-right">Red</div>
              {ROLES.map((role) => (
                <DraftSlot
                  key={`rp-${role}`}
                  role={role}
                  champion={redPicks[role]}
                  isMySlot={myTeam === 'red' && myRole === role}
                  team="red"
                  onClick={() => openSelector({ type: 'pick', team: 'red', role })}
                  onClear={() => clearPick('red', role)}
                  champions={champions}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-3 border-t border-slate-700/50 flex gap-2">
          <button onClick={handleAnalyze} disabled={loading} className="btn-primary flex-1" aria-label="Analyser le draft">
            <Zap size={15} />
            {loading ? 'Analyse…' : 'Analyser'}
          </button>
          <button
            onClick={() => setShowBanPanel(!showBanPanel)}
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

      {/* ── Right: Recommendations or Ban Panel ── */}
      <div className="flex-1 overflow-y-auto bg-surface-base">
        {showBanPanel ? (
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
