import { create } from 'zustand';
import { fetchRecommendations } from '../services/api';
import useLCUStore from './lcuStore';
import useUserStore from './userStore';
import useDuoStore from './duoStore';
import { validateReplay } from '../lib/replay';

const roles = ['top', 'jungle', 'mid', 'bot', 'support'];
const emptyAllies = () => Object.fromEntries(roles.map(r => [r, null]));
const emptySlots = () => Array(5).fill(null);
const fresh = () => ({ myTeam: 'blue', myRole: 'mid', myPickOrder: 1, autoDetected: false,
  blueBans: emptySlots(), redBans: emptySlots(), allyPicks: emptyAllies(), enemyPicks: emptySlots(), allyPrepicks: emptyAllies(), currentAction: 0 });
const resultFields = () => ({ recommendations: [], banSuggestions: [], banImpact: [], compSummary: {}, warnings: [], winProbability: null, dataStatus: null });
let requestController = null;
let requestNumber = 0;
const snapshot = s => Object.fromEntries(Object.keys(fresh()).map(k => [k, structuredClone(s[k])]));
const cancel = () => { requestNumber++; requestController?.abort(); requestController = null; };
const useDraftStore = create((set, get) => ({
  ...fresh(), ...resultFields(), sessionId: crypto.randomUUID(), revision: 0,
  loading: false, error: null, stale: false, mode: 'live', timeline: [], undoStack: [], replayPosition: null,
  change: (patch, record = true) => {
    const before = snapshot(get());
    const after = { ...before, ...patch };
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    cancel();
    const step = { at: new Date().toISOString(), state: structuredClone(after) };
    set(s => ({ ...patch, revision: s.revision + 1, loading: false, error: null,
      stale: s.recommendations.length > 0, replayPosition: null,
      ...(record ? { timeline: [...(s.timeline.length ? s.timeline : [{ at: step.at, state: before }]), step].slice(-100), undoStack: [...s.undoStack, before].slice(-50) } : {}) }));
  },
  setMyTeam: myTeam => { get().setMode('manual'); get().change({ myTeam, autoDetected: false }); },
  setMyRole: myRole => { get().setMode('manual'); get().change({ myRole, autoDetected: false }); },
  setMyPickOrder: myPickOrder => get().change({ myPickOrder: Number(myPickOrder) }),
  setFromLCU: (myTeam, myRole) => get().change({ myTeam, myRole, autoDetected: true }),
  setMode: mode => { cancel(); set({ mode, loading: false }); },
  invalidateResults: () => { cancel(); set(s => ({ revision: s.revision + 1, loading: false, stale: s.recommendations.length > 0 })); },
  applyLCU: data => {
    if (get().mode !== 'live') return;
    get().change({ myTeam: data.myTeam || get().myTeam, myRole: data.myRole || get().myRole,
      myPickOrder: data.myPickOrder || get().myPickOrder, currentAction: data.currentAction ?? get().currentAction,
      blueBans: data.blueBans, redBans: data.redBans, allyPicks: data.allyPicks,
      enemyPicks: [...(data.enemyPicksOrder || []), ...emptySlots()].slice(0, 5), allyPrepicks: data.allyPrepicks, autoDetected: true });
  },
  setBan: (team, index, champion) => {
    const key = team === 'blue' ? 'blueBans' : 'redBans';
    const bans = [...get()[key]]; bans[index] = champion; get().change({ [key]: bans });
  },
  setAllyPick: (role, champion) => get().change({ allyPicks: { ...get().allyPicks, [role]: champion } }),
  clearAllyPick: role => get().setAllyPick(role, null),
  setEnemyPick: (index, champion) => { const picks = [...get().enemyPicks]; picks[index] = champion; get().change({ enemyPicks: picks }); },
  clearEnemyPick: index => get().setEnemyPick(index, null),
  setAllyPrepicks: prepicks => get().change({ allyPrepicks: { ...emptyAllies(), ...prepicks } }),
  setEnemyPicksFromLCU: picks => get().change({ enemyPicks: [...picks, ...emptySlots()].slice(0, 5) }),
  setPick: (team, role, champion) => {
    if (team === get().myTeam) get().setAllyPick(role, champion);
    else { const index = get().enemyPicks.findIndex(p => !p); if (index >= 0) get().setEnemyPick(index, champion); }
  },
  undo: () => {
    const stack = get().undoStack; if (!stack.length || get().mode === 'live') return;
    get().change(stack[stack.length - 1], false);
    set({ undoStack: stack.slice(0, -1), timeline: [...get().timeline, { at: new Date().toISOString(), state: snapshot(get()) }].slice(-100) });
  },
  resetDraft: (mode = get().mode) => {
    cancel();
    const { myTeam, myRole, myPickOrder } = get();
    set(s => ({ ...fresh(), ...resultFields(), myTeam, myRole, myPickOrder, sessionId: crypto.randomUUID(), revision: s.revision + 1,
      timeline: [], undoStack: [], loading: false, stale: false, error: null, mode, replayPosition: null }));
  },
  getAllBannedIds: () => [...get().blueBans, ...get().redBans].filter(Boolean).map(c => c.id),
  getAllPickedIds: () => [...Object.values(get().allyPicks), ...get().enemyPicks].filter(Boolean).map(c => c.id),
  getAllUnavailableIds: () => new Set([...get().getAllBannedIds(), ...get().getAllPickedIds()]),
  buildDraftState: () => {
    const s = get();
    const keyed = picks => Object.entries(picks).filter(([, c]) => c).map(([role, c]) => ({ champion_id: c.id, champion_key: c.key, role }));
    return { my_team: s.myTeam, my_role: s.myRole, my_pick_order: s.myPickOrder,
      bans: [...new Set(s.getAllBannedIds())], ally_picks: keyed(s.allyPicks), enemy_picks: s.enemyPicks.filter(Boolean).map(c => ({ champion_id: c.id, champion_key: c.key, role: c.role || null })),
      ally_prepicks: keyed(s.allyPrepicks), current_action: s.currentAction };
  },
  getRecommendations: async (championPool, weightOverrides, duoOptions) => {
    cancel(); const number = requestNumber; const revision = get().revision;
    requestController = new AbortController(); const signal = requestController.signal;
    set({ loading: true, error: null });
    const user = useUserStore.getState();
    const summoner = useLCUStore.getState().summoner;
    try {
      const data = await fetchRecommendations(get().buildDraftState(), championPool && !Array.isArray(championPool) ? championPool : user.championPool,
        weightOverrides && Object.keys(weightOverrides).length ? weightOverrides : user.weightOverrides,
        duoOptions === undefined ? useDuoStore.getState().getDuoOptions() : duoOptions,
        summoner?.puuid ? { puuid: summoner.puuid, region: summoner.region } : null,
        { signal, enableWildcard: user.enableWildcard, enableOffMeta: user.enableOffMeta });
      if (number !== requestNumber || revision !== get().revision || signal.aborted) return null;
      set({ recommendations: data.recommendations || [], banSuggestions: data.ban_suggestions || [], banImpact: data.ban_impact || [],
        compSummary: data.team_composition_summary || {}, warnings: data.warnings || [], winProbability: data.win_probability ?? null,
        dataStatus: data.data_status || null, loading: false, stale: false });
      return data;
    } catch (e) {
      if (number !== requestNumber || signal.aborted) return null;
      const detail = e.response?.data?.detail;
      set({ loading: false, error: typeof detail === 'string' ? detail : e.code === 'ECONNABORTED' ? 'Analyse trop longue. Réessaie dans quelques instants.' : 'Analyse indisponible. Vérifie la connexion au serveur.' });
      return null;
    }
  },
  exportSession: () => ({ schema_version: 1, session_id: get().sessionId, steps: get().timeline.length ? get().timeline : [{ at: new Date().toISOString(), state: snapshot(get()) }] }),
  loadReplay: (steps, index, newSession = false) => {
    steps = validateReplay({ schema_version: 1, steps }).steps;
    cancel();
    const step = steps[index]; if (!step) return;
    set(s => ({ ...fresh(), ...step.state, ...resultFields(), mode: 'replay', autoDetected: false, loading: false, error: null, stale: false,
      sessionId: newSession || s.mode !== 'replay' ? crypto.randomUUID() : s.sessionId, revision: s.revision + 1, timeline: steps, undoStack: [], replayPosition: index }));
  },
  forkReplay: () => {
    cancel();
    set(s => ({ mode: 'manual', sessionId: crypto.randomUUID(), timeline: s.timeline.slice(0, (s.replayPosition ?? s.timeline.length - 1) + 1),
      replayPosition: null, undoStack: [], loading: false }));
  },
}));
window.addEventListener('dalia:logout', () => useDraftStore.getState().resetDraft('manual'));
useUserStore.subscribe((next, before) => {
  if (['championPool', 'weightOverrides', 'enableWildcard', 'enableOffMeta'].some(k => next[k] !== before[k])) useDraftStore.getState().invalidateResults();
});
useDuoStore.subscribe((next, before) => {
  if (['duoActive', 'partnerRole', 'partnerPool', 'linked'].some(k => next[k] !== before[k])) useDraftStore.getState().invalidateResults();
});
export default useDraftStore;
