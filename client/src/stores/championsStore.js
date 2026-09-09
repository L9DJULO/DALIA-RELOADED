/**
 * Zustand store — Champion catalog (loaded once, used across the app).
 * Falls back to an empty list when the server is unavailable.
 * Uses localStorage as a 24h TTL cache to avoid refetching on every cold start.
 */
import { create } from 'zustand';
import { fetchChampions, fetchPatch } from '../services/api';
import { setDDragonVersion } from '../lib/constants';

const CACHE_KEY = 'dalia_champions_v1';
const TTL_MS = 24 * 60 * 60 * 1000;

function readCache(version) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data, patch } = JSON.parse(raw);
    if (!ts || !Array.isArray(data) || (version && patch !== version)) return null;
    if (Date.now() - ts > TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(data, patch) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data, patch }));
  } catch {
    /* quota / serialization — fine, just skip caching */
  }
}

const useChampionsStore = create((set, get) => ({
  champions: [],
  byId: {},
  loaded: false,
  loading: false,
  error: null,

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true, error: null });
    let version;
    try { const patch = await fetchPatch(); version = patch.version; setDDragonVersion(version); } catch { /* Cached assets remain usable offline. */ }

    const cached = readCache(version);
    if (cached?.length) {
      const byId = {};
      for (const c of cached) byId[c.id] = c;
      set({ champions: cached, byId, loaded: true, loading: false });
      return;
    }

    set({ loading: true, error: null });
    try {
      const list = await fetchChampions();
      const arr = Array.isArray(list) ? list : [];
      if (!arr.length) throw new Error('Catalogue vide ; réessaie le chargement.');
      const byId = {};
      for (const c of arr) byId[c.id] = c;
      set({ champions: arr, byId, loaded: true, loading: false });
      if (arr.length) writeCache(arr, version);
    } catch (e) {
      set({ error: e.message || 'Erreur chargement champions', loading: false });
    }
  },

  reload: async () => {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
    set({ loaded: false });
    await get().load();
  },
}));

export default useChampionsStore;
