/**
 * Zustand store — DuoQ state (partner link, role, pool).
 *
 * Manages the DuoQ partnership:
 * - Link/unlink via code
 * - Track partner info and champion pool
 * - Controls DuoQ mode toggle for draft recommendations
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  fetchDuoCode,
  fetchDuoStatus,
  linkDuo,
  unlinkDuo,
  fetchDuoPartnerPool,
  regenerateDuoCode,
} from '../services/api';

const useDuoStore = create(
  persist(
    (set, get) => ({
      // ── State ──
      duoActive: false, // Is DuoQ mode turned on for draft?
      myCode: null, // My shareable duo code
      linked: false, // Do I have an active partner?
      partner: null, // { id, username, preferred_roles, linked_since }
      partnerPool: null, // { top: [...], mid: [...], ... }
      partnerRole: null, // The role the partner plays in duo (user-selected)
      loading: false,
      error: null,

      // ── Actions ──

      /** Load duo code + status from server */
      loadDuoState: async () => {
        set({ loading: true, error: null });
        try {
          const [codeRes, statusRes] = await Promise.all([
            fetchDuoCode(),
            fetchDuoStatus(),
          ]);

          const updates = {
            myCode: codeRes.duo_code,
            linked: statusRes.linked,
            partner: statusRes.partner || null,
            loading: false,
          };

          // If linked, also fetch partner pool
          if (statusRes.linked) {
            try {
              const poolRes = await fetchDuoPartnerPool();
              updates.partnerPool = poolRes.champion_pool;
            } catch {
              updates.partnerPool = null;
            }
            // Default partner role to their preferred role
            if (!get().partnerRole && statusRes.partner?.preferred_roles?.length) {
              updates.partnerRole = statusRes.partner.preferred_roles[0];
            }
          }

          set(updates);
        } catch (e) {
          console.warn('Failed to load duo state:', e);
          set({ loading: false, error: 'Impossible de charger le statut duo' });
        }
      },

      /** Regenerate my duo code */
      regenerateCode: async () => {
        try {
          const res = await regenerateDuoCode();
          set({ myCode: res.duo_code });
        } catch (e) {
          console.warn('Failed to regenerate code:', e);
        }
      },

      /** Link with a friend using their code */
      linkWithCode: async (code) => {
        set({ loading: true, error: null });
        try {
          const res = await linkDuo(code);
          set({
            linked: true,
            partner: res.partner,
            loading: false,
          });
          // Fetch partner pool right away
          try {
            const poolRes = await fetchDuoPartnerPool();
            set({
              partnerPool: poolRes.champion_pool,
              partnerRole: res.partner?.preferred_roles?.[0] || 'mid',
            });
          } catch {
            // Pool fetch failed, not critical
          }
          return true;
        } catch (e) {
          const detail = e.response?.data?.detail || 'Erreur lors du lien duo';
          set({ loading: false, error: detail });
          return false;
        }
      },

      /** Unlink from current partner */
      unlink: async () => {
        set({ loading: true, error: null });
        try {
          await unlinkDuo();
          set({
            linked: false,
            partner: null,
            partnerPool: null,
            partnerRole: null,
            duoActive: false,
            loading: false,
          });
        } catch (e) {
          set({ loading: false, error: 'Erreur lors de la déconnexion duo' });
        }
      },

      /** Toggle DuoQ mode on/off */
      toggleDuoActive: () => {
        const { linked, duoActive } = get();
        if (!linked) return; // Can't activate without a partner
        set({ duoActive: !duoActive });
      },

      /** Set partner's role for duo */
      setPartnerRole: (role) => set({ partnerRole: role }),

      /** Get duo options for API calls */
      getDuoOptions: () => {
        const { duoActive, linked, partnerRole } = get();
        if (!duoActive || !linked || !partnerRole) return null;
        return {
          active: true,
          partnerRole,
        };
      },

      /** Reset on logout */
      resetDuo: () =>
        set({
          duoActive: false,
          myCode: null,
          linked: false,
          partner: null,
          partnerPool: null,
          partnerRole: null,
          loading: false,
          error: null,
        }),
    }),
    {
      name: 'dalia-duo-store',
      partialize: (state) => ({
        duoActive: state.duoActive,
        partnerRole: state.partnerRole,
      }),
    },
  ),
);

export default useDuoStore;
