/**
 * Zustand store — Draft state, recommendations, draft board management.
 */
import { create } from 'zustand';
import { fetchRecommendations } from '../services/api';

const EMPTY_PICKS = () => ({ top: null, jungle: null, mid: null, bot: null, support: null });

const useDraftStore = create((set, get) => ({
  // ── Draft setup ──
  myTeam: 'blue',         // "blue" | "red"
  myRole: 'mid',

  // ── Bans ──
  blueBans: [null, null, null, null, null],
  redBans:  [null, null, null, null, null],

  // ── Picks ── (each is {id, key, name, role} or null)
  bluePicks: EMPTY_PICKS(),
  redPicks:  EMPTY_PICKS(),

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
  setMyTeam: (team) => set({ myTeam: team }),
  setMyRole: (role) => set({ myRole: role }),

  // ── Bans ──
  setBan: (team, index, champion) => {
    const key = team === 'blue' ? 'blueBans' : 'redBans';
    const bans = [...get()[key]];
    bans[index] = champion; // champion = {id, key, name} or null
    set({ [key]: bans });
  },

  // ── Picks ──
  setPick: (team, role, champion) => {
    const key = team === 'blue' ? 'bluePicks' : 'redPicks';
    const picks = { ...get()[key] };
    picks[role] = champion; // champion = {id, key, name} or null
    set({ [key]: picks });
  },

  clearPick: (team, role) => {
    const key = team === 'blue' ? 'bluePicks' : 'redPicks';
    const picks = { ...get()[key] };
    picks[role] = null;
    set({ [key]: picks });
  },

  // ── Reset ──
  resetDraft: () =>
    set({
      blueBans: [null, null, null, null, null],
      redBans:  [null, null, null, null, null],
      bluePicks: EMPTY_PICKS(),
      redPicks:  EMPTY_PICKS(),
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
    for (const c of Object.values(s.bluePicks)) if (c) ids.push(c.id);
    for (const c of Object.values(s.redPicks)) if (c) ids.push(c.id);
    return ids;
  },

  getAllUnavailableIds: () => {
    return new Set([...get().getAllBannedIds(), ...get().getAllPickedIds()]);
  },

  // ── Build draft state for API ──
  buildDraftState: () => {
    const s = get();
    const bans = s.getAllBannedIds();

    const allyKey = s.myTeam === 'blue' ? 'bluePicks' : 'redPicks';
    const enemyKey = s.myTeam === 'blue' ? 'redPicks' : 'bluePicks';

    const allyPicks = Object.entries(s[allyKey])
      .filter(([_, c]) => c !== null)
      .map(([role, c]) => ({ champion_id: c.id, champion_key: c.key, role }));

    const enemyPicks = Object.entries(s[enemyKey])
      .filter(([_, c]) => c !== null)
      .map(([role, c]) => ({ champion_id: c.id, champion_key: c.key, role }));

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
  getRecommendations: async (championPool, weightOverrides) => {
    set({ loading: true, error: null });
    try {
      const draftState = get().buildDraftState();
      const data = await fetchRecommendations(draftState, championPool, weightOverrides);
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
