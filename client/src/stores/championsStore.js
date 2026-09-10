/**
 * Zustand store — Champion catalog (loaded once, used across the app).
 *
 * Cache-first: the localStorage copy is published immediately (the draft board,
 * LCU sync and pool editor need names at once), then the server patch is checked
 * and the list is replaced only when the DDragon version differs or the copy is
 * older than 24h. Offline, the last copy stays in use whatever its age.
 */
import { create } from 'zustand';
import { fetchChampions, fetchPatch } from '../services/api';
import { setDDragonVersion } from '../lib/constants';

const CACHE_KEY = 'dalia_champions_v1';
const TTL_MS = 24 * 60 * 60 * 1000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data, patch } = JSON.parse(raw);
    if (!ts || !Array.isArray(data) || !data.length) return null;
    return { data, patch, fresh: Date.now() - ts <= TTL_MS };
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

const index = list => { const byId = {}; for (const c of list) byId[c.id] = c; return byId; };

const useChampionsStore = create((set, get) => ({
  champions: [],
  byId: {},
  loaded: false,
  loading: false,
  error: null,

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true, error: null });
    const cached = readCache();
    if (cached) set({ champions: cached.data, byId: index(cached.data), loaded: true });

    let version;
    try { const patch = await fetchPatch(); version = patch.version; setDDragonVersion(version); } catch { /* offline: keep the cached copy */ }

    const upToDate = cached && cached.fresh && version && cached.patch === version;
    if (upToDate || (cached && !version)) { set({ loading: false }); return; }

    try {
      const list = await fetchChampions();
      const arr = Array.isArray(list) ? list : [];
      if (!arr.length) throw new Error('Catalogue vide ; réessaie le chargement.');
      set({ champions: arr, byId: index(arr), loaded: true, loading: false, error: null });
      writeCache(arr, version);
    } catch (e) {
      // A stale copy beats an empty board; only surface the error without any copy.
      set({ loading: false, error: cached ? null : (e.message || 'Erreur chargement champions') });
    }
  },

  reload: async () => {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
    set({ loaded: false });
    await get().load();
  },
}));

export default useChampionsStore;
