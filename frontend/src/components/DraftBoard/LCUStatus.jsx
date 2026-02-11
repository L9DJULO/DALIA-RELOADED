/**
 * LCU Status indicator — Shows connection to LoL client and allows auto-sync.
 */
import React, { useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Loader2, Gamepad2 } from 'lucide-react';
import useLCUStore from '../../stores/lcuStore';
import useDraftStore from '../../stores/draftStore';

export default function LCUStatus() {
  const {
    connected,
    inChampSelect,
    gamePhase,
    myTeam,
    myRole,
    isMyTurn,
    timerRemaining,
    polling,
    autoSync,
    lastUpdate,
    error,
    startPolling,
    stopPolling,
    fetchStatus,
    setAutoSync,
    getDraftSyncData,
  } = useLCUStore();

  const {
    setMyTeam,
    setMyRole,
    setBan,
    setPick,
    resetDraft,
  } = useDraftStore();

  // Start polling on mount
  useEffect(() => {
    startPolling(1500); // Poll every 1.5s
    return () => stopPolling();
  }, []);

  // Auto-sync draft when LCU state changes
  useEffect(() => {
    if (!autoSync || !inChampSelect) return;

    const syncData = getDraftSyncData();
    if (!syncData) return;

    // Sync team & role
    if (syncData.myTeam) setMyTeam(syncData.myTeam);
    if (syncData.myRole) setMyRole(syncData.myRole);

    // Sync bans
    syncData.blueBans.forEach((ban, i) => {
      if (ban) setBan('blue', i, ban);
    });
    syncData.redBans.forEach((ban, i) => {
      if (ban) setBan('red', i, ban);
    });

    // Sync picks
    for (const [role, champ] of Object.entries(syncData.bluePicks)) {
      if (champ) setPick('blue', role, champ);
    }
    for (const [role, champ] of Object.entries(syncData.redPicks)) {
      if (champ) setPick('red', role, champ);
    }
  }, [inChampSelect, autoSync, getDraftSyncData, lastUpdate]);

  // Format phase display
  const getPhaseDisplay = () => {
    switch (gamePhase) {
      case 'ChampSelect': return 'Champ Select';
      case 'InProgress': return 'En partie';
      case 'Lobby': return 'Lobby';
      case 'Matchmaking': return 'Recherche...';
      case 'ReadyCheck': return 'Ready Check';
      case 'None': return 'Menu';
      default: return gamePhase || 'Déconnecté';
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Connection status */}
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        connected
          ? inChampSelect
            ? 'bg-green-500/10 text-green-400 border border-green-500/30'
            : 'bg-slate-700/50 text-slate-300 border border-slate-600/50'
          : 'bg-red-500/10 text-red-400 border border-red-500/30'
      }`}>
        {connected ? (
          inChampSelect ? (
            <Gamepad2 size={14} className="animate-pulse" />
          ) : (
            <Wifi size={14} />
          )
        ) : (
          <WifiOff size={14} />
        )}
        <span>{getPhaseDisplay()}</span>
      </div>

      {/* Timer when in champ select */}
      {inChampSelect && timerRemaining > 0 && (
        <div className={`px-2 py-1 rounded text-xs font-mono ${
          isMyTurn ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700/50 text-slate-400'
        }`}>
          {timerRemaining}s
        </div>
      )}

      {/* Auto-sync toggle */}
      <button
        onClick={() => setAutoSync(!autoSync)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          autoSync
            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
            : 'bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:border-slate-500'
        }`}
        title={autoSync ? 'Désactiver la synchronisation automatique' : 'Activer la synchronisation automatique'}
      >
        {polling ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <RefreshCw size={12} />
        )}
        <span>Auto-sync {autoSync ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  );
}
