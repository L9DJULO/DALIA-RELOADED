import React, { useState, useCallback } from 'react';
import { RotateCcw, Zap, ChevronRight } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import useUserStore, { ROLES } from '../../stores/userStore';
import DraftSlot from './DraftSlot';
import BanSlot from './BanSlot';
import ChampionSelector from './ChampionSelector';
import RecommendationPanel from '../Recommendations/RecommendationPanel';
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
  } = useDraftStore();

  const { championPool, weightOverrides } = useUserStore();

  // Selector state
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState(null);

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

  const handleAnalyze = useCallback(() => {
    getRecommendations(championPool, weightOverrides);
  }, [championPool, weightOverrides, getRecommendations]);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* ── Left: Draft board ── */}
      <div className="w-[540px] border-r border-slate-800 flex flex-col bg-slate-900/50 shrink-0">
        {/* Setup bar */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              {/* Team selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Équipe</span>
                <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
                  {['blue', 'red'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setMyTeam(t)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        myTeam === t
                          ? t === 'blue'
                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                            : 'bg-red-500 text-white shadow-lg shadow-red-500/30'
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
                <span className="text-xs text-slate-500 font-medium">Rôle</span>
                <select
                  value={myRole}
                  onChange={(e) => setMyRole(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-amber-500"
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
        <div className="p-4 border-b border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-3">Bans</div>
          <div className="flex gap-6 justify-between">
            <div className="flex-1">
              <div className="text-[10px] text-blue-400 font-medium mb-2">Blue Side</div>
              <div className="flex gap-1.5">
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
              <div className="text-[10px] text-red-400 font-medium mb-2 text-right">Red Side</div>
              <div className="flex gap-1.5 justify-end">
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
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="flex gap-6">
            {/* Blue team picks */}
            <div className="flex-1 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-blue-400 font-medium mb-2">Blue Side</div>
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
            <div className="flex flex-col items-center justify-center py-4">
              <div className="w-px flex-1 bg-gradient-to-b from-transparent via-slate-700 to-transparent" />
              <div className="my-3 w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                <ChevronRight size={14} className="text-slate-500" />
              </div>
              <div className="w-px flex-1 bg-gradient-to-b from-transparent via-slate-700 to-transparent" />
            </div>

            {/* Red team picks */}
            <div className="flex-1 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-red-400 font-medium mb-2 text-right">Red Side</div>
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
        <div className="p-4 border-t border-slate-800 flex gap-3">
          <button onClick={handleAnalyze} disabled={loading} className="btn-primary flex-1 gap-2">
            <Zap size={16} />
            {loading ? 'Analyse...' : 'Analyser le draft'}
          </button>
          <button onClick={resetDraft} className="btn-secondary px-3" title="Réinitialiser">
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* ── Right: Recommendations ── */}
      <div className="flex-1 overflow-y-auto bg-slate-950">
        <RecommendationPanel champions={champions} />
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
