/**
 * Zustand store — User profile & champion pool management.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchProfile, saveProfile, updatePool } from '../services/api';

const TIERS = ['S', 'A', 'B', 'C', 'D'];
const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];

const useUserStore = create(
  persist(
    (set, get) => ({
      username: 'default',
      championPool: { top: [], jungle: [], mid: [], bot: [], support: [] },
      preferredRoles: ['mid'],
      enableWildcard: true,
      weightOverrides: null,

      // ── Actions ─────────────────────────────────────────
      setUsername: (name) => set({ username: name }),

      loadProfile: async () => {
        try {
          const data = await fetchProfile(get().username);
          set({
            championPool: data.champion_pool || { top: [], jungle: [], mid: [], bot: [], support: [] },
            preferredRoles: data.preferred_roles || ['mid'],
            enableWildcard: data.enable_wildcard_suggestions ?? true,
            weightOverrides: data.weight_overrides || null,
          });
        } catch (e) {
          console.warn('Failed to load profile:', e);
        }
      },

      savePool: async (role) => {
        const pool = get().championPool[role] || [];
        try {
          await updatePool(role, pool, get().username);
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
      },

      removeFromPool: (role, championId) => {
        const pool = { ...get().championPool };
        pool[role] = (pool[role] || []).filter((e) => e.champion_id !== championId);
        set({ championPool: pool });
      },

      changeTier: (role, championId, newTier) => {
        const pool = { ...get().championPool };
        pool[role] = (pool[role] || []).map((e) =>
          e.champion_id === championId ? { ...e, tier: newTier } : e,
        );
        set({ championPool: pool });
      },

      setPreferredRoles: (roles) => set({ preferredRoles: roles }),
      setWeightOverrides: (w) => set({ weightOverrides: w }),
    }),
    {
      name: 'dalia-user-store',
      partialize: (state) => ({
        username: state.username,
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
