/**
 * Draft History page — View past drafts, record results, see stats.
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  Clock, Trophy, TrendingUp, TrendingDown, Trash2, ChevronDown,
  ChevronUp, BarChart3, Target, CheckCircle, XCircle, RotateCcw, Filter,
} from 'lucide-react';
import useHistoryStore from '../../stores/historyStore';
import { getScoreClasses, getWinProbColor } from '../../lib/scores';
import Badge from '../ui/Badge';
import RoleIcon from '../RoleIcon';

const RESULT_OPTIONS = [
  { value: 'win', label: 'Victoire', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25' },
  { value: 'loss', label: 'Défaite', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/25' },
  { value: 'remake', label: 'Remake', icon: RotateCcw, color: 'text-slate-400', bg: 'bg-slate-700/50 border-slate-600/50' },
];

const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion';

function ChampImg({ champKey, size = 28 }) {
  if (!champKey) return null;
  return (
    <img
      src={`${DDRAGON}/${champKey}.png`}
      alt={champKey}
      className="rounded"
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
}

/* ── Stats Overview ── */
function StatsOverview({ stats }) {
  if (!stats || stats.total_games === 0) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {/* Win rate */}
      <div className="panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <Trophy size={14} className="text-violet-500" />
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Win Rate</span>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${stats.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
          {stats.win_rate}%
        </div>
        <div className="text-[11px] text-slate-500 mt-1">
          {stats.wins}W {stats.losses}L {stats.remakes > 0 && `${stats.remakes}R`}
        </div>
      </div>

      {/* Total games */}
      <div className="panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 size={14} className="text-sky-500" />
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Parties</span>
        </div>
        <div className="text-2xl font-bold text-slate-100 tabular-nums">{stats.total_games}</div>
        <div className="text-[11px] text-slate-500 mt-1">
          {stats.unrecorded > 0 && `${stats.unrecorded} sans résultat`}
        </div>
      </div>

      {/* Avg Score */}
      <div className="panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <Target size={14} className="text-purple-400" />
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Score moyen</span>
        </div>
        <div className="text-2xl font-bold text-slate-100 tabular-nums">
          {stats.avg_recommendation_score > 0 ? stats.avg_recommendation_score.toFixed(0) : '—'}
        </div>
        <div className="text-[11px] text-slate-500 mt-1">Score recommandation</div>
      </div>

      {/* Follow rate */}
      <div className="panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle size={14} className="text-emerald-400" />
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">Suivi reco</span>
        </div>
        <div className="text-2xl font-bold text-slate-100 tabular-nums">
          {stats.followed_recommendation > 0
            ? `${stats.followed_recommendation}`
            : '—'}
        </div>
        <div className="text-[11px] text-slate-500 mt-1">
          {stats.followed_recommendation > 0
            ? `${stats.followed_recommendation_wins}W / ${stats.followed_recommendation}G`
            : 'Pas encore de données'}
        </div>
      </div>
    </div>
  );
}

/* ── Most Picked Champions ── */
function MostPicked({ champions }) {
  if (!champions || champions.length === 0) return null;
  return (
    <div className="panel p-3 mb-4">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium mb-3">
        Champions les plus joués
      </div>
      <div className="flex flex-wrap gap-2">
        {champions.map((c) => (
          <div key={c.champion_id} className="flex items-center gap-2 bg-surface-elevated rounded-lg px-2.5 py-1.5">
            <ChampImg champKey={c.champion_key} size={24} />
            <div>
              <div className="text-xs font-medium text-slate-200">{c.champion_name}</div>
              <div className="text-[10px] text-slate-500">
                {c.count}G · <span className={c.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400'}>{c.win_rate}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── By Role Stats ── */
function RoleStats({ byRole }) {
  if (!byRole || Object.keys(byRole).length === 0) return null;
  return (
    <div className="panel p-3 mb-6">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium mb-3">
        Par rôle
      </div>
      <div className="flex flex-wrap gap-3">
        {Object.entries(byRole).map(([role, data]) => (
          <div key={role} className="flex items-center gap-2 bg-surface-elevated rounded-lg px-3 py-2">
            <RoleIcon role={role} size={14} className="text-slate-400" />
            <div>
              <div className="text-xs font-medium text-slate-200 capitalize">{role}</div>
              <div className="text-[10px] text-slate-500">
                {data.games}G · <span className={data.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400'}>{data.win_rate}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── History Entry Card ── */
function HistoryCard({ entry, onUpdateResult, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [showResultPicker, setShowResultPicker] = useState(false);

  const date = new Date(entry.timestamp);
  const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const resultOpt = RESULT_OPTIONS.find((r) => r.value === entry.result);
  const resultColor = resultOpt ? resultOpt.color : 'text-slate-500';
  const resultBg = resultOpt ? resultOpt.bg : 'bg-slate-800/50 border-slate-700/50';

  return (
    <div className={`panel border transition-all duration-150 animate-fade-in-up ${resultBg}`}>
      <div className="p-3">
        <div className="flex items-center justify-between">
          {/* Left: champion + role + date */}
          <div className="flex items-center gap-3">
            <ChampImg champKey={entry.my_champion_key} size={36} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">{entry.my_champion_name || 'Inconnu'}</span>
                <RoleIcon role={entry.my_role} size={14} className="text-slate-400" />
                {entry.recommendation_score && (
                  <span className={`text-[11px] font-medium tabular-nums ${getScoreClasses(entry.recommendation_score).text}`}>
                    {entry.recommendation_score.toFixed(0)} pts
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500">{dateStr} · {timeStr}</div>
            </div>
          </div>

          {/* Right: result + actions */}
          <div className="flex items-center gap-2">
            {entry.win_probability && (
              <span className={`text-xs font-medium tabular-nums ${getWinProbColor(entry.win_probability)}`}>
                {entry.win_probability.toFixed(1)}% win
              </span>
            )}

            {/* Result badge / picker */}
            {entry.result ? (
              <button
                onClick={() => setShowResultPicker(!showResultPicker)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium ${resultBg} ${resultColor} cursor-pointer hover:opacity-80 transition`}
              >
                {resultOpt && <resultOpt.icon size={12} />}
                {resultOpt?.label || entry.result}
              </button>
            ) : (
              <button
                onClick={() => setShowResultPicker(!showResultPicker)}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-400 text-xs font-medium cursor-pointer hover:bg-violet-500/20 transition"
              >
                Résultat ?
              </button>
            )}

            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded text-slate-500 hover:text-slate-300 transition"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <button
              onClick={() => onDelete(entry.id)}
              className="p-1 rounded text-slate-600 hover:text-red-400 transition"
              title="Supprimer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Result picker dropdown */}
        {showResultPicker && (
          <div className="flex gap-2 mt-2 animate-fade-in-up">
            {RESULT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onUpdateResult(entry.id, opt.value);
                  setShowResultPicker(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer hover:scale-[1.02] ${opt.bg} ${opt.color}`}
              >
                <opt.icon size={13} />
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-slate-700/30 mt-1 pt-3 space-y-3 animate-fade-in-up">
          {/* Team composition */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Alliés</div>
              <div className="space-y-1">
                {entry.ally_picks?.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <ChampImg champKey={p.champion_key} size={22} />
                    <span className="text-xs text-slate-300">{p.champion_name}</span>
                    <span className="text-[10px] text-slate-500 capitalize">{p.role}</span>
                  </div>
                ))}
                {(!entry.ally_picks || entry.ally_picks.length === 0) && (
                  <div className="text-[11px] text-slate-600">Aucun allié enregistré</div>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Ennemis</div>
              <div className="space-y-1">
                {entry.enemy_picks?.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <ChampImg champKey={p.champion_key} size={22} />
                    <span className="text-xs text-slate-300">{p.champion_name}</span>
                    <span className="text-[10px] text-slate-500 capitalize">{p.role}</span>
                  </div>
                ))}
                {(!entry.enemy_picks || entry.enemy_picks.length === 0) && (
                  <div className="text-[11px] text-slate-600">Aucun ennemi enregistré</div>
                )}
              </div>
            </div>
          </div>

          {/* Bans */}
          {((entry.ally_bans && entry.ally_bans.length > 0) || (entry.enemy_bans && entry.enemy_bans.length > 0)) && (
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Bans</div>
              <div className="flex gap-1.5 flex-wrap">
                {[...(entry.ally_bans || []), ...(entry.enemy_bans || [])].map((b, i) => (
                  <div key={i} className="flex items-center gap-1 bg-surface-elevated rounded px-1.5 py-0.5">
                    <ChampImg champKey={b.champion_key} size={18} />
                    <span className="text-[10px] text-slate-400">{b.champion_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {entry.tags.map((t, i) => (
                <Badge key={i} variant="default">{t}</Badge>
              ))}
            </div>
          )}

          {/* Notes */}
          {entry.notes && (
            <div className="text-[11px] text-slate-400 italic">
              "{entry.notes}"
            </div>
          )}

          {/* Patch */}
          {entry.patch && (
            <div className="text-[10px] text-slate-600">Patch {entry.patch}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main History Component ── */
export default function DraftHistory({ champions }) {
  const { entries, stats, loading, error, loadHistory, loadStats, updateResult, deleteEntry } = useHistoryStore();
  const [roleFilter, setRoleFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');

  useEffect(() => {
    loadHistory();
    loadStats();
  }, []);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (roleFilter !== 'all' && e.my_role !== roleFilter) return false;
      if (resultFilter !== 'all' && e.result !== resultFilter) return false;
      return true;
    });
  }, [entries, roleFilter, resultFilter]);

  return (
    <div className="h-[calc(100vh-2.5rem)] overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
              <Clock size={18} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-100">Historique</h1>
              <p className="text-xs text-slate-500">Vos sessions de draft passées et statistiques</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-surface-elevated border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
            >
              <option value="all">Tous rôles</option>
              <option value="top">Top</option>
              <option value="jungle">Jungle</option>
              <option value="mid">Mid</option>
              <option value="bot">Bot</option>
              <option value="support">Support</option>
            </select>
            <select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
              className="bg-surface-elevated border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
            >
              <option value="all">Tous résultats</option>
              <option value="win">Victoires</option>
              <option value="loss">Défaites</option>
              <option value="remake">Remakes</option>
              <option value="">Non enregistrés</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <StatsOverview stats={stats} />

        {/* Most picked + role breakdown */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MostPicked champions={stats.most_picked} />
            <RoleStats byRole={stats.by_role} />
          </div>
        )}

        {/* Loading / Error */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-slate-400">Chargement…</div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-lg bg-surface-elevated border border-slate-700/50 flex items-center justify-center mb-4">
              <Clock size={24} className="text-slate-500" />
            </div>
            <div className="text-sm font-medium text-slate-300 mb-1">Pas encore d'historique</div>
            <div className="text-xs text-slate-500 text-center max-w-xs">
              Vos sessions de draft seront automatiquement enregistrées quand vous utilisez l'analyseur.
              Vous pourrez ensuite noter victoire ou défaite.
            </div>
          </div>
        )}

        {/* Entries */}
        {filtered.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-slate-500 mb-2">
              {filtered.length} session{filtered.length > 1 ? 's' : ''}
              {(roleFilter !== 'all' || resultFilter !== 'all') && ' (filtré)'}
            </div>
            {filtered.map((entry) => (
              <HistoryCard
                key={entry.id}
                entry={entry}
                onUpdateResult={updateResult}
                onDelete={deleteEntry}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
