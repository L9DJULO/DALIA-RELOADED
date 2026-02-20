/**
 * LCU Status indicator — Shows connection to LoL client and allows auto-sync.
 */
import React, { useEffect, useRef, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import useLCUStore from '../../stores/lcuStore';
import useDraftStore from '../../stores/draftStore';

export default function LCUStatus({ champions = [] }) {
  const inChampSelect = useLCUStore((s) => s.inChampSelect);
  const isMyTurn = useLCUStore((s) => s.isMyTurn);
  const timerRemaining = useLCUStore((s) => s.timerRemaining);
  const autoSync = useLCUStore((s) => s.autoSync);
  const lastUpdate = useLCUStore((s) => s.lastUpdate);
  const startPolling = useLCUStore((s) => s.startPolling);
  const stopPolling = useLCUStore((s) => s.stopPolling);
  const setAutoSync = useLCUStore((s) => s.setAutoSync);
  const getDraftSyncData = useLCUStore((s) => s.getDraftSyncData);

  const setFromLCU = useDraftStore((s) => s.setFromLCU);
  const setBan = useDraftStore((s) => s.setBan);
  const setPick = useDraftStore((s) => s.setPick);

  // Build champion lookup map (id → {id, key, name})
  const champMap = useMemo(() => {
    const m = {};
    for (const c of champions) m[c.id] = c;
    return m;
  }, [champions]);

  // Track previous LCU snapshot so we only push real changes
  const prevSync = useRef(null);

  // Start polling on mount
  useEffect(() => {
    startPolling(1500);
    return () => stopPolling();
  }, []);

  // Auto-sync draft when LCU state changes
  useEffect(() => {
    if (!autoSync || !inChampSelect) {
      prevSync.current = null;
      return;
    }

    const syncData = getDraftSyncData(champMap);
    if (!syncData) return;

    // Quick deep-equal check to avoid unnecessary re-renders
    const snap = JSON.stringify(syncData);
    if (snap === prevSync.current) return;
    prevSync.current = snap;

    // Auto-set team + role from LCU (keeps autoDetected = true)
    if (syncData.myTeam && syncData.myRole) {
      setFromLCU(syncData.myTeam, syncData.myRole);
    }

    syncData.blueBans.forEach((ban, i) => {
      if (ban) setBan('blue', i, ban);
    });
    syncData.redBans.forEach((ban, i) => {
      if (ban) setBan('red', i, ban);
    });

    for (const [role, champ] of Object.entries(syncData.bluePicks)) {
      if (champ) setPick('blue', role, champ);
    }
    for (const [role, champ] of Object.entries(syncData.redPicks)) {
      if (champ) setPick('red', role, champ);
    }
  }, [autoSync, inChampSelect, lastUpdate, champMap]);

  return (
    <div className="flex items-center gap-2">
      {/* Timer when in champ select */}
      {inChampSelect && timerRemaining > 0 && (
        <div
          className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono tabular-nums ${
            isMyTurn ? 'bg-violet-500/15 text-violet-400 font-semibold' : 'bg-surface-elevated/50 text-slate-400'
          }`}
          role="timer"
          aria-label={`${timerRemaining} secondes restantes`}
        >
          {timerRemaining}s
        </div>
      )}

      {/* Auto-sync toggle — no spinner, no connected/disconnected pill */}
      <button
        onClick={() => setAutoSync(!autoSync)}
        aria-pressed={autoSync}
        aria-label={`Auto-sync ${autoSync ? 'activé' : 'désactivé'}`}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors duration-150 border ${
          autoSync
            ? 'bg-violet-500/10 text-violet-400 border-violet-500/25 hover:bg-violet-500/15'
            : 'bg-surface-elevated/50 border-slate-700/50 hover:border-violet-500/30'
        }`}
      >
        <RefreshCw size={10} aria-hidden="true" />
        <span>Sync {autoSync ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  );
}
