import { create } from 'zustand';
import { fetchProfile, updatePool, updateMe } from '../services/api';
import { TIERS, ROLES } from '../lib/constants';

const emptyPool = () => Object.fromEntries(ROLES.map(r => [r, []]));
const timers = new Map();
const requests = new Set();
const queues = new Map();
const dirtyRoles = new Set();
let generation = 0;
const cacheKey = id => `dalia-pool:${id}`;
function cancelSaves() {
  generation++;
  timers.forEach(clearTimeout); timers.clear();
  requests.forEach(c => c.abort()); requests.clear(); queues.clear(); dirtyRoles.clear();
}
function cache(id, pool) {
  if (id) try { localStorage.setItem(cacheKey(id), JSON.stringify(pool)); } catch { /* optional cache */ }
}
const useUserStore = create((set, get) => ({
  ownerId: null, championPool: emptyPool(), preferredRoles: ['mid'],
  enableWildcard: true, enableOffMeta: true, weightOverrides: null,
  loading: false, profileAvailable: false, saveStatus: 'idle', error: null,
  loadProfile: async (ownerId) => {
    if (!ownerId) return;
    cancelSaves();
    const epoch = generation;
    set({ ownerId, championPool: emptyPool(), loading: true, profileAvailable: false, error: null, saveStatus: 'idle' });
    try {
      const data = await fetchProfile();
      if (epoch !== generation) return;
      const pool = { ...emptyPool(), ...data.champion_pool };
      set({ championPool: pool, preferredRoles: data.preferred_roles || ['mid'],
        enableWildcard: data.enable_wildcard ?? true, enableOffMeta: data.enable_off_meta ?? true,
        weightOverrides: data.weight_overrides || null, loading: false, profileAvailable: true });
      cache(ownerId, pool);
    } catch {
      if (epoch !== generation) return;
      let pool = emptyPool();
      try { pool = { ...pool, ...JSON.parse(localStorage.getItem(cacheKey(ownerId)) || '{}') }; } catch { /* corrupt cache */ }
      set({ championPool: pool, loading: false, saveStatus: 'error', error: 'Profil inaccessible. Pool local en lecture ; réessaie le chargement avant de modifier.' });
    }
  },
  savePool: async (role) => {
    const { ownerId, championPool } = get();
    if (!ownerId || !get().profileAvailable) return false;
    const epoch = generation;
    const entries = championPool[role].map(e => ({ ...e }));
    // Serialize per role: an older request must never overwrite a newer edit.
    const previous = queues.get(role) || Promise.resolve();
    const job = previous.catch(() => {}).then(async () => {
      if (epoch !== generation || get().ownerId !== ownerId) return false;
      const controller = new AbortController(); requests.add(controller);
      try {
        await updatePool(role, entries, { signal: controller.signal });
        if (epoch === generation) {
          const stillCurrent = JSON.stringify(get().championPool[role]) === JSON.stringify(entries);
          if (stillCurrent) dirtyRoles.delete(role);
          if (!dirtyRoles.size && !timers.size) set({ saveStatus: 'saved', error: null });
        }
        return true;
      } catch (e) {
        if (epoch === generation && !controller.signal.aborted) set({ saveStatus: 'error', error: 'Sauvegarde du pool échouée. Réessaie.' });
        return false;
      } finally { requests.delete(controller); }
    });
    queues.set(role, job);
    return job;
  },
  editRole: (role, update) => {
    if (!get().ownerId || !get().profileAvailable || get().loading || !ROLES.includes(role)) return;
    const pool = { ...get().championPool, [role]: update(get().championPool[role] || []) };
    dirtyRoles.add(role);
    set({ championPool: pool, saveStatus: 'pending' }); cache(get().ownerId, pool);
    clearTimeout(timers.get(role));
    timers.set(role, setTimeout(() => { timers.delete(role); get().savePool(role); }, 500));
  },
  addToPool: (role, champion, tier = 'B') => get().editRole(role, entries => entries.some(e => e.champion_id === champion.id) ? entries : [...entries, { champion_id: champion.id, champion_key: champion.key, tier }]),
  removeFromPool: (role, id) => get().editRole(role, entries => entries.filter(e => e.champion_id !== id)),
  changeTier: (role, id, tier) => get().editRole(role, entries => entries.map(e => e.champion_id === id ? { ...e, tier } : e)),
  saveAllPools: async () => {
    timers.forEach(clearTimeout); timers.clear();
    return Promise.all(ROLES.map(r => get().savePool(r)));
  },
  updatePreferences: async (settings) => {
    const epoch = generation;
    try {
      await updateMe(settings);
      if (epoch !== generation) return;
      set({ ...(settings.preferred_roles ? { preferredRoles: settings.preferred_roles } : {}),
        ...(settings.weight_overrides !== undefined ? { weightOverrides: settings.weight_overrides } : {}),
        ...(settings.enable_wildcard !== undefined ? { enableWildcard: settings.enable_wildcard } : {}),
        ...(settings.enable_off_meta !== undefined ? { enableOffMeta: settings.enable_off_meta } : {}), error: null });
    } catch { if (epoch === generation) set({ error: 'Paramètres non enregistrés.' }); }
  },
  setPreferredRoles: roles => get().updatePreferences({ preferred_roles: roles }),
  setWeightOverrides: weights => get().updatePreferences({ weight_overrides: weights }),
  resetPool: () => { cancelSaves(); set({ ownerId: null, championPool: emptyPool(), preferredRoles: ['mid'], enableWildcard: true, enableOffMeta: true, weightOverrides: null, loading: false, profileAvailable: false, saveStatus: 'idle', error: null }); },
  logout: () => window.dispatchEvent(new Event('dalia:logout')),
}));
window.addEventListener('dalia:logout', () => useUserStore.getState().resetPool());
// Legacy cache was shared across accounts and must never be uploaded implicitly.
localStorage.removeItem('dalia-user-store');
export { TIERS, ROLES };
export default useUserStore;
