/**
 * Meta Snapshot — Top picks per role with winrate, pickrate, banrate.
 * Shows a tier list for each role, ranked by meta score.
 */
import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Crown, Shield, Flame, Ban, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchTierlist } from '../../services/api';
import RoleIcon from '../RoleIcon';
import Badge from '../ui/Badge';

const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion';

/* Tier badge based on meta score */
function TierBadge({ score }) {
  if (score >= 75) return <Badge variant="accent">S+</Badge>;
  if (score >= 65) return <Badge variant="success">S</Badge>;
  if (score >= 55) return <Badge variant="info">A</Badge>;
  if (score >= 45) return <Badge variant="default">B</Badge>;
  if (score >= 35) return <Badge variant="warning">C</Badge>;
  return <Badge variant="danger">D</Badge>;
}

/* Stat bar */
function StatBar({ value, max = 100, color = 'amber' }) {
  const pct = Math.min((value / max) * 100, 100);
  const barColors = {
    emerald: 'bg-emerald-500',
    amber: 'bg-violet-500',
    red: 'bg-red-500',
    sky: 'bg-sky-500',
  };
  return (
    <div className="h-1 w-16 bg-surface-elevated rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${barColors[color] || barColors.amber} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* Champion row in tier list */
function ChampionRow({ champ, rank }) {
  const wrColor = champ.win_rate >= 52 ? 'text-emerald-400' : champ.win_rate >= 49 ? 'text-slate-300' : 'text-red-400';

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-surface-elevated/60 ${
      rank <= 3 ? 'bg-surface-elevated/30' : ''
    }`}>
      {/* Rank */}
      <div className={`w-6 text-center font-bold text-xs tabular-nums ${
        rank === 1 ? 'text-violet-400' : rank <= 3 ? 'text-slate-300' : 'text-slate-500'
      }`}>
        {rank}
      </div>

      {/* Champion image */}
      <img
        src={`${DDRAGON}/${champ.champion_key}.png`}
        alt={champ.champion_name}
        className={`w-9 h-9 rounded-lg border ${rank <= 3 ? 'border-violet-500/30' : 'border-slate-700'}`}
        loading="lazy"
      />

      {/* Name + tier */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-100 truncate">{champ.champion_name}</span>
          <TierBadge score={champ.meta_score} />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[11px]">
        {/* Win Rate */}
        <div className="flex items-center gap-1.5 w-20">
          <Crown size={11} className={wrColor} />
          <span className={`tabular-nums font-medium ${wrColor}`}>{champ.win_rate.toFixed(1)}%</span>
        </div>

        {/* Pick Rate */}
        <div className="flex items-center gap-1.5 w-24">
          <span className="text-slate-500 w-6">Pick</span>
          <StatBar value={champ.pick_rate} max={15} color="sky" />
          <span className="text-slate-400 tabular-nums w-10 text-right">{champ.pick_rate.toFixed(1)}%</span>
        </div>

        {/* Ban Rate */}
        <div className="flex items-center gap-1.5 w-24">
          <span className="text-slate-500 w-6">Ban</span>
          <StatBar value={champ.ban_rate} max={40} color="red" />
          <span className="text-slate-400 tabular-nums w-10 text-right">{champ.ban_rate.toFixed(1)}%</span>
        </div>

        {/* Games */}
        <div className="w-16 text-right">
          <span className="text-slate-500 tabular-nums text-[10px]">
            {champ.games >= 1000 ? `${(champ.games / 1000).toFixed(1)}k` : champ.games}
          </span>
        </div>

        {/* Meta Score */}
        <div className={`w-10 text-right font-bold tabular-nums ${
          champ.meta_score >= 65 ? 'text-amber-400' : champ.meta_score >= 50 ? 'text-slate-300' : 'text-slate-500'
        }`}>
          {champ.meta_score.toFixed(0)}
        </div>
      </div>
    </div>
  );
}

export default function MetaSnapshot() {
  const [role, setRole] = useState('mid');
  const [tierlist, setTierlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTierlist(role);
      setTierlist(data || []);
    } catch (err) {
      console.error('Failed to load tierlist:', err);
      setTierlist([]);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    load();
    setShowAll(false);
  }, [load]);

  const displayed = showAll ? tierlist : tierlist.slice(0, 20);

  // Top 3 summary
  const top3 = tierlist.slice(0, 3);
  // Highest win rate in top 20
  const highestWr = tierlist.length > 0
    ? tierlist.slice(0, 20).reduce((best, c) => c.win_rate > best.win_rate ? c : best, tierlist[0])
    : null;
  // Most banned
  const mostBanned = tierlist.length > 0
    ? tierlist.slice(0, 30).reduce((best, c) => c.ban_rate > best.ban_rate ? c : best, tierlist[0])
    : null;

  return (
    <div className="space-y-4">
      {/* Role selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 font-medium">Rôle</span>
        <div className="flex gap-0.5 bg-surface rounded-lg p-0.5 border border-slate-700/50">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                role === r
                  ? 'bg-violet-500/15 text-violet-400 border border-violet-500/25'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <RoleIcon role={r} size={14} />
              <span className="capitalize">{r}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-12 bg-surface rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Quick highlights */}
          {top3.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {/* Top 3 podium */}
              <div className="panel p-3">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">
                  Top 3 Meta
                </div>
                <div className="space-y-2">
                  {top3.map((c, i) => (
                    <div key={c.champion_id} className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-4 ${
                        i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : 'text-amber-700'
                      }`}>{i + 1}</span>
                      <img
                        src={`${DDRAGON}/${c.champion_key}.png`}
                        alt={c.champion_name}
                        className="w-7 h-7 rounded-md border border-slate-700"
                        loading="lazy"
                      />
                      <span className="text-xs text-slate-200 font-medium truncate">{c.champion_name}</span>
                      <span className="ml-auto text-[11px] text-amber-400 font-bold tabular-nums">{c.meta_score.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Highest WR */}
              {highestWr && (
                <div className="panel p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">
                    Meilleur Win Rate
                  </div>
                  <div className="flex items-center gap-2">
                    <img
                      src={`${DDRAGON}/${highestWr.champion_key}.png`}
                      alt={highestWr.champion_name}
                      className="w-10 h-10 rounded-lg border border-emerald-500/30"
                      loading="lazy"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-100">{highestWr.champion_name}</div>
                      <div className="text-emerald-400 text-sm font-bold tabular-nums">{highestWr.win_rate.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Most banned */}
              {mostBanned && (
                <div className="panel p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">
                    Plus Banni
                  </div>
                  <div className="flex items-center gap-2">
                    <img
                      src={`${DDRAGON}/${mostBanned.champion_key}.png`}
                      alt={mostBanned.champion_name}
                      className="w-10 h-10 rounded-lg border border-red-500/30"
                      loading="lazy"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-100">{mostBanned.champion_name}</div>
                      <div className="text-red-400 text-sm font-bold tabular-nums">{mostBanned.ban_rate.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Header row */}
          <div className="flex items-center px-3 py-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">
            <div className="w-6 text-center">#</div>
            <div className="w-9 ml-3" />
            <div className="flex-1 ml-3">Champion</div>
            <div className="w-20">WR</div>
            <div className="w-24">Pick</div>
            <div className="w-24">Ban</div>
            <div className="w-16 text-right">Games</div>
            <div className="w-10 text-right">Score</div>
          </div>

          {/* Tier list */}
          <div className="space-y-0.5">
            {displayed.map((champ, i) => (
              <ChampionRow key={champ.champion_id} champ={champ} rank={i + 1} />
            ))}
          </div>

          {/* Show more / less */}
          {tierlist.length > 20 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-surface-elevated/50 text-xs text-slate-400 hover:text-slate-200 transition-colors border border-slate-700/30"
            >
              {showAll ? (
                <>
                  <ChevronUp size={14} />
                  Voir moins
                </>
              ) : (
                <>
                  <ChevronDown size={14} />
                  Voir les {tierlist.length - 20} autres
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
