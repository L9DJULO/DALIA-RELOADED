import { create } from 'zustand';
import { fetchRecommendations, apiErrorText } from '../services/api';
import useLCUStore from './lcuStore';
import useUserStore from './userStore';
import useDuoStore from './duoStore';
import { validateReplay } from '../lib/replay';
import { ROLES } from '../lib/constants';

const emptyAllies = () => Object.fromEntries(ROLES.map(r => [r, null]));
const emptySlots = () => Array(5).fill(null);
const fresh = () => ({ myTeam: 'blue', myRole: 'mid', myPickOrder: 1, autoDetected: false,
  blueBans: emptySlots(), redBans: emptySlots(), allyPicks: emptyAllies(), enemyPicks: emptySlots(), allyPrepicks: emptyAllies(), currentAction: 0 });
// Corrections made by hand during a live champion select. The League client stays the
// source of truth: a manual champion fills a slot the client leaves empty and gives way as
// soon as the client puts a champion there (or anywhere else on the board).
const emptyOverrides = () => ({ myRole: null, allyPicks: {}, enemyPicks: [], blueBans: [], redBans: [] });
const resultFields = () => ({ recommendations: [], banSuggestions: [], banImpact: [], compSummary: {}, warnings: [], winProbability: null, dataStatus: null });

// Session tokens. Only a new session (new draft, replay load, fork, logout) discards an
// analysis still in flight. Board or preference edits keep the request running: its
// answer is applied and flagged `stale`, which beats showing nothing during a live
// champion select where teammates hover champions every few seconds.
let requestController = null;
let sessionNumber = 0;
const snapshot = s => Object.fromEntries(Object.keys(fresh()).map(k => [k, structuredClone(s[k])]));
const abortSession = () => { sessionNumber++; requestController?.abort(); requestController = null; liveData = null; };
// Last snapshot received from the League client, merged again after each manual correction.
let liveData = null;

function mergeLive(data, overrides, current) {
  const used = new Set([...data.blueBans, ...data.redBans, ...Object.values(data.allyPicks), ...(data.enemyPicksOrder || [])]
    .filter(Boolean).map(c => c.id));
  const take = c => { if (!c || used.has(c.id)) return null; used.add(c.id); return c; };
  const allyPicks = Object.fromEntries(ROLES.map(role => [role, data.allyPicks[role] || take(overrides.allyPicks[role])]));
  const list = (fromClient, manual) => [...fromClient.filter(Boolean), ...manual.map(take).filter(Boolean), ...emptySlots()].slice(0, 5);
  return { myTeam: data.myTeam || current.myTeam, myRole: overrides.myRole || data.myRole || current.myRole,
    myPickOrder: data.myPickOrder || current.myPickOrder, currentAction: data.currentAction ?? current.currentAction,
    blueBans: list(data.blueBans, overrides.blueBans), redBans: list(data.redBans, overrides.redBans), allyPicks,
    enemyPicks: list(data.enemyPicksOrder || [], overrides.enemyPicks), allyPrepicks: data.allyPrepicks, autoDetected: !overrides.myRole };
}
const listKey = slot => slot.type === 'ban' ? (slot.team === 'blue' ? 'blueBans' : 'redBans') : 'enemyPicks';

const useDraftStore = create((set, get) => ({
  ...fresh(), ...resultFields(), sessionId: crypto.randomUUID(), revision: 0,
  loading: false, error: null, stale: false, mode: 'live', timeline: [], undoStack: [], replayPosition: null, overrides: emptyOverrides(),
  change: (patch, record = true) => {
    const before = snapshot(get());
    const after = { ...before, ...patch };
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const step = { at: new Date().toISOString(), state: structuredClone(after) };
    set(s => ({ ...patch, revision: s.revision + 1, stale: s.recommendations.length > 0, replayPosition: null,
      ...(record ? { timeline: [...(s.timeline.length ? s.timeline : [{ at: step.at, state: before }]), step].slice(-100), undoStack: [...s.undoStack, before].slice(-50) } : {}) }));
  },
  /** A live champion select is on screen: manual edits correct it instead of ending the sync. */
  liveEditing: () => {
    const lcu = useLCUStore.getState();
    return get().mode === 'live' && lcu.connected && lcu.inChampSelect && liveData !== null;
  },
  // The League client knows the team for sure; the buttons are disabled while it is live.
  setMyTeam: myTeam => { if (get().liveEditing()) return; get().setMode('manual'); get().change({ myTeam, autoDetected: false }); },
  setMyRole: myRole => {
    if (get().liveEditing()) { set(s => ({ overrides: { ...s.overrides, myRole } })); get().change(mergeLive(liveData, get().overrides, get())); return; }
    get().setMode('manual'); get().change({ myRole, autoDetected: false });
  },
  /** Put a champion (or nothing) in a slot of the strip: { type: 'pick' | 'ban', team, role, index }. */
  editSlot: (slot, champion) => {
    const s = get();
    const allySide = slot.team === s.myTeam;
    if (!s.liveEditing()) {
      s.setMode('manual');
      if (slot.type === 'ban') s.setBan(slot.team, slot.index, champion);
      else if (allySide) s.setAllyPick(slot.role, champion);
      else s.setEnemyPick(slot.index, champion);
      return;
    }
    const overrides = structuredClone(s.overrides);
    if (slot.type === 'pick' && allySide) overrides.allyPicks[slot.role] = champion;
    else {
      const key = listKey(slot), shown = s[key][slot.index];
      const at = overrides[key].findIndex(c => c.id === shown?.id);
      const manual = overrides[key].filter(c => c.id !== shown?.id);
      if (champion) manual.splice(at >= 0 ? at : manual.length, 0, champion);
      overrides[key] = manual;
    }
    set({ overrides });
    get().change(mergeLive(liveData, overrides, get()));
  },
  /** Whether the champion shown in a slot was put there by hand (and can be removed). */
  isManualSlot: slot => {
    const s = get();
    const ally = slot.type === 'pick' && slot.team === s.myTeam;
    const shown = ally ? s.allyPicks[slot.role] : s[listKey(slot)][slot.index];
    if (!shown) return false;
    if (!s.liveEditing()) return true;
    if (ally) return s.overrides.allyPicks[slot.role]?.id === shown.id;
    return s.overrides[listKey(slot)].some(c => c.id === shown.id);
  },
  setMyPickOrder: myPickOrder => get().change({ myPickOrder: Number(myPickOrder) }),
  setMode: mode => {
    const current = get().mode;
    if (current === mode) return;
    // Leaving a replay keeps only the steps seen so far: the future of the recording
    // must not silently become the past of the new manual or live session.
    if (current === 'replay') get().forkReplay();
    set({ mode });
  },
  invalidateResults: () => set(s => ({ revision: s.revision + 1, stale: s.recommendations.length > 0 })),
  applyLCU: data => {
    if (get().mode !== 'live') return;
    liveData = data;
    get().change(mergeLive(data, get().overrides, get()));
  },
  setBan: (team, index, champion) => {
    const key = team === 'blue' ? 'blueBans' : 'redBans';
    const bans = [...get()[key]]; bans[index] = champion; get().change({ [key]: bans });
  },
  setAllyPick: (role, champion) => get().change({ allyPicks: { ...get().allyPicks, [role]: champion } }),
  clearAllyPick: role => get().setAllyPick(role, null),
  setEnemyPick: (index, champion) => { const picks = [...get().enemyPicks]; picks[index] = champion; get().change({ enemyPicks: picks }); },
  clearEnemyPick: index => get().setEnemyPick(index, null),
  undo: () => {
    const stack = get().undoStack; if (!stack.length || get().mode === 'live') return;
    get().change(stack[stack.length - 1], false);
    set({ undoStack: stack.slice(0, -1), timeline: [...get().timeline, { at: new Date().toISOString(), state: snapshot(get()) }].slice(-100) });
  },
  resetDraft: (mode = get().mode) => {
    abortSession();
    const { myTeam, myRole, myPickOrder } = get();
    set(s => ({ ...fresh(), ...resultFields(), myTeam, myRole, myPickOrder, sessionId: crypto.randomUUID(), revision: s.revision + 1,
      timeline: [], undoStack: [], loading: false, stale: false, error: null, mode, replayPosition: null, overrides: emptyOverrides() }));
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
    // A newer click supersedes the previous request; the session itself continues.
    requestController?.abort();
    requestController = new AbortController();
    const signal = requestController.signal;
    const session = sessionNumber; const revision = get().revision;
    set({ loading: true, error: null });
    const user = useUserStore.getState();
    const summoner = useLCUStore.getState().summoner;
    try {
      const data = await fetchRecommendations(get().buildDraftState(), championPool && !Array.isArray(championPool) ? championPool : user.championPool,
        weightOverrides && Object.keys(weightOverrides).length ? weightOverrides : user.weightOverrides,
        duoOptions === undefined ? useDuoStore.getState().getDuoOptions() : duoOptions,
        summoner?.puuid ? { puuid: summoner.puuid, region: summoner.region } : null,
        { signal, enableWildcard: user.enableWildcard, enableOffMeta: user.enableOffMeta,
          rankBucket: summoner?.rankTier || user.rankTier || null });
      if (session !== sessionNumber || signal.aborted) return null;
      set({ recommendations: data.recommendations || [], banSuggestions: data.ban_suggestions || [], banImpact: data.ban_impact || [],
        compSummary: data.team_composition_summary || {}, warnings: data.warnings || [], winProbability: data.win_probability ?? null,
        dataStatus: data.data_status || null, loading: false, stale: revision !== get().revision });
      return data;
    } catch (e) {
      if (session !== sessionNumber || signal.aborted) return null;
      const fallback = e.code === 'ECONNABORTED' ? 'Analyse trop longue. Réessaie dans quelques instants.' : 'Analyse indisponible. Vérifie la connexion au serveur.';
      set({ loading: false, error: apiErrorText(e, fallback) });
      return null;
    }
  },
  exportSession: () => ({ schema_version: 1, session_id: get().sessionId, steps: get().timeline.length ? get().timeline : [{ at: new Date().toISOString(), state: snapshot(get()) }] }),
  loadReplay: (steps, index, newSession = false) => {
    steps = validateReplay({ schema_version: 1, steps }).steps;
    abortSession();
    const step = steps[index]; if (!step) return;
    set(s => ({ ...fresh(), ...step.state, ...resultFields(), mode: 'replay', autoDetected: false, loading: false, error: null, stale: false,
      sessionId: newSession || s.mode !== 'replay' ? crypto.randomUUID() : s.sessionId, revision: s.revision + 1, timeline: steps, undoStack: [], replayPosition: index,
      overrides: emptyOverrides() }));
  },
  forkReplay: () => {
    abortSession();
    set(s => ({ mode: 'manual', sessionId: crypto.randomUUID(), timeline: s.timeline.slice(0, (s.replayPosition ?? s.timeline.length - 1) + 1),
      replayPosition: null, undoStack: [], loading: false, ...resultFields(), stale: false, overrides: emptyOverrides() }));
  },
}));
window.addEventListener('dalia:logout', () => useDraftStore.getState().resetDraft('manual'));
useUserStore.subscribe((next, before) => {
  if (['championPool', 'weightOverrides', 'enableWildcard', 'enableOffMeta', 'rankTier'].some(k => next[k] !== before[k])) useDraftStore.getState().invalidateResults();
});
useDuoStore.subscribe((next, before) => {
  if (['duoActive', 'partnerRole', 'partnerPool', 'linked'].some(k => next[k] !== before[k])) useDraftStore.getState().invalidateResults();
});
export default useDraftStore;
