/**
 * Ban Recommendations panel — suggests optimal bans based on pool and meta.
 */
import React, { useState, useCallback } from 'react';
import { Shield, Loader2, AlertTriangle, Crosshair, TrendingUp, Users } from 'lucide-react';
import { fetchBanRecommendations } from '../../services/api';
import useDraftStore from '../../stores/draftStore';
import useUserStore from '../../stores/userStore';
import Badge from '../ui/Badge';

const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion';

/* ── Ban score display ── */
function BanScore({ value }) {
  const color = value >= 70
    ? 'text-red-400 bg-red-500/15 border-red-500/25'
    : value >= 50
      ? 'text-amber-400 bg-amber-500/15 border-amber-500/25'
      : 'text-slate-400 bg-slate-700/50 border-slate-600/50';
  return (
    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center text-xs font-bold tabular-nums ${color}`}>
      {value.toFixed(0)}
    </div>
  );
}

/* ── Reason tag mapping ── */
function ReasonBadge({ reason }) {
  let variant = 'default';
  if (reason.includes('Contre fort') || reason.includes('dangereux')) variant = 'danger';
  else if (reason.includes('Meta S') || reason.includes('Meta forte')) variant = 'accent';
  else if (reason.includes('fréquemment')) variant = 'warning';
  else if (reason.includes('Contre modéré')) variant = 'warning';
  return <Badge variant={variant}>{reason}</Badge>;
}

/* ── Single ban suggestion card ── */
function BanCard({ ban, onBan, rank }) {
  return (
    <div className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all duration-150 ${
      rank <= 3 ? 'bg-red-500/5 border border-red-500/15' : 'bg-surface border border-slate-700/50 hover:border-slate-600'
    }`}>
      {/* Rank */}
      <div className="text-[11px] font-bold text-slate-500 w-4 text-center tabular-nums">{rank}</div>

      {/* Champion icon */}
      <img
        src={`${DDRAGON}/${ban.champion_key}.png`}
        alt={ban.champion_name}
        className="w-8 h-8 rounded"
        loading="lazy"
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-100 truncate">{ban.champion_name}</span>
          {ban.meta_role && (
            <span className="text-[10px] text-slate-500 capitalize">{ban.meta_role}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {ban.reasons.map((r, i) => (
            <ReasonBadge key={i} reason={r} />
          ))}
        </div>
      </div>

      {/* Score */}
      <BanScore value={ban.ban_score} />

      {/* Quick ban button */}
      <button
        onClick={() => onBan(ban)}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/15 border border-red-500/25 text-red-400 text-[11px] font-medium hover:bg-red-500/25 transition cursor-pointer"
        title={`Bannir ${ban.champion_name}`}
      >
        <Shield size={11} />
        Ban
      </button>
    </div>
  );
}

/* ── Main Ban Panel ── */
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
    // Find first empty ban slot on my team
    const myBans = myTeam === 'blue' ? blueBans : redBans;
    const emptyIdx = myBans.findIndex((b) => b === null);
    if (emptyIdx !== -1) {
      setBan(myTeam, emptyIdx, { id: ban.champion_id, key: ban.champion_key, name: ban.champion_name });
    }
  };

  return (
    <div className="space-y-3">
      {/* Header + trigger */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-red-400" />
          <span className="text-sm font-semibold text-slate-100">Bans suggérés</span>
        </div>
        <button
          onClick={fetchBans}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-medium hover:bg-red-500/20 transition cursor-pointer disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
          {loading ? 'Calcul…' : 'Analyser bans'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-2 rounded-lg border border-red-500/20 bg-red-500/5">
          <AlertTriangle size={13} className="text-red-400 shrink-0" />
          <span className="text-[11px] text-red-400">{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && bans.length === 0 && !error && (
        <div className="text-center py-6">
          <Shield size={20} className="text-slate-600 mx-auto mb-2" />
          <div className="text-xs text-slate-500">
            Cliquez sur <span className="text-red-400 font-medium">Analyser bans</span> pour obtenir des suggestions basées sur votre pool et la méta.
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={16} className="text-red-400 animate-spin mr-2" />
          <span className="text-xs text-slate-400">Analyse des counters et de la méta…</span>
        </div>
      )}

      {/* Results */}
      {bans.length > 0 && (
        <div className="space-y-1.5 stagger-children">
          {bans.map((ban, i) => (
            <BanCard
              key={ban.champion_id}
              ban={ban}
              rank={i + 1}
              onBan={handleBan}
            />
          ))}
        </div>
      )}
    </div>
  );
}
