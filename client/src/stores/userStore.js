/**
 * Zustand store — User profile & champion pool management.
 *
 * Now backed by server auth — pool is linked to the user's account.
 * No more username param — the JWT token identifies the user.
 * Auto-saves to server when pool changes (debounced).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchProfile, updatePool } from '../services/api';
import { TIERS, ROLES } from '../lib/constants';

// Debounce timers per role for auto-save
const _saveTimers = {};
const DEBOUNCE_MS = 1500;

function debouncedSaveRole(role, getPool) {
  if (_saveTimers[role]) clearTimeout(_saveTimers[role]);
  _saveTimers[role] = setTimeout(async () => {
    try {
      const pool = getPool(role);
      await updatePool(role, pool);
    } catch (e) {
      console.warn(`Auto-save pool (${role}) failed:`, e);
    }
  }, DEBOUNCE_MS);
}

const useUserStore = create(
  persist(
    (set, get) => ({
      championPool: { top: [], jungle: [], mid: [], bot: [], support: [] },
      preferredRoles: ['mid'],
      enableWildcard: true,
      weightOverrides: null,

      // ── Actions ─────────────────────────────────────────
      loadProfile: async () => {
        try {
          const data = await fetchProfile();
          const serverPool = data.champion_pool || { top: [], jungle: [], mid: [], bot: [], support: [] };
          const localPool = get().championPool;

          // Check if server has any pool data
          const serverHasData = ROLES.some((r) => (serverPool[r] || []).length > 0);
          const localHasData = ROLES.some((r) => (localPool[r] || []).length > 0);

          if (serverHasData) {
            // Server wins — use server pool
            set({
              championPool: serverPool,
              preferredRoles: data.preferred_roles || ['mid'],
              enableWildcard: data.enable_wildcard ?? true,
              weightOverrides: data.weight_overrides || null,
            });
          } else if (localHasData) {
            // Local has data but server doesn't — push local pool to server
            set({
              preferredRoles: data.preferred_roles || ['mid'],
              enableWildcard: data.enable_wildcard ?? true,
              weightOverrides: data.weight_overrides || null,
            });
            // Auto-push local pool to server so it's available on other devices
            setTimeout(() => get().saveAllPools(), 500);
          } else {
            set({
              championPool: serverPool,
              preferredRoles: data.preferred_roles || ['mid'],
              enableWildcard: data.enable_wildcard ?? true,
              weightOverrides: data.weight_overrides || null,
            });
          }
        } catch (e) {
          console.warn('Failed to load profile:', e);
        }
      },

      savePool: async (role) => {
        const pool = get().championPool[role] || [];
        try {
          await updatePool(role, pool);
        } catch (e) {
          console.warn('Failed to save pool:', e);
        }
      },

      addToPool: (role, champion, tier = 'B') => {
        const pool = { ...get().championPool };
        const existing = pool[role] || [];
        if (existing.some((e) => e.champion_id === champion.id)) return;
        pool[role] = [
          ...existing,
          { champion_id: champion.id, champion_key: champion.key, tier },
        ];
        set({ championPool: pool });
        debouncedSaveRole(role, (r) => get().championPool[r] || []);
      },

      removeFromPool: (role, championId) => {
        const pool = { ...get().championPool };
        pool[role] = (pool[role] || []).filter((e) => e.champion_id !== championId);
        set({ championPool: pool });
        debouncedSaveRole(role, (r) => get().championPool[r] || []);
      },

      changeTier: (role, championId, newTier) => {
        const pool = { ...get().championPool };
        pool[role] = (pool[role] || []).map((e) =>
          e.champion_id === championId ? { ...e, tier: newTier } : e,
        );
        set({ championPool: pool });
        debouncedSaveRole(role, (r) => get().championPool[r] || []);
      },

      // Save all roles to server (called after login / profile load)
      saveAllPools: async () => {
        const pool = get().championPool;
        for (const role of ROLES) {
          const entries = pool[role] || [];
          if (entries.length > 0) {
            try {
              await updatePool(role, entries);
            } catch (e) {
              console.warn(`saveAllPools (${role}) failed:`, e);
            }
          }
        }
      },

      setPreferredRoles: (roles) => set({ preferredRoles: roles }),
      setWeightOverrides: (w) => set({ weightOverrides: w }),

      // Reset pool (e.g. on logout)
      resetPool: () =>
        set({
          championPool: { top: [], jungle: [], mid: [], bot: [], support: [] },
          preferredRoles: ['mid'],
          enableWildcard: true,
          weightOverrides: null,
        }),
    }),
    {
      name: 'dalia-user-store',
      partialize: (state) => ({
        championPool: state.championPool,
        preferredRoles: state.preferredRoles,
        enableWildcard: state.enableWildcard,
        weightOverrides: state.weightOverrides,
      }),
    },
  ),
);

export { TIERS, ROLES };
export default useUserStore;
