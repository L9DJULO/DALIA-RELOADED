import React, { useState, useMemo, useCallback } from 'react';
import { RotateCcw, Zap } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import useUserStore, { ROLES } from '../../stores/userStore';
import DraftSlot from './DraftSlot';
import BanSlot from './BanSlot';
import ChampionSelector from './ChampionSelector';
import RecommendationPanel from '../Recommendations/RecommendationPanel';

const ROLE_LABELS = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };
const TEAM_COLORS = { blue: 'text-dalia-blue', red: 'text-dalia-red' };

export default function DraftBoard({ champions }) {
  const {
    myTeam, myRole, myPickOrder,
    blueBans, redBans, bluePicks, redPicks,
    setMyTeam, setMyRole, setMyPickOrder,
    setBan, setPick, clearPick, resetDraft,
    recommendations, loading, warnings,
    getRecommendations,
  } = useDraftStore();

  const { championPool, weightOverrides } = useUserStore();

  // Selector state
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState(null); // { type: 'ban'|'pick', team, index/role }

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
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* ── Left: Draft board ── */}
      <div className="w-[520px] border-r border-white/[0.06] flex flex-col bg-dalia-surface/80 backdrop-blur-sm shrink-0">
        {/* Setup bar */}
        <div className="p-3 border-b border-white/[0.06] space-y-2">
          <div className="flex items-center gap-3">
            <label className="text-xs text-dalia-muted">Équipe :</label>
            <div className="flex gap-1">
              {['blue', 'red'].map((t) => (
                <button
                  key={t}
                  onClick={() => setMyTeam(t)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    myTeam === t
                      ? t === 'blue'
                        ? 'bg-dalia-blue/20 text-dalia-blue border border-dalia-blue/40'
                        : 'bg-dalia-red/20 text-dalia-red border border-dalia-red/40'
                      : 'bg-dalia-card border border-dalia-border text-dalia-muted'
                  }`}
                >
                  {t === 'blue' ? 'Blue Side' : 'Red Side'}
                </button>
              ))}
            </div>

            <label className="text-xs text-dalia-muted ml-3">Rôle :</label>
            <select
              value={myRole}
              onChange={(e) => setMyRole(e.target.value)}
              className="bg-dalia-card border border-dalia-border rounded px-2 py-1 text-xs text-dalia-text"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>

            <label className="text-xs text-dalia-muted ml-3">Pick :</label>
            <select
              value={myPickOrder}
              onChange={(e) => setMyPickOrder(Number(e.target.value))}
              className="bg-dalia-card border border-dalia-border rounded px-2 py-1 text-xs text-dalia-text"
            >
              {[1,2,3,4,5].map((n) => (
                <option key={n} value={n}>{n}e</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bans */}
        <div className="p-3 border-b border-white/[0.06]">
          <div className="text-[10px] uppercase tracking-wider text-dalia-muted mb-2">Bans</div>
          <div className="flex gap-4 justify-between">
            <div className="flex-1">
              <div className="text-[10px] text-dalia-blue mb-1">Blue</div>
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
              <div className="text-[10px] text-dalia-red mb-1 text-right">Red</div>
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
        <div className="flex-1 p-3 overflow-y-auto">
          <div className="flex gap-4">
            {/* Blue team picks */}
            <div className="flex-1 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-dalia-blue mb-1">Blue Side</div>
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
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="w-[1px] flex-1 bg-gradient-to-b from-transparent via-dalia-accent/20 to-transparent" />
              <div className="text-[10px] text-dalia-accent/40 font-bold tracking-widest">VS</div>
              <div className="w-[1px] flex-1 bg-gradient-to-b from-transparent via-dalia-accent/20 to-transparent" />
            </div>

            {/* Red team picks */}
            <div className="flex-1 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-dalia-red mb-1 text-right">Red Side</div>
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
        <div className="p-3 border-t border-white/[0.06] flex gap-2">
          <button onClick={handleAnalyze} disabled={loading} className="btn-primary flex-1 gap-2">
            <Zap size={14} />
            {loading ? 'Analyse…' : 'Analyser le draft'}
          </button>
          <button onClick={resetDraft} className="btn-secondary">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* ── Right: Recommendations ── */}
      <div className="flex-1 overflow-y-auto">
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
