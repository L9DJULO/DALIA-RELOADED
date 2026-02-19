/**
 * Zustand store — Authentication state management.
 */
import { create } from 'zustand';
import { login, register, fetchMe } from '../services/api';

const useAuthStore = create((set, get) => ({
  // State
  user: JSON.parse(localStorage.getItem('dalia_user') || 'null'),
  token: localStorage.getItem('dalia_token') || null,
  isAuthenticated: !!localStorage.getItem('dalia_token'),
  loading: false,
  error: null,

  // ── Actions ─────────────────────────────────────────
  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const data = await login(username, password);
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
      const msg = e.response?.data?.detail || 'Erreur de connexion';
      set({ error: msg, loading: false });
      return false;
    }
  },

  register: async (username, email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await register(username, email, password);
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
      const msg = e.response?.data?.detail || "Erreur lors de l'inscription";
      set({ error: msg, loading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('dalia_token');
    localStorage.removeItem('dalia_user');
    set({ user: null, token: null, isAuthenticated: false, error: null });
  },

  refreshUser: async () => {
    try {
      const user = await fetchMe();
      localStorage.setItem('dalia_user', JSON.stringify(user));
      set({ user });
    } catch (e) {
      // Token expired — logout
      get().logout();
    }
  },

  clearError: () => set({ error: null }),
}));

// Listen for forced logout (401 from API interceptor)
if (typeof window !== 'undefined') {
  window.addEventListener('dalia:logout', () => {
    useAuthStore.getState().logout();
  });
}

export default useAuthStore;
