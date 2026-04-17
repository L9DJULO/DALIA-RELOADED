import React, { useState, useCallback } from 'react';
import { RotateCcw, Sparkles, Shield, Users } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import useUserStore from '../../stores/userStore';
import useHistoryStore from '../../stores/historyStore';
import useDuoStore from '../../stores/duoStore';
import { ROLES, ROLE_LABELS } from '../../lib/constants';
import DraftSlot from './DraftSlot';
import BanSlot from './BanSlot';
import ChampionSelector from './ChampionSelector';
import RecommendationPanel from '../Recommendations/RecommendationPanel';
import BanPanel from './BanPanel';
import LCUStatus from './LCUStatus';
import QuickInput from './QuickInput';
import DuoPanel from '../DuoQ/DuoPanel';

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

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState(null);
  const [rightTab, setRightTab] = useState('reco');

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

  const isAllyBlue = myTeam === 'blue';

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* ── Left: Draft Board ── */}
      <div className="w-[540px] flex flex-col shrink-0 bg-surface-default border-r border-border-subtle">
        {/* Setup bar */}
        <div className="p-3.5 border-b border-border-subtle">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Team selector */}
              <div className="flex items-center gap-2">
                <span className="section-label">Equipe</span>
                <div className="flex gap-0.5 rounded-xl p-0.5 bg-surface-elevated">
                  {['blue', 'red'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setMyTeam(t)}
                      aria-pressed={myTeam === t}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        myTeam === t
                          ? t === 'blue'
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'bg-red-500 text-white shadow-sm'
                          : 'text-txt-muted hover:text-txt-secondary'
                      }`}
                    >
                      {t === 'blue' ? 'Blue' : 'Red'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Role selector */}
              <div className="flex items-center gap-2">
                <span className="section-label">Role</span>
                <select
                  value={myRole}
                  onChange={(e) => setMyRole(e.target.value)}
                  aria-label="Role"
                  className="input-field px-3 py-1.5 text-xs font-medium w-auto"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* LCU Status + DuoQ */}
            <div className="flex items-center gap-2">
              {duoActive && duoLinked && duoPartner && (
                <div className="pill gap-1.5 bg-accent-muted text-accent border-accent/20">
                  <Users size={11} />
                  <span>Duo: {duoPartner.username}</span>
                </div>
              )}
              <LCUStatus champions={champions} />
            </div>
          </div>
        </div>

        {/* Quick input (fast manual entry, follows real draft pick order) */}
        <div className="px-3.5 py-3 border-b border-border-subtle">
          <QuickInput champions={champions} />
        </div>

        {/* Bans */}
        <div className="px-3.5 py-3 border-b border-border-subtle">
          <div className="section-label mb-2">Bans</div>
          <div className="flex gap-5 justify-between">
            <div className="flex-1">
              <div className="text-[10px] text-blue-400/70 font-medium mb-1.5">Blue</div>
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
              <div className="text-[10px] text-red-400/70 font-medium mb-1.5 text-right">Red</div>
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
        <div className="flex-1 px-3.5 py-3 overflow-y-auto">
          <div className="flex gap-4">
            {/* Left column (Blue) */}
            <div className="flex-1 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-2">
                <span className="text-blue-400/70">Blue</span>
                {isAllyBlue && (
                  <span className="ml-1.5 normal-case text-[9px] text-accent/60">{'<-'} mon equipe</span>
                )}
              </div>
              {isAllyBlue ? (
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
            <div className="flex flex-col items-center justify-center py-2 gap-2">
              <div className="w-px flex-1 bg-border-subtle" />
              <div className="text-[10px] font-bold text-txt-muted px-1">VS</div>
              <div className="w-px flex-1 bg-border-subtle" />
            </div>

            {/* Right column (Red) */}
            <div className="flex-1 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-2 text-right">
                {!isAllyBlue && (
                  <span className="mr-1.5 normal-case text-[9px] text-accent/60">mon equipe {'->'}</span>
                )}
                <span className="text-red-400/70">Red</span>
              </div>
              {!isAllyBlue ? (
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
        <div className="p-3.5 flex gap-2 border-t border-border-subtle">
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="btn-primary flex-1 gap-2"
            aria-label="Analyser le draft"
          >
            <Sparkles size={15} />
            {loading ? 'Analyse...' : 'Analyser'}
          </button>
          <button
            onClick={resetDraft}
            className="btn-secondary px-3"
            title="Reinitialiser"
            aria-label="Reinitialiser le draft"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* ── Right: Tab bar + Panel ── */}
      <div className="flex-1 flex flex-col bg-surface-base">
        {/* Tab bar */}
        <div className="px-4 pt-3 pb-0 shrink-0">
          <div className="flex gap-1 bg-surface-default rounded-xl p-1 border border-border-subtle">
            {[
              { id: 'reco', label: 'Recommandations', icon: Sparkles },
              { id: 'bans', label: 'Bans', icon: Shield },
              { id: 'duo',  label: 'DuoQ', icon: Users, badge: duoActive && duoLinked },
            ].map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                onClick={() => setRightTab(id)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 relative ${
                  rightTab === id
                    ? id === 'bans'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-accent text-white shadow-glow'
                    : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-elevated'
                }`}
              >
                <Icon size={14} />
                <span>{label}</span>
                {badge && rightTab !== id && (
                  <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-accent ring-2 ring-surface-default" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto" key={rightTab}>
          {rightTab === 'reco' && <RecommendationPanel champions={champions} />}
          {rightTab === 'bans' && <div className="p-5"><BanPanel /></div>}
          {rightTab === 'duo'  && <DuoPanel embedded />}
        </div>
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
