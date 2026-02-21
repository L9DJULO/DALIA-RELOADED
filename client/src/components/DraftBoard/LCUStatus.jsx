/**
 * LCU Status indicator -- Shows connection to LoL client and allows auto-sync.
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

  const champMap = useMemo(() => {
    const m = {};
    for (const c of champions) m[c.id] = c;
    return m;
  }, [champions]);

  const prevSync = useRef(null);

  useEffect(() => {
    startPolling(1500);
    return () => stopPolling();
  }, []);

  useEffect(() => {
    if (!autoSync || !inChampSelect) {
      prevSync.current = null;
      return;
    }

    const syncData = getDraftSyncData(champMap);
    if (!syncData) return;

    const snap = JSON.stringify(syncData);
    if (snap === prevSync.current) return;
    prevSync.current = snap;

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
      {/* Timer in champ select */}
      {inChampSelect && timerRemaining > 0 && (
        <div
          className={`px-2 py-0.5 rounded-lg text-[11px] font-mono tabular-nums border ${
            isMyTurn
              ? 'bg-accent-muted text-accent border-accent/20 font-semibold'
              : 'bg-surface-elevated text-txt-muted border-border-subtle'
          }`}
          role="timer"
          aria-label={`${timerRemaining} secondes restantes`}
        >
          {timerRemaining}s
        </div>
      )}

      {/* Auto-sync toggle */}
      <button
        onClick={() => setAutoSync(!autoSync)}
        aria-pressed={autoSync}
        aria-label={`Auto-sync ${autoSync ? 'active' : 'desactive'}`}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-200 border ${
          autoSync
            ? 'bg-accent-muted text-accent border-accent/20 hover:bg-accent-muted'
            : 'bg-surface-elevated text-txt-muted border-border-subtle hover:border-accent/30 hover:text-txt-secondary'
        }`}
      >
        <RefreshCw size={10} aria-hidden="true" className={autoSync ? 'animate-spin' : ''} style={autoSync ? { animationDuration: '3s' } : undefined} />
        <span>Sync {autoSync ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  );
}
