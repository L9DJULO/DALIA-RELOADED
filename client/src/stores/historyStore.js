/**
 * Zustand store — Draft history management.
 *
 * Now auth-protected — no username param needed, JWT identifies the user.
 */
import { create } from 'zustand';
import {
  fetchHistory,
  saveHistoryEntry,
  updateHistoryResult,
  deleteHistoryEntry,
  fetchHistoryStats,
} from '../services/api';

const useHistoryStore = create((set, get) => ({
  entries: [],
  stats: null,
  loading: false,
  error: null,

  // ── Load history ──
  loadHistory: async () => {
    set({ loading: true, error: null });
    try {
      const entries = await fetchHistory();
      set({ entries, loading: false });
    } catch (e) {
      set({ error: e.message || 'Failed to load history', loading: false });
    }
  },

  // ── Save a new entry ──
  saveEntry: async (entry) => {
    try {
      const result = await saveHistoryEntry(entry);
      await get().loadHistory();
      return result;
    } catch (e) {
      set({ error: e.message || 'Failed to save history' });
      return null;
    }
  },

  // ── Update result (win/loss) ──
  updateResult: async (entryId, result, notes = '') => {
    try {
      await updateHistoryResult(entryId, result, notes);
      set({
        entries: get().entries.map((e) =>
          e.id === entryId ? { ...e, result, notes } : e
        ),
      });
    } catch (e) {
      set({ error: e.message || 'Failed to update result' });
    }
  },

  // ── Delete entry ──
  deleteEntry: async (entryId) => {
    try {
      await deleteHistoryEntry(entryId);
      set({ entries: get().entries.filter((e) => e.id !== entryId) });
    } catch (e) {
      set({ error: e.message || 'Failed to delete entry' });
    }
  },

  // ── Load stats ──
  loadStats: async () => {
    try {
      const stats = await fetchHistoryStats();
      set({ stats });
    } catch (e) {
      set({ error: e.message || 'Failed to load stats' });
    }
  },
}));

export default useHistoryStore;
