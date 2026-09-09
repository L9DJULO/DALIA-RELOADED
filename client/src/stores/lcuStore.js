import { create } from 'zustand';
import { lcuConnect, lcuStatus, lcuDisconnect, lcuSummonerInfo } from '../services/lcu';
const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
const PICK_TEAMS = ['blue', 'red', 'red', 'blue', 'blue', 'red', 'red', 'blue', 'blue', 'red'];
let generation = 0;
let identityPending = false;
const empty = () => ({ connected: false, inChampSelect: false, gamePhase: '', myTeam: '', myRole: '',
  myPickOrder: 1, currentAction: 0, summoner: null, allyBans: [], enemyBans: [], allyPicks: {}, enemyPicks: {},
  enemyPicksOrder: [], allyPrepicks: {}, pickSequence: [], currentActionType: '', isMyTurn: false,
  timerRemaining: 0, polling: false, pollInterval: null, lastUpdate: null, error: null, autoSync: true });
const useLCUStore = create((set, get) => ({
  ...empty(),
  setAutoSync: autoSync => set({ autoSync }),
  fetchStatus: async () => {
    const ticket = generation;
    try {
      const data = await lcuStatus();
      if (ticket !== generation) return null;
      set({ connected: !!data.connected, inChampSelect: !!data.in_champ_select, gamePhase: data.game_phase || '',
        myTeam: data.my_team || '', myRole: data.my_role || '', myPickOrder: data.my_pick_order || 1,
        currentAction: data.current_action || 0, allyBans: data.ally_bans || [], enemyBans: data.enemy_bans || [],
        allyPicks: data.ally_picks || {}, enemyPicks: data.enemy_picks || {}, enemyPicksOrder: data.enemy_picks_order || [],
        allyPrepicks: data.ally_prepicks || {}, pickSequence: data.pick_sequence || [],
        currentActionType: data.current_action_type || '', isMyTurn: !!data.is_my_turn,
        timerRemaining: data.timer_remaining || 0, lastUpdate: new Date(), error: null,
        ...(!data.connected ? { summoner: null } : {}) });
      if (data.connected && !get().summoner && !identityPending) await get().fetchSummonerInfo();
      return data;
    } catch (e) {
      if (ticket === generation) set({ error: e.message || 'Connexion League indisponible' });
      return null;
    }
  },
  connect: async () => {
    try {
      if (await lcuConnect()) { await get().fetchStatus(); return { status: 'connected', message: 'Connecté au client League' }; }
      return { status: 'disconnected', message: 'Client League non trouvé' };
    } catch { return { status: 'error', message: 'Connexion League indisponible' }; }
  },
  disconnect: async () => { get().stopPolling(); await lcuDisconnect(); set(empty()); },
  fetchSummonerInfo: async () => {
    const ticket = generation; identityPending = true;
    try {
      const data = await lcuSummonerInfo();
      if (ticket === generation && get().connected && data.available) set({ summoner: {
        puuid: data.puuid, gameName: data.game_name, tagLine: data.tag_line, summonerId: data.summoner_id,
        accountId: data.account_id, summonerLevel: data.summoner_level, profileIconId: data.profile_icon_id, region: data.region } });
      return data;
    } catch { return null; } finally { identityPending = false; }
  },
  startPolling: (intervalMs = 500) => {
    if (get().polling) return;
    const ticket = ++generation;
    set({ polling: true });
    const poll = async () => {
      if (ticket !== generation) return;
      await get().fetchStatus();
      if (ticket === generation && get().polling) set({ pollInterval: setTimeout(poll, intervalMs) });
    };
    void poll();
  },
  stopPolling: () => { generation++; clearTimeout(get().pollInterval); set({ polling: false, pollInterval: null }); },
  buildPickOrderTimeline: (byId = {}) => PICK_TEAMS.map((team, i) => {
    const s = get(), pick = s.pickSequence[i];
    return { team: pick?.team || team, role: pick?.role || null, key: byId[pick?.champId]?.key || null,
      done: !!pick, current: !pick && i === s.pickSequence.length && s.currentActionType === 'pick' };
  }),
  getDraftSyncData: (byId = {}) => {
    const s = get(); if (!s.inChampSelect || !s.connected) return null;
    const resolve = id => byId[id] ? { id: byId[id].id, key: byId[id].key, name: byId[id].name } : id > 0 ? { id, key: '', name: `Champion ${id}` } : null;
    const bans = ids => Array.from({ length: 5 }, (_, i) => resolve(ids[i]));
    const picks = source => Object.fromEntries(ROLES.map(role => [role, resolve(source[role])]));
    return { myTeam: s.myTeam, myRole: s.myRole, myPickOrder: s.myPickOrder, currentAction: s.currentAction,
      blueBans: bans(s.myTeam === 'blue' ? s.allyBans : s.enemyBans), redBans: bans(s.myTeam === 'blue' ? s.enemyBans : s.allyBans),
      allyPicks: picks(s.allyPicks), allyPrepicks: picks(s.allyPrepicks), enemyPicksOrder: s.enemyPicksOrder.map(resolve) };
  },
}));
window.addEventListener('dalia:logout', () => { useLCUStore.getState().stopPolling(); useLCUStore.setState(empty()); });
export default useLCUStore;
