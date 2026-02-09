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

export default api;
