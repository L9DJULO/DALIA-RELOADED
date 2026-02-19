/**
 * LCU Status indicator — Shows connection to LoL client and allows auto-sync.
 */
import React, { useEffect, useRef } from 'react';
import { Wifi, WifiOff, RefreshCw, Loader2, Gamepad2, Radio } from 'lucide-react';
import useLCUStore from '../../stores/lcuStore';
import useDraftStore from '../../stores/draftStore';

export default function LCUStatus() {
  const connected = useLCUStore((s) => s.connected);
  const inChampSelect = useLCUStore((s) => s.inChampSelect);
  const gamePhase = useLCUStore((s) => s.gamePhase);
  const lcuTeam = useLCUStore((s) => s.myTeam);
  const lcuRole = useLCUStore((s) => s.myRole);
  const isMyTurn = useLCUStore((s) => s.isMyTurn);
  const timerRemaining = useLCUStore((s) => s.timerRemaining);
  const polling = useLCUStore((s) => s.polling);
  const autoSync = useLCUStore((s) => s.autoSync);
  const lastUpdate = useLCUStore((s) => s.lastUpdate);
  const startPolling = useLCUStore((s) => s.startPolling);
  const stopPolling = useLCUStore((s) => s.stopPolling);
  const setAutoSync = useLCUStore((s) => s.setAutoSync);
  const getDraftSyncData = useLCUStore((s) => s.getDraftSyncData);

  const setFromLCU = useDraftStore((s) => s.setFromLCU);
  const setBan = useDraftStore((s) => s.setBan);
  const setPick = useDraftStore((s) => s.setPick);
  const autoDetected = useDraftStore((s) => s.autoDetected);

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

    const syncData = getDraftSyncData();
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
  }, [autoSync, inChampSelect, lastUpdate]);

  const getPhaseDisplay = () => {
    switch (gamePhase) {
      case 'ChampSelect': return 'Champ Select';
      case 'InProgress': return 'En partie';
      case 'Lobby': return 'Lobby';
      case 'Matchmaking': return 'Recherche…';
      case 'ReadyCheck': return 'Ready Check';
      case 'None': return 'Menu';
      default: return gamePhase || 'LCU non détecté';
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Connection status */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors duration-150 border ${
          connected
            ? inChampSelect
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
              : 'bg-surface-elevated/50 text-slate-300 border-slate-700/50'
            : 'bg-red-500/10 text-red-400 border-red-500/25'
        }`}
        role="status"
        aria-label={`LCU: ${getPhaseDisplay()}`}
      >
        {connected ? (
          inChampSelect ? (
            <Gamepad2 size={12} className="animate-pulse-soft" aria-hidden="true" />
          ) : (
            <Wifi size={12} aria-hidden="true" />
          )
        ) : (
          <WifiOff size={12} aria-hidden="true" />
        )}
        <span>{getPhaseDisplay()}</span>
      </div>

      {/* Timer when in champ select */}
      {inChampSelect && timerRemaining > 0 && (
        <div
          className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono tabular-nums ${
            isMyTurn ? 'bg-amber-500/15 text-amber-400 font-semibold' : 'bg-surface-elevated/50 text-slate-400'
          }`}
          role="timer"
          aria-label={`${timerRemaining} secondes restantes`}
        >
          {timerRemaining}s
        </div>
      )}

      {/* Auto-detected indicator */}
      {autoDetected && inChampSelect && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
          <Radio size={9} aria-hidden="true" />
          <span>Détecté</span>
        </div>
      )}

      {/* Auto-sync toggle */}
      <button
        onClick={() => setAutoSync(!autoSync)}
        aria-pressed={autoSync}
        aria-label={`Auto-sync ${autoSync ? 'activé' : 'désactivé'}`}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors duration-150 border ${
          autoSync
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/25 hover:bg-amber-500/15'
            : 'bg-surface-elevated/50 text-slate-400 border-slate-700/50 hover:border-slate-600'
        }`}
      >
        {polling ? (
          <Loader2 size={10} className="animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw size={10} aria-hidden="true" />
        )}
        <span>Sync {autoSync ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  );
}
