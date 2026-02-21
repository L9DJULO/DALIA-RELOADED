/**
 * Ban Recommendations panel -- suggests optimal bans based on pool and meta.
 */
import React, { useState, useCallback } from 'react';
import { Shield, Loader2, AlertTriangle } from 'lucide-react';
import { fetchBanRecommendations } from '../../services/api';
import useDraftStore from '../../stores/draftStore';
import useUserStore from '../../stores/userStore';
import Badge from '../ui/Badge';
import { getDDragonChampBase } from '../../lib/constants';

function BanScore({ value }) {
  const color = value >= 70
    ? 'text-red-400 bg-red-500/12 border-red-500/20'
    : value >= 50
      ? 'text-accent bg-accent-muted border-accent/20'
      : 'text-txt-secondary bg-surface-elevated border-border-subtle';
  return (
    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xs font-bold tabular-nums ${color}`}>
      {value.toFixed(0)}
    </div>
  );
}

function ReasonBadge({ reason }) {
  let variant = 'default';
  if (reason.includes('Contre fort') || reason.includes('dangereux')) variant = 'danger';
  else if (reason.includes('Meta S') || reason.includes('Meta forte')) variant = 'accent';
  else if (reason.includes('frequemment')) variant = 'warning';
  else if (reason.includes('Contre modere')) variant = 'warning';
  return <Badge variant={variant}>{reason}</Badge>;
}

function BanCard({ ban, onBan, rank }) {
  return (
    <div className={`glass-card flex items-center gap-3 py-2.5 px-3 transition-all duration-200 ${
      rank <= 3 ? '!border-red-500/12 !bg-red-500/[0.03]' : 'hover:!border-border'
    }`}>
      <div className="text-[11px] font-bold w-4 text-center tabular-nums text-txt-muted">{rank}</div>
      <img
        src={`${getDDragonChampBase()}/${ban.champion_key}.png`}
        alt={ban.champion_name}
        className="w-9 h-9 rounded-xl border border-border-subtle"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate text-txt-primary">{ban.champion_name}</span>
          {ban.meta_role && (
            <span className="text-[10px] capitalize text-txt-muted">{ban.meta_role}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {ban.reasons.map((r, i) => (
            <ReasonBadge key={i} reason={r} />
          ))}
        </div>
      </div>
      <BanScore value={ban.ban_score} />
      <button
        onClick={() => onBan(ban)}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/15 text-red-400 text-[11px] font-medium hover:bg-red-500/20 transition cursor-pointer"
        title={`Bannir ${ban.champion_name}`}
      >
        <Shield size={11} />
        Ban
      </button>
    </div>
  );
}

export default function BanPanel() {
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { myRole, setBan, blueBans, redBans, myTeam, getAllBannedIds, getAllPickedIds } = useDraftStore();
  const { championPool } = useUserStore();

  const fetchBans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBanRecommendations(
        myRole,
        championPool,
        getAllBannedIds(),
        getAllPickedIds(),
      );
      setBans(data.ban_suggestions || []);
    } catch (e) {
      setError(e.message || 'Erreur de calcul des bans');
    } finally {
      setLoading(false);
    }
  }, [myRole, championPool, getAllBannedIds, getAllPickedIds]);

  const handleBan = (ban) => {
    const myBans = myTeam === 'blue' ? blueBans : redBans;
    const emptyIdx = myBans.findIndex((b) => b === null);
    if (emptyIdx !== -1) {
      setBan(myTeam, emptyIdx, { id: ban.champion_id, key: ban.champion_key, name: ban.champion_name });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={15} className="text-red-400" />
          <span className="text-sm font-bold text-txt-primary">Bans suggeres</span>
        </div>
        <button
          onClick={fetchBans}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/8 border border-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/15 transition cursor-pointer disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
          {loading ? 'Calcul...' : 'Analyser bans'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/15 bg-red-500/5">
          <AlertTriangle size={13} className="text-red-400 shrink-0" />
          <span className="text-[11px] text-red-400">{error}</span>
        </div>
      )}

      {!loading && bans.length === 0 && !error && (
        <div className="text-center py-8">
          <Shield size={22} className="mx-auto mb-2 text-txt-muted" />
          <div className="text-xs text-txt-muted">
            Cliquez sur <span className="text-red-400 font-medium">Analyser bans</span> pour obtenir des suggestions.
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="text-red-400 animate-spin mr-2" />
          <span className="text-xs text-txt-secondary">Analyse des counters et de la meta...</span>
        </div>
      )}

      {bans.length > 0 && (
        <div className="space-y-2 stagger-children">
          {bans.map((ban, i) => (
            <BanCard key={ban.champion_id} ban={ban} rank={i + 1} onBan={handleBan} />
          ))}
        </div>
      )}
    </div>
  );
}
