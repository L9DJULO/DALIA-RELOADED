/**
 * Zustand store — LCU (League Client) connection and live draft sync.
 *
 * Now uses Tauri IPC commands (Rust LCU connector) instead of server API.
 * Falls back gracefully when not running inside Tauri.
 */
import { create } from 'zustand';
import { lcuConnect, lcuStatus, lcuDisconnect, lcuSummonerInfo } from '../services/lcu';

const useLCUStore = create((set, get) => ({
  // ── Connection state ──
  connected: false,
  inChampSelect: false,
  gamePhase: '',
  
  // ── My info ──
  myTeam: '',
  myRole: '',
  
  // ── Summoner identity (linked Riot account) ──
  summoner: null,  // { puuid, gameName, tagLine, summonerId, region, ... }
  
  // ── Live draft data ──
  allyBans: [],
  enemyBans: [],
  allyPicks: {},
  enemyPicks: {},
  enemyPicksOrder: [],  // ordered list of enemy champion IDs (no roles)
  allyPrepicks: {},     // role → champId (ally hover/intent picks)
  
  // ── Current action ──
  currentActionType: '',
  isMyTurn: false,
  timerRemaining: 0,
  
  // ── Polling ──
  polling: false,
  pollInterval: null,
  lastUpdate: null,
  error: null,
  
  // ── Auto-sync with draft store ──
  autoSync: true,
  
  // ═════════════════════════════════════════════════════════
  //  ACTIONS
  // ═════════════════════════════════════════════════════════
  
  setAutoSync: (enabled) => set({ autoSync: enabled }),
  
  /**
   * Fetch current LCU status via Tauri IPC (local Rust connector)
   */
  fetchStatus: async () => {
    try {
      const data = await lcuStatus();
      const wasConnected = get().connected;
      set({
        connected: data.connected,
        inChampSelect: data.in_champ_select,
        gamePhase: data.game_phase,
        myTeam: data.my_team,
        myRole: data.my_role,
        allyBans: data.ally_bans || [],
        enemyBans: data.enemy_bans || [],
        allyPicks: data.ally_picks || {},
        enemyPicks: data.enemy_picks || {},
        enemyPicksOrder: data.enemy_picks_order || [],
        allyPrepicks: data.ally_prepicks || {},
        currentActionType: data.current_action_type,
        isMyTurn: data.is_my_turn,
        timerRemaining: data.timer_remaining,
        lastUpdate: new Date(),
        error: null,
      });
      // Auto-fetch summoner info when LCU becomes connected
      if (data.connected && !wasConnected) {
        get().fetchSummonerInfo();
      }
      // Also fetch if connected but summoner not yet loaded
      if (data.connected && !get().summoner) {
        get().fetchSummonerInfo();
      }
      return data;
    } catch (e) {
      set({ error: e.message || 'Failed to fetch LCU status' });
      return null;
    }
  },
  
  /**
   * Manually trigger connection to LCU via Tauri
   */
  connect: async () => {
    try {
      const connected = await lcuConnect();
      if (connected) {
        await get().fetchStatus();
        await get().fetchSummonerInfo();
        return { status: 'connected', message: 'Connecté au client League' };
      }
      return { status: 'disconnected', message: 'Client League non trouvé' };
    } catch (e) {
      set({ error: e.message || 'Failed to connect to LCU' });
      return { status: 'error', message: e.message };
    }
  },
  
  /**
   * Fetch summoner identity from LCU (linked Riot account)
   */
  fetchSummonerInfo: async () => {
    try {
      const data = await lcuSummonerInfo();
      if (data.available) {
        set({
          summoner: {
            puuid: data.puuid,
            gameName: data.game_name,
            tagLine: data.tag_line,
            summonerId: data.summoner_id,
            accountId: data.account_id,
            summonerLevel: data.summoner_level,
            profileIconId: data.profile_icon_id,
            region: data.region,
          },
        });
      }
      return data;
    } catch (e) {
      console.warn('Failed to fetch summoner info:', e);
      return null;
    }
  },
  
  /**
   * Start polling LCU status
   */
  startPolling: (intervalMs = 1000) => {
    const state = get();
    if (state.polling) return;
    
    const pollFn = async () => {
      await get().fetchStatus();
    };
    
    // Immediate fetch
    pollFn();
    
    // Set up interval
    const interval = setInterval(pollFn, intervalMs);
    set({ polling: true, pollInterval: interval });
  },
  
  /**
   * Stop polling LCU status
   */
  stopPolling: () => {
    const state = get();
    if (state.pollInterval) {
      clearInterval(state.pollInterval);
    }
    set({ polling: false, pollInterval: null });
  },
  
  /**
   * Get draft state formatted for syncing with draftStore.
   * @param {Object} champMap - champion lookup {id: {id, key, name}} to resolve raw IDs from LCU
   */
  getDraftSyncData: (champMap = {}) => {
    const s = get();
    if (!s.inChampSelect) return null;

    // Resolve a raw champion ID (number) into {id, key, name}
    const resolveChamp = (id) => {
      if (!id) return null;
      const c = champMap[id];
      if (c) return { id: c.id, key: c.key, name: c.name };
      // Fallback when champion list is unavailable
      return { id, key: String(id), name: `Champion ${id}` };
    };

    // Format bans for draftStore (array of 5 slots)
    const formatBans = (bans) => {
      const result = [null, null, null, null, null];
      bans.forEach((banId, i) => {
        if (i < 5 && banId) {
          result[i] = resolveChamp(banId);
        }
      });
      return result;
    };

    // Format picks for draftStore (object by role)
    const formatPicks = (picks) => {
      const result = { top: null, jungle: null, mid: null, bot: null, support: null };
      for (const [role, champId] of Object.entries(picks)) {
        if (champId && result.hasOwnProperty(role)) {
          result[role] = resolveChamp(champId);
        }
      }
      return result;
    };

    // Format enemy picks from ordered list (no roles — server will predict)
    const formatEnemyPicksOrder = (orderedIds) => {
      return orderedIds
        .filter((id) => id > 0)
        .map((id) => resolveChamp(id))
        .filter(Boolean);
    };

    // Format ally pre-picks (hover/intent) by role
    const formatPrepicks = (prepicks) => {
      const result = { top: null, jungle: null, mid: null, bot: null, support: null };
      for (const [role, champId] of Object.entries(prepicks)) {
        if (champId && result.hasOwnProperty(role)) {
          result[role] = resolveChamp(champId);
        }
      }
      return result;
    };

    // Determine which team is blue/red based on myTeam
    const isBlue = s.myTeam === 'blue';

    // Use enemy_picks_order (no roles) when available,
    // fall back to role-keyed enemy_picks (may have real LCU roles)
    const hasEnemyOrder = s.enemyPicksOrder && s.enemyPicksOrder.length > 0;

    return {
      myTeam: s.myTeam,
      myRole: s.myRole,
      blueBans: formatBans(isBlue ? s.allyBans : s.enemyBans),
      redBans: formatBans(isBlue ? s.enemyBans : s.allyBans),
      // Ally picks: always role-keyed (we know our team's roles)
      allyPicks: formatPicks(s.allyPicks),
      // Enemy picks: prefer ordered list (no fake roles)
      enemyPicksOrder: hasEnemyOrder ? formatEnemyPicksOrder(s.enemyPicksOrder) : null,
      // Fallback: role-keyed enemy picks (only if LCU provided real roles)
      bluePicks: formatPicks(isBlue ? s.allyPicks : s.enemyPicks),
      redPicks: formatPicks(isBlue ? s.enemyPicks : s.allyPicks),
      // Ally pre-picks (hover/intent)
      allyPrepicks: formatPrepicks(s.allyPrepicks),
    };
  },
}));

export default useLCUStore;
