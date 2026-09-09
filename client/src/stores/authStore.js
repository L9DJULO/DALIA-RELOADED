/**
 * Zustand store — Authentication state management.
 */
import { create } from 'zustand';
import { login, register, fetchMe } from '../services/api';

const readUser = () => { try { return JSON.parse(localStorage.getItem('dalia_user') || 'null'); } catch { return null; } };
const errorText = (e, fallback) => {
  const detail = e.response?.data?.detail;
  return typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(d => d.msg).join(' · ') : fallback;
};

const useAuthStore = create((set, get) => ({
  // State
  user: readUser(),
  token: localStorage.getItem('dalia_token') || null,
  isAuthenticated: !!localStorage.getItem('dalia_token'),
  loading: false,
  error: null,

  // ── Actions ─────────────────────────────────────────
  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const data = await login(username, password);
      window.dispatchEvent(new Event('dalia:logout'));
      localStorage.setItem('dalia_token', data.access_token);
      localStorage.setItem('dalia_user', JSON.stringify(data.user));
      set({
        user: data.user,
        token: data.access_token,
        isAuthenticated: true,
        loading: false,
      });
      return true;
    } catch (e) {
      const msg = errorText(e, 'Erreur de connexion');
      set({ error: msg, loading: false });
      return false;
    }
  },

  register: async (username, email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await register(username, email, password);
      window.dispatchEvent(new Event('dalia:logout'));
      localStorage.setItem('dalia_token', data.access_token);
      localStorage.setItem('dalia_user', JSON.stringify(data.user));
      set({
        user: data.user,
        token: data.access_token,
        isAuthenticated: true,
        loading: false,
      });
      return true;
    } catch (e) {
      const msg = errorText(e, "Erreur lors de l'inscription");
      set({ error: msg, loading: false });
      return false;
    }
  },

  logout: () => window.dispatchEvent(new Event('dalia:logout')),
  clearSession: () => {
    localStorage.removeItem('dalia_token');
    localStorage.removeItem('dalia_user');
    set({ user: null, token: null, isAuthenticated: false, error: null });
  },

  refreshUser: async () => {
    const token = get().token;
    try {
      const user = await fetchMe();
      if (token !== get().token) return;
      localStorage.setItem('dalia_user', JSON.stringify(user));
      set({ user });
    } catch (e) {
      // Token expired — logout
      if (e.response?.status === 401 && token === get().token) window.dispatchEvent(new Event('dalia:logout'));
    }
  },

  clearError: () => set({ error: null }),
}));

// Listen for forced logout (401 from API interceptor)
if (typeof window !== 'undefined') {
  window.addEventListener('dalia:logout', () => {
    useAuthStore.getState().clearSession();
  });
}

export default useAuthStore;
