/**
 * Zustand store — Champion catalog (loaded once, used across the app).
 * Falls back to an empty list when the server is unavailable.
 * Uses localStorage as a 24h TTL cache to avoid refetching on every cold start.
 */
import { create } from 'zustand';
import { fetchChampions } from '../services/api';

const CACHE_KEY = 'dalia_champions_v1';
const TTL_MS = 24 * 60 * 60 * 1000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (!ts || !Array.isArray(data)) return null;
    if (Date.now() - ts > TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
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

    const cached = readCache();
    if (cached) {
      const byId = {};
      for (const c of cached) byId[c.id] = c;
      set({ champions: cached, byId, loaded: true, loading: false });
      return;
    }

    set({ loading: true, error: null });
    try {
      const list = await fetchChampions();
      const arr = Array.isArray(list) ? list : [];
      const byId = {};
      for (const c of arr) byId[c.id] = c;
      set({ champions: arr, byId, loaded: true, loading: false });
      if (arr.length) writeCache(arr);
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
