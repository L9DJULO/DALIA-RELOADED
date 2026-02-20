/**
 * Zustand store — Draft state, recommendations, draft board management.
 */
import { create } from 'zustand';
import { fetchRecommendations } from '../services/api';
import useLCUStore from './lcuStore';

const EMPTY_ALLY_PICKS = () => ({ top: null, jungle: null, mid: null, bot: null, support: null });
const EMPTY_ENEMY_PICKS = () => [null, null, null, null, null];

const useDraftStore = create((set, get) => ({
  // ── Draft setup ──
  myTeam: 'blue',         // "blue" | "red"
  myRole: 'mid',
  autoDetected: false,    // true when team/role came from LCU

  // ── Bans ──
  blueBans: [null, null, null, null, null],
  redBans:  [null, null, null, null, null],

  // ── Picks ──
  // allyPicks: role-keyed { top, jungle, mid, bot, support } — I know my team's roles
  // enemyPicks: ordered array [P1..P5] — roles unknown, we only see pick order
  allyPicks: EMPTY_ALLY_PICKS(),
  enemyPicks: EMPTY_ENEMY_PICKS(),

  // ── Recommendations ──
  recommendations: [],
  compSummary: {},
  warnings: [],
  winProbability: null,
  loading: false,
  error: null,

  // ── Draft phase tracking ──
  currentAction: 0,

  // ═════════════════════════════════════════════════════════
  //  ACTIONS
  // ═════════════════════════════════════════════════════════
  setMyTeam: (team) => set({ myTeam: team, autoDetected: false }),
  setMyRole: (role) => set({ myRole: role, autoDetected: false }),
  setFromLCU: (team, role) => set({ myTeam: team, myRole: role, autoDetected: true }),

  // ── Bans ──
  setBan: (team, index, champion) => {
    const key = team === 'blue' ? 'blueBans' : 'redBans';
    const bans = [...get()[key]];
    bans[index] = champion; // champion = {id, key, name} or null
    set({ [key]: bans });
  },

  // ── Ally picks (role-keyed — my team) ──
  setAllyPick: (role, champion) => {
    const picks = { ...get().allyPicks };
    picks[role] = champion;
    set({ allyPicks: picks });
  },

  clearAllyPick: (role) => {
    const picks = { ...get().allyPicks };
    picks[role] = null;
    set({ allyPicks: picks });
  },

  // ── Enemy picks (ordered array — roles unknown) ──
  setEnemyPick: (index, champion) => {
    const picks = [...get().enemyPicks];
    picks[index] = champion;
    set({ enemyPicks: picks });
  },

  clearEnemyPick: (index) => {
    const picks = [...get().enemyPicks];
    picks[index] = null;
    set({ enemyPicks: picks });
  },

  // ── Team-aware pick (used by LCU auto-sync) ──
  setPick: (team, role, champion) => {
    const myTeam = get().myTeam;
    if (team === myTeam) {
      // Ally pick → role-keyed
      const picks = { ...get().allyPicks };
      picks[role] = champion;
      set({ allyPicks: picks });
    } else {
      // Enemy pick → index-based (map role to slot index)
      const roleToIndex = { top: 0, jungle: 1, mid: 2, bot: 3, support: 4 };
      const idx = roleToIndex[role] ?? 0;
      const picks = [...get().enemyPicks];
      picks[idx] = champion;
      set({ enemyPicks: picks });
    }
  },

  // ── Reset ──
  resetDraft: () =>
    set({
      blueBans: [null, null, null, null, null],
      redBans:  [null, null, null, null, null],
      allyPicks: EMPTY_ALLY_PICKS(),
      enemyPicks: EMPTY_ENEMY_PICKS(),
      recommendations: [],
      compSummary: {},
      warnings: [],
      winProbability: null,
      currentAction: 0,
      error: null,
    }),

  // ── Computed helpers ──
  getAllBannedIds: () => {
    const s = get();
    return [
      ...s.blueBans.filter(Boolean).map((b) => b.id),
      ...s.redBans.filter(Boolean).map((b) => b.id),
    ];
  },

  getAllPickedIds: () => {
    const s = get();
    const ids = [];
    for (const c of Object.values(s.allyPicks)) if (c) ids.push(c.id);
    for (const c of s.enemyPicks) if (c) ids.push(c.id);
    return ids;
  },

  getAllUnavailableIds: () => {
    return new Set([...get().getAllBannedIds(), ...get().getAllPickedIds()]);
  },

  // ── Build draft state for API ──
  buildDraftState: () => {
    const s = get();
    const bans = s.getAllBannedIds();

    // Ally picks: role is known
    const allyPicks = Object.entries(s.allyPicks)
      .filter(([_, c]) => c !== null)
      .map(([role, c]) => ({ champion_id: c.id, champion_key: c.key, role }));

    // Enemy picks: role is unknown (only pick order is visible in draft)
    const enemyPicks = s.enemyPicks
      .filter(Boolean)
      .map((c) => ({ champion_id: c.id, champion_key: c.key, role: null }));

    return {
      my_team: s.myTeam,
      my_role: s.myRole,
      bans,
      ally_picks: allyPicks,
      enemy_picks: enemyPicks,
      current_action: s.currentAction,
    };
  },

  // ── Fetch Recommendations ──
  getRecommendations: async (championPool, weightOverrides, duoOptions = null) => {
    set({ loading: true, error: null });
    try {
      const draftState = get().buildDraftState();
      // Get summoner identity from LCU store for personal stats
      const summoner = useLCUStore.getState().summoner;
      const personalIdentity = summoner?.puuid
        ? { puuid: summoner.puuid, region: summoner.region }
        : null;
      const data = await fetchRecommendations(draftState, championPool, weightOverrides, duoOptions, personalIdentity);
      set({
        recommendations: data.recommendations || [],
        compSummary: data.team_composition_summary || {},
        warnings: data.warnings || [],
        winProbability: data.win_probability ?? null,
        loading: false,
      });
    } catch (e) {
      console.error('Draft recommendation failed:', e);
      set({ error: e.message || 'Erreur de recommandation', loading: false });
    }
  },
}));

export default useDraftStore;
