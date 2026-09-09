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

let generation = 0;
const useHistoryStore = create((set, get) => ({
  entries: [],
  stats: null,
  loading: false,
  error: null,

  // ── Load history ──
  loadHistory: async () => {
    const ticket = generation;
    const safeSet = patch => { if (ticket === generation) set(patch); };
    safeSet({ loading: true, error: null });
    try {
      const entries = await fetchHistory();
      safeSet({ entries, loading: false });
    } catch (e) {
      safeSet({ error: e.message || 'Failed to load history', loading: false });
    }
  },

  // ── Save a new entry ──
  saveEntry: async (entry) => {
    const ticket = generation;
    const safeSet = patch => { if (ticket === generation) set(patch); };
    try {
      const result = await saveHistoryEntry(entry);
      if (ticket !== generation) return null;
      await get().loadHistory();
      return result;
    } catch (e) {
      safeSet({ error: e.message || 'Failed to save history' });
      return null;
    }
  },

  // ── Update result (win/loss) ──
  updateResult: async (entryId, result, notes = '') => {
    const ticket = generation;
    const safeSet = patch => { if (ticket === generation) set(patch); };
    try {
      await updateHistoryResult(entryId, result, notes);
      safeSet({
        entries: get().entries.map((e) =>
          e.id === entryId ? { ...e, result, notes } : e
        ),
      });
    } catch (e) {
      safeSet({ error: e.message || 'Failed to update result' });
    }
  },

  // ── Delete entry ──
  deleteEntry: async (entryId) => {
    const ticket = generation;
    const safeSet = patch => { if (ticket === generation) set(patch); };
    try {
      await deleteHistoryEntry(entryId);
      safeSet({ entries: get().entries.filter((e) => e.id !== entryId) });
    } catch (e) {
      safeSet({ error: e.message || 'Failed to delete entry' });
    }
  },

  // ── Load stats ──
  loadStats: async () => {
    const ticket = generation;
    const safeSet = patch => { if (ticket === generation) set(patch); };
    try {
      const stats = await fetchHistoryStats();
      safeSet({ stats });
    } catch (e) {
      safeSet({ error: e.message || 'Failed to load stats' });
    }
  },
}));

window.addEventListener('dalia:logout', () => { generation++; useHistoryStore.setState({ entries: [], stats: null, loading: false, error: null }); });
export default useHistoryStore;
