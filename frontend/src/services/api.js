import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// ── Champions ─────────────────────────────────────────
export const fetchChampions = (role) =>
  api.get('/champions', { params: role ? { role } : {} }).then((r) => r.data);

export const fetchChampion = (id) =>
  api.get(`/champions/${id}`).then((r) => r.data);

// ── Meta / Tierlist ───────────────────────────────────
export const fetchTierlist = (role = 'mid') =>
  api.get('/meta/tierlist', { params: { role } }).then((r) => r.data);

// ── Draft ─────────────────────────────────────────────
export const fetchRecommendations = (draftState, championPool, weightOverrides = null) =>
  api
    .post('/draft/recommend', {
      draft_state: draftState,
      champion_pool: championPool,
      weight_overrides: weightOverrides,
    })
    .then((r) => r.data);

// ── User Profile ──────────────────────────────────────
export const fetchProfile = (username = 'default') =>
  api.get('/user/profile', { params: { username } }).then((r) => r.data);

export const saveProfile = (profile) =>
  api.post('/user/profile', profile).then((r) => r.data);

export const updatePool = (role, entries, username = 'default') =>
  api.post('/user/pool', { username, role, entries }).then((r) => r.data);

// ── Patch ─────────────────────────────────────────────
export const fetchPatch = () => api.get('/patch').then((r) => r.data);

// ── LCU (Live Client) ─────────────────────────────────
export const fetchLCUStatus = () => api.get('/lcu/status').then((r) => r.data);
export const connectLCU = () => api.post('/lcu/connect').then((r) => r.data);
export const startLCUPolling = (interval = 1.0) => 
  api.post('/lcu/start-polling', null, { params: { interval } }).then((r) => r.data);
export const stopLCUPolling = () => api.post('/lcu/stop-polling').then((r) => r.data);
export const fetchLCUOverlay = () => api.get('/lcu/overlay').then((r) => r.data);

// ── Draft History ─────────────────────────────────────
export const fetchHistory = (username = 'default', limit = 50) =>
  api.get('/history', { params: { username, limit } }).then((r) => r.data);
export const saveHistoryEntry = (entry, username = 'default') =>
  api.post('/history', entry, { params: { username } }).then((r) => r.data);
export const updateHistoryResult = (entryId, result, notes = '', username = 'default') =>
  api.patch(`/history/${entryId}`, { result, notes }, { params: { username } }).then((r) => r.data);
export const deleteHistoryEntry = (entryId, username = 'default') =>
  api.delete(`/history/${entryId}`, { params: { username } }).then((r) => r.data);
export const fetchHistoryStats = (username = 'default') =>
  api.get('/history/stats', { params: { username } }).then((r) => r.data);

// ── Ban Recommendations ───────────────────────────────
export const fetchBanRecommendations = (myRole, championPool, alreadyBanned = [], alreadyPicked = []) =>
  api.post('/draft/bans', {
    my_role: myRole,
    champion_pool: championPool,
    already_banned: alreadyBanned,
    already_picked: alreadyPicked,
  }).then((r) => r.data);

export default api;
