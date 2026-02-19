/**
 * My Stats — Personal performance dashboard from draft history.
 * Shows win rates, role breakdown, champion mastery, progression.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Trophy, TrendingUp, TrendingDown, BarChart3, Target, Crown,
  Flame, Loader2, MessageSquare,
} from 'lucide-react';
import { fetchHistoryStats, fetchHistory } from '../../services/api';
import RoleIcon from '../RoleIcon';

const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion';

/* Big stat card */
function StatCard({ icon: Icon, iconColor, label, value, sub, valueColor = 'text-slate-100' }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconColor}`}>
          <Icon size={14} />
        </div>
        <span className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

/* Win rate ring */
function WinRateRing({ percentage, size = 60 }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const color = percentage >= 55 ? '#34d399' : percentage >= 50 ? '#fbbf24' : '#f87171';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeWidth={4} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={4} fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{percentage.toFixed(0)}%</span>
      </div>
    </div>
  );
}

/* Champion mastery row */
function ChampionMastery({ champ }) {
  const wrColor = champ.win_rate >= 55 ? 'text-emerald-400' : champ.win_rate >= 50 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-surface-elevated/50 transition-colors">
      <img
        src={`${DDRAGON}/${champ.champion_key}.png`}
        alt={champ.champion_name}
        className="w-9 h-9 rounded-lg border border-slate-700"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-100 truncate">{champ.champion_name}</div>
        <div className="text-[11px] text-slate-500">{champ.count} partie{champ.count > 1 ? 's' : ''}</div>
      </div>
      <div className="flex items-center gap-3">
        <WinRateRing percentage={champ.win_rate} size={40} />
        <span className={`text-sm font-bold tabular-nums w-14 text-right ${wrColor}`}>
          {champ.win_rate.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

/* Role performance card */
function RolePerformance({ byRole }) {
  if (!byRole || Object.keys(byRole).length === 0) return null;

  const sorted = Object.entries(byRole).sort((a, b) => b[1].games - a[1].games);

  return (
    <div className="panel p-4">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium mb-3">
        Performance par rôle
      </div>
      <div className="space-y-2.5">
        {sorted.map(([role, data]) => {
          const wrColor = data.win_rate >= 55 ? 'text-emerald-400' : data.win_rate >= 50 ? 'text-amber-400' : 'text-red-400';
          const barPct = Math.min((data.games / sorted[0][1].games) * 100, 100);
          return (
            <div key={role} className="flex items-center gap-3">
              <div className="w-20 flex items-center gap-1.5">
                <RoleIcon role={role} size={16} className="text-slate-400" />
                <span className="text-xs text-slate-300 font-medium capitalize">{role}</span>
              </div>
              <div className="flex-1 h-2 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500/60 transition-all duration-500"
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <div className="flex items-center gap-2 w-28 justify-end">
                <span className="text-[11px] text-slate-500 tabular-nums">{data.games}G</span>
                <span className={`text-xs font-bold tabular-nums ${wrColor}`}>
                  {data.win_rate.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MyStats() {
  const [stats, setStats] = useState(null);
  const [recentGames, setRecentGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [statsData, history] = await Promise.all([
          fetchHistoryStats(),
          fetchHistory(20),
        ]);
        setStats(statsData);
        setRecentGames(history || []);
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Recent form (last 10 games with results)
  const recentForm = useMemo(() => {
    return recentGames
      .filter((g) => g.result === 'win' || g.result === 'loss')
      .slice(0, 10);
  }, [recentGames]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 size={24} className="text-amber-500 animate-spin mx-auto mb-3" />
          <div className="text-sm text-slate-400">Chargement de tes stats…</div>
        </div>
      </div>
    );
  }

  if (!stats || stats.total_games === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-16 h-16 rounded-xl bg-surface border border-slate-700/50 flex items-center justify-center mb-4">
          <BarChart3 size={28} className="text-slate-500" />
        </div>
        <div className="text-sm font-medium text-slate-300 mb-1">Pas encore de données</div>
        <div className="text-xs text-slate-500 text-center max-w-xs">
          Utilise l'analyseur de draft et enregistre tes résultats pour voir tes statistiques apparaître ici.
        </div>
      </div>
    );
  }

  const wrColor = stats.win_rate >= 55 ? 'text-emerald-400' : stats.win_rate >= 50 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Trophy}
          iconColor="bg-amber-500/15 text-amber-400"
          label="Win Rate"
          value={`${stats.win_rate.toFixed(1)}%`}
          valueColor={wrColor}
          sub={`${stats.wins}V ${stats.losses}D${stats.remakes > 0 ? ` ${stats.remakes}R` : ''}`}
        />
        <StatCard
          icon={BarChart3}
          iconColor="bg-sky-500/15 text-sky-400"
          label="Parties"
          value={stats.total_games}
          sub={stats.unrecorded > 0 ? `${stats.unrecorded} sans résultat` : 'Tout enregistré'}
        />
        <StatCard
          icon={Target}
          iconColor="bg-purple-500/15 text-purple-400"
          label="Score moyen"
          value={stats.avg_recommendation_score > 0 ? stats.avg_recommendation_score.toFixed(0) : '—'}
          sub="Score de recommandation"
        />
        <StatCard
          icon={Crown}
          iconColor="bg-emerald-500/15 text-emerald-400"
          label="Reco suivie"
          value={stats.followed_recommendation > 0 ? stats.followed_recommendation : '—'}
          sub={stats.followed_recommendation > 0 
            ? `${stats.followed_recommendation_wins}V / ${stats.followed_recommendation}G`
            : 'Pas de données'}
        />
      </div>

      {/* Recent form */}
      {recentForm.length > 0 && (
        <div className="panel p-4">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium mb-3">
            Forme récente
          </div>
          <div className="flex items-center gap-1.5">
            {recentForm.map((g, i) => (
              <div key={g.id || i} className="flex flex-col items-center gap-1">
                {g.my_champion_key && (
                  <img
                    src={`${DDRAGON}/${g.my_champion_key}.png`}
                    alt={g.my_champion_name}
                    className={`w-8 h-8 rounded-lg border-2 ${
                      g.result === 'win' ? 'border-emerald-500/50' : 'border-red-500/50'
                    }`}
                    title={`${g.my_champion_name} — ${g.result === 'win' ? 'Victoire' : 'Défaite'}`}
                    loading="lazy"
                  />
                )}
                <div className={`w-1.5 h-1.5 rounded-full ${
                  g.result === 'win' ? 'bg-emerald-500' : 'bg-red-500'
                }`} />
              </div>
            ))}
            <div className="ml-3 text-xs text-slate-400">
              {recentForm.filter((g) => g.result === 'win').length}V {recentForm.filter((g) => g.result === 'loss').length}D
              <span className="text-slate-600 ml-1">
                (dernières {recentForm.length})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Role performance + Champion mastery side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RolePerformance byRole={stats.by_role} />

        {/* Champion mastery */}
        {stats.most_picked?.length > 0 && (
          <div className="panel p-4">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium mb-2">
              Champions les plus joués
            </div>
            <div className="space-y-0.5">
              {stats.most_picked.slice(0, 8).map((c) => (
                <ChampionMastery key={c.champion_id} champ={c} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recommendation insights */}
      {stats.avg_win_probability > 0 && (
        <div className="panel p-4">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium mb-3">
            Insights
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Flame size={18} className="text-amber-400" />
              <div>
                <div className="text-sm font-medium text-slate-200">
                  Probabilité de victoire moyenne
                </div>
                <div className={`text-lg font-bold tabular-nums ${
                  stats.avg_win_probability >= 50 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {stats.avg_win_probability.toFixed(1)}%
                </div>
              </div>
            </div>
            {stats.followed_recommendation > 0 && stats.total_games > 5 && (
              <div className="flex items-center gap-3">
                <MessageSquare size={18} className="text-sky-400" />
                <div>
                  <div className="text-sm font-medium text-slate-200">
                    Taux de suivi reco
                  </div>
                  <div className="text-lg font-bold tabular-nums text-sky-400">
                    {((stats.followed_recommendation / stats.total_games) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
