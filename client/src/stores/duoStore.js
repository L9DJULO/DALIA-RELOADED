/**
 * Zustand store — DuoQ state (partner link, role, pool).
 *
 * Every action is wrapped in try/catch and leaves the store in a
 * consistent shape. No field is ever left dangling (e.g. linked:true
 * with partner:null) after a state transition the store owns.
 *
 * Persisted subset is intentionally small (duoActive + partnerRole):
 * these are user-intent preferences. Server-sourced fields (linked /
 * partner / partnerPool / myCode) are re-fetched on every mount so a
 * new user never inherits the previous user's partner from localStorage.
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

const INITIAL_STATE = {
  duoActive: false,
  myCode: null,
  linked: false,
  partner: null,       // { id, username, preferred_roles, linked_since } | null
  partnerPool: null,   // { top: [...], ... } | null
  partnerRole: null,   // "top" | ... | null
  loading: false,
  linking: false,      // separate flag for link/unlink flow
  error: null,         // { message, kind: "network" | "server" | "validation" | "not_found" } | null
};

/** Extract a user-facing error message + kind from an axios error. */
function parseApiError(e, fallback = 'Erreur inattendue') {
  // Network / timeout → no response
  if (!e?.response) {
    return { message: 'Serveur injoignable. Vérifie ta connexion.', kind: 'network' };
  }
  const status = e.response.status;
  const detail = e.response?.data?.detail;
  if (status === 404) return { message: detail || 'Ressource introuvable.', kind: 'not_found' };
  if (status === 409) return { message: detail || 'Conflit.', kind: 'validation' };
  if (status >= 400 && status < 500) return { message: detail || fallback, kind: 'validation' };
  return { message: detail || fallback, kind: 'server' };
}

const useDuoStore = create(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      // ── Actions ────────────────────────────────────────────────
      clearError: () => set({ error: null }),

      /**
       * Load duo code + status + (if linked) partner pool. Idempotent.
       * On any failure, resets server-sourced fields to safe defaults
       * so the UI can't render stale partner data under an error banner.
       */
      loadDuoState: async () => {
        if (get().loading) return;
        set({ loading: true, error: null });
        try {
          const [codeRes, statusRes] = await Promise.all([
            fetchDuoCode(),
            fetchDuoStatus(),
          ]);

          const updates = {
            myCode: codeRes?.duo_code ?? null,
            linked: Boolean(statusRes?.linked),
            partner: statusRes?.linked ? (statusRes.partner || null) : null,
            loading: false,
            error: null,
          };

          // If not linked server-side, wipe any stale partner data & duo mode.
          if (!updates.linked) {
            updates.partnerPool = null;
            updates.duoActive = false;
            // Keep partnerRole as a persisted preference — may still be
            // useful next time a link is established.
          } else {
            // Linked → try to load partner pool (non-fatal if it fails).
            try {
              const poolRes = await fetchDuoPartnerPool();
              updates.partnerPool = poolRes?.champion_pool ?? null;
            } catch (poolErr) {
              updates.partnerPool = null;
              // Surface as a soft error but don't clear linked state —
              // pool can be retried later without unlinking.
              const { message } = parseApiError(poolErr, 'Pool du partenaire indisponible.');
              updates.error = { message, kind: 'server' };
            }
            // Default partnerRole to partner's preferred role if not set.
            const currentRole = get().partnerRole;
            const preferred = updates.partner?.preferred_roles;
            if (!currentRole && Array.isArray(preferred) && preferred.length > 0) {
              updates.partnerRole = preferred[0];
            }
          }

          set(updates);
        } catch (e) {
          // Couldn't even reach /duo/code or /duo/status — reset to neutral.
          const err = parseApiError(e, 'Impossible de charger le statut duo.');
          set({
            loading: false,
            // Don't nuke myCode if we already had one cached; only reset link-state.
            linked: false,
            partner: null,
            partnerPool: null,
            duoActive: false,
            error: err,
          });
        }
      },

      /** Regenerate my duo code. Surfaces error in the store. */
      regenerateCode: async () => {
        set({ error: null });
        try {
          const res = await regenerateDuoCode();
          set({ myCode: res?.duo_code ?? get().myCode });
          return true;
        } catch (e) {
          set({ error: parseApiError(e, 'Impossible de régénérer le code.') });
          return false;
        }
      },

      /**
       * Link with a friend using their code. Returns true on success.
       * Guards against double-submit via the `linking` flag.
       */
      linkWithCode: async (code) => {
        if (get().linking) return false;
        const clean = (code || '').trim().toUpperCase();
        if (!clean) {
          set({ error: { message: 'Entre un code duo.', kind: 'validation' } });
          return false;
        }
        set({ linking: true, error: null });
        try {
          const res = await linkDuo(clean);
          // Build the next state atomically so we never land in an
          // inconsistent "linked:true + partner:null" transient.
          const partner = res?.partner || null;
          const defaultRole =
            get().partnerRole ||
            (Array.isArray(partner?.preferred_roles) && partner.preferred_roles[0]) ||
            'mid';

          // Try to load partner pool before flipping `linked` so the UI
          // gets the linked state with data already present.
          let pool = null;
          try {
            const poolRes = await fetchDuoPartnerPool();
            pool = poolRes?.champion_pool ?? null;
          } catch {
            // Non-fatal: link succeeded server-side. Show a soft error
            // but keep the link established — user can retry pool fetch.
          }

          set({
            linked: true,
            partner,
            partnerPool: pool,
            partnerRole: defaultRole,
            linking: false,
            error: pool
              ? null
              : { message: 'Lien établi. Pool du partenaire indisponible pour le moment.', kind: 'server' },
          });
          return true;
        } catch (e) {
          const err = parseApiError(e, 'Erreur lors du lien duo.');
          set({ linking: false, error: err });
          return false;
        }
      },

      /**
       * Unlink from current partner. Always resets local state — a 404
       * ("no active link") is treated as success since the user's intent
       * is "I don't want a partner anymore" and the server agrees.
       */
      unlink: async () => {
        if (get().linking) return;
        set({ linking: true, error: null });
        let apiError = null;
        try {
          await unlinkDuo();
        } catch (e) {
          const parsed = parseApiError(e, 'Erreur lors de la déconnexion duo.');
          // 404 = already unlinked server-side → treat as success.
          if (parsed.kind !== 'not_found') {
            apiError = parsed;
          }
        }
        // Always flush local link state regardless of server outcome.
        // The worst case is a lingering server-side row which the next
        // loadDuoState / link attempt will handle.
        set({
          linked: false,
          partner: null,
          partnerPool: null,
          duoActive: false,
          linking: false,
          error: apiError,
        });
      },

      /** Toggle DuoQ mode on/off. No-op when not linked. */
      toggleDuoActive: () => {
        const { linked, duoActive } = get();
        if (!linked) return;
        set({ duoActive: !duoActive });
      },

      /** Set partner's role for the duo synergy boost. */
      setPartnerRole: (role) => set({ partnerRole: role || null }),

      /** Read-only accessor used by the draft flow. Returns null when
       *  the feature can't/shouldn't apply. */
      getDuoOptions: () => {
        const { duoActive, linked, partnerRole } = get();
        if (!duoActive || !linked || !partnerRole) return null;
        return { active: true, partnerRole };
      },

      /** Hard reset — called on logout so persist doesn't leak across users. */
      resetDuo: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: 'dalia-duo-store',
      // Persist only user-intent preferences. Never persist server state
      // (linked / partner / partnerPool / myCode): those are always
      // re-fetched on mount via loadDuoState().
      partialize: (state) => ({
        duoActive: state.duoActive,
        partnerRole: state.partnerRole,
      }),
    },
  ),
);

// Auto-reset when the app signals a logout (401 or explicit logout).
if (typeof window !== 'undefined') {
  window.addEventListener('dalia:logout', () => {
    useDuoStore.getState().resetDuo();
  });
}

export default useDuoStore;
