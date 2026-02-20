/**
 * DALIA Client — API service.
 *
 * Connects to the remote DALIA server.
 * Includes JWT auth token management.
 */
import axios from 'axios';

// Server URL — in dev, Vite proxy handles /api → localhost:8000
// In Tauri production build, use the configured server URL
const IS_TAURI = typeof window !== 'undefined' && window.__TAURI__;
const _raw = IS_TAURI
  ? (localStorage.getItem('dalia_server_url') || 'http://localhost:8000')
  : '';
// Strip trailing slash to avoid double-slash in URLs
const SERVER_URL = _raw.replace(/\/+$/, '');

const api = axios.create({
  baseURL: `${SERVER_URL}/api`,
  timeout: 30000,
});

// ── Auth token interceptor ────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('dalia_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── 401 handler — clear token on expiry ───────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('dalia_token');
      localStorage.removeItem('dalia_user');
      window.dispatchEvent(new Event('dalia:logout'));
    }
    return Promise.reject(error);
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  AUTH
// ═════════════════════════════════════════════════════════════════════════
export const register = (username, email, password) =>
  api.post('/auth/register', { username, email, password }).then((r) => r.data);

export const login = (username, password) =>
  api.post('/auth/login', { username, password }).then((r) => r.data);

export const fetchMe = () =>
  api.get('/auth/me').then((r) => r.data);

export const updateMe = (settings) =>
  api.put('/auth/me', null, { params: settings }).then((r) => r.data);

// ═════════════════════════════════════════════════════════════════════════
//  CHAMPIONS
// ═════════════════════════════════════════════════════════════════════════
export const fetchChampions = (role) =>
  api.get('/champions', { params: role ? { role } : {} }).then((r) => r.data);

export const fetchChampion = (id) =>
  api.get(`/champions/${id}`).then((r) => r.data);

// ═════════════════════════════════════════════════════════════════════════
//  META / TIERLIST
// ═════════════════════════════════════════════════════════════════════════
export const fetchTierlist = (role = 'mid') =>
  api.get('/meta/tierlist', { params: { role } }).then((r) => r.data);

// ═════════════════════════════════════════════════════════════════════════
//  DRAFT
// ═════════════════════════════════════════════════════════════════════════
export const fetchRecommendations = (
  draftState,
  championPool,
  weightOverrides = null,
  duoOptions = null,
  personalIdentity = null,
) =>
  api
    .post('/draft/recommend', {
      draft_state: draftState,
      champion_pool: championPool,
      weight_overrides: weightOverrides,
      ...(duoOptions?.active
        ? {
            duo_active: true,
            duo_partner_role: duoOptions.partnerRole,
          }
        : {}),
      ...(personalIdentity?.puuid
        ? {
            puuid: personalIdentity.puuid,
            region: personalIdentity.region || 'EUW1',
          }
        : {}),
    })
    .then((r) => r.data);

// ═════════════════════════════════════════════════════════════════════════
//  USER PROFILE & POOL (now auth-protected, no username param needed)
// ═════════════════════════════════════════════════════════════════════════
export const fetchProfile = () =>
  api.get('/user/profile').then((r) => r.data);

export const fetchPool = () =>
  api.get('/user/pool').then((r) => r.data);

export const updatePool = (role, entries) =>
  api.post('/user/pool', { role, entries }).then((r) => r.data);

export const removeFromPool = (role, championId) =>
  api.delete(`/user/pool/${role}/${championId}`).then((r) => r.data);

// ═════════════════════════════════════════════════════════════════════════
//  PATCH
// ═════════════════════════════════════════════════════════════════════════
export const fetchPatch = () => api.get('/patch').then((r) => r.data);

// ═════════════════════════════════════════════════════════════════════════
//  DRAFT HISTORY (auth-protected, no username param needed)
// ═════════════════════════════════════════════════════════════════════════
export const fetchHistory = (limit = 50) =>
  api.get('/history', { params: { limit } }).then((r) => r.data);

export const saveHistoryEntry = (entry) =>
  api.post('/history', entry).then((r) => r.data);

export const updateHistoryResult = (entryId, result, notes = '') =>
  api.patch(`/history/${entryId}`, { result, notes }).then((r) => r.data);

export const deleteHistoryEntry = (entryId) =>
  api.delete(`/history/${entryId}`).then((r) => r.data);

export const fetchHistoryStats = () =>
  api.get('/history/stats').then((r) => r.data);

// ═════════════════════════════════════════════════════════════════════════
//  BAN RECOMMENDATIONS
// ═════════════════════════════════════════════════════════════════════════
export const fetchBanRecommendations = (myRole, championPool, alreadyBanned = [], alreadyPicked = []) =>
  api.post('/draft/bans', {
    my_role: myRole,
    champion_pool: championPool,
    already_banned: alreadyBanned,
    already_picked: alreadyPicked,
  }).then((r) => r.data);

// ═════════════════════════════════════════════════════════════════════════
//  ML / EMBEDDINGS
// ═════════════════════════════════════════════════════════════════════════
export const fetchMLStatus = () => api.get('/ml/status').then((r) => r.data);
export const triggerRetrain = () => api.post('/ml/retrain').then((r) => r.data);
export const reloadModel = () => api.post('/ml/reload').then((r) => r.data);
export const fetchEmbeddings = (role = 'mid') =>
  api.get('/ml/embeddings', { params: { role } }).then((r) => r.data);
export const fetchSimilarChampions = (championId, role = 'mid', n = 8) =>
  api.get(`/ml/similar/${championId}`, { params: { role, n } }).then((r) => r.data);

// ═════════════════════════════════════════════════════════════════════════
//  PERSONAL STATS (via LCU identity)
// ═════════════════════════════════════════════════════════════════════════
export const fetchPersonalStats = (puuid, region = 'EUW1', queue = 'ranked', count = 50) =>
  api.post('/personal/stats', { puuid, region, queue, count }).then((r) => r.data);
// ═══════════════════════════════════════════════════════
//  DUOQ
// ═══════════════════════════════════════════════════════
export const fetchDuoCode = () =>
  api.get('/duo/code').then((r) => r.data);

export const regenerateDuoCode = () =>
  api.post('/duo/code/regenerate').then((r) => r.data);

export const fetchDuoStatus = () =>
  api.get('/duo/status').then((r) => r.data);

export const linkDuo = (code) =>
  api.post('/duo/link', { code }).then((r) => r.data);

export const unlinkDuo = () =>
  api.delete('/duo/unlink').then((r) => r.data);

export const fetchDuoPartnerPool = () =>
  api.get('/duo/partner/pool').then((r) => r.data);
// ═════════════════════════════════════════════════════════════════════════
//  SERVER CONFIG
// ═════════════════════════════════════════════════════════════════════════
export const setServerUrl = (url) => {
  const clean = url.replace(/\/+$/, '');
  localStorage.setItem('dalia_server_url', clean);
  api.defaults.baseURL = `${clean}/api`;
};

export const getServerUrl = () =>
  localStorage.getItem('dalia_server_url') || 'http://localhost:8000';

export default api;
