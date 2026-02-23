/**
 * Draft History page -- View past drafts, record results, see stats.
 * Premium dark theme with glass cards and consistent design tokens.
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  Clock, Trophy, TrendingUp, TrendingDown, Trash2, ChevronDown,
  ChevronUp, BarChart3, Target, CheckCircle, XCircle, RotateCcw, Filter,
} from 'lucide-react';
import useHistoryStore from '../../stores/historyStore';
import { getScoreClasses, getWinProbColor, formatWPA, getWPAColor } from '../../lib/scores';
import Badge from '../ui/Badge';
import RoleIcon from '../RoleIcon';
import { getDDragonChampBase } from '../../lib/constants';

const RESULT_OPTIONS = [
  { value: 'win', label: 'Victoire', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25' },
  { value: 'loss', label: 'Defaite', icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/25' },
  { value: 'remake', label: 'Remake', icon: RotateCcw, color: 'text-txt-muted', bg: 'bg-surface-elevated border-border-subtle' },
];

function ChampImg({ champKey, size = 28 }) {
  if (!champKey) return null;
  return (
    <img
      src={`${getDDragonChampBase()}/${champKey}.png`}
      alt={champKey}
      className="rounded-lg"
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
}

/* -- Stats Overview -- */
function StatsOverview({ stats }) {
  if (!stats || stats.total_games === 0) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent-muted flex items-center justify-center">
            <Trophy size={13} className="text-accent" />
          </div>
          <span className="section-label">WPA</span>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${getWPAColor(stats.win_rate)}`}>
          {formatWPA(stats.win_rate)}
        </div>
        <div className="text-[11px] text-txt-muted mt-1.5">
          {stats.wins}W {stats.losses}L {stats.remakes > 0 && `${stats.remakes}R`}
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-500/12 flex items-center justify-center">
            <BarChart3 size={13} className="text-sky-400" />
          </div>
          <span className="section-label">Parties</span>
        </div>
        <div className="text-2xl font-bold text-txt-primary tabular-nums">{stats.total_games}</div>
        <div className="text-[11px] text-txt-muted mt-1.5">
          {stats.unrecorded > 0 && `${stats.unrecorded} sans resultat`}
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-7 h-7 rounded-lg bg-purple-500/12 flex items-center justify-center">
            <Target size={13} className="text-purple-400" />
          </div>
          <span className="section-label">Score moyen</span>
        </div>
        <div className="text-2xl font-bold text-txt-primary tabular-nums">
          {stats.avg_recommendation_score > 0 ? stats.avg_recommendation_score.toFixed(0) : '--'}
        </div>
        <div className="text-[11px] text-txt-muted mt-1.5">Score recommandation</div>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/12 flex items-center justify-center">
            <CheckCircle size={13} className="text-emerald-400" />
          </div>
          <span className="section-label">Suivi reco</span>
        </div>
        <div className="text-2xl font-bold text-txt-primary tabular-nums">
          {stats.followed_recommendation > 0 ? `${stats.followed_recommendation}` : '--'}
        </div>
        <div className="text-[11px] text-txt-muted mt-1.5">
          {stats.followed_recommendation > 0
            ? `${stats.followed_recommendation_wins}W / ${stats.followed_recommendation}G`
            : 'Pas encore de donnees'}
        </div>
      </div>
    </div>
  );
}

/* -- Most Picked Champions -- */
function MostPicked({ champions }) {
  if (!champions || champions.length === 0) return null;
  return (
    <div className="glass-card p-4 mb-4">
      <div className="section-label mb-3">Champions les plus joues</div>
      <div className="flex flex-wrap gap-2">
        {champions.map((c) => (
          <div key={c.champion_id} className="flex items-center gap-2 bg-surface-elevated rounded-xl px-2.5 py-1.5 border border-border-subtle">
            <ChampImg champKey={c.champion_key} size={24} />
            <div>
              <div className="text-xs font-medium text-txt-primary">{c.champion_name}</div>
              <div className="text-[10px] text-txt-muted">
                {c.count}G · <span className={getWPAColor(c.win_rate)}>{formatWPA(c.win_rate)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -- By Role Stats -- */
function RoleStats({ byRole }) {
  if (!byRole || Object.keys(byRole).length === 0) return null;
  return (
    <div className="glass-card p-4 mb-4">
      <div className="section-label mb-3">Par role</div>
      <div className="flex flex-wrap gap-2.5">
        {Object.entries(byRole).map(([role, data]) => (
          <div key={role} className="flex items-center gap-2 bg-surface-elevated rounded-xl px-3 py-2 border border-border-subtle">
            <RoleIcon role={role} size={14} className="text-txt-secondary" />
            <div>
              <div className="text-xs font-medium text-txt-primary capitalize">{role}</div>
              <div className="text-[10px] text-txt-muted">
                {data.games}G · <span className={getWPAColor(data.win_rate)}>{formatWPA(data.win_rate)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -- History Entry Card -- */
function HistoryCard({ entry, onUpdateResult, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [showResultPicker, setShowResultPicker] = useState(false);

  const date = new Date(entry.timestamp);
  const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const resultOpt = RESULT_OPTIONS.find((r) => r.value === entry.result);
  const resultColor = resultOpt ? resultOpt.color : 'text-txt-muted';
  const resultBg = resultOpt ? resultOpt.bg : 'bg-surface-default border-border-subtle';

  return (
    <div className={`glass-card border transition-all duration-200 animate-fade-in-up ${resultBg}`}>
      <div className="p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChampImg champKey={entry.my_champion_key} size={40} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-txt-primary">{entry.my_champion_name || 'Inconnu'}</span>
                <RoleIcon role={entry.my_role} size={14} className="text-txt-secondary" />
                {entry.recommendation_score && (
                  <span className={`text-[11px] font-medium tabular-nums ${getScoreClasses(entry.recommendation_score).text}`}>
                    {entry.recommendation_score.toFixed(0)} pts
                  </span>
                )}
              </div>
              <div className="text-[11px] text-txt-muted">{dateStr} · {timeStr}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {entry.win_probability && (
              <span className={`text-xs font-medium tabular-nums ${getWinProbColor(entry.win_probability)}`}>
                {entry.win_probability.toFixed(1)}% win
              </span>
            )}

            {entry.result ? (
              <button
                onClick={() => setShowResultPicker(!showResultPicker)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-medium ${resultBg} ${resultColor} cursor-pointer hover:opacity-80 transition-all`}
              >
                {resultOpt && <resultOpt.icon size={12} />}
                {resultOpt?.label || entry.result}
              </button>
            ) : (
              <button
                onClick={() => setShowResultPicker(!showResultPicker)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl border border-accent/30 bg-accent-muted text-accent text-xs font-medium cursor-pointer hover:bg-accent-subtle transition-all"
              >
                Resultat ?
              </button>
            )}

            <button
              onClick={() => setExpanded(!expanded)}
              className="btn-ghost p-1.5"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <button
              onClick={() => onDelete(entry.id)}
              className="btn-ghost p-1.5 !text-txt-muted hover:!text-red-400"
              title="Supprimer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {showResultPicker && (
          <div className="flex gap-2 mt-3 animate-fade-in-up">
            {RESULT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onUpdateResult(entry.id, opt.value); setShowResultPicker(false); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer hover:scale-[1.02] ${opt.bg} ${opt.color}`}
              >
                <opt.icon size={13} />
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-3.5 pb-3.5 border-t border-border-subtle mt-1 pt-3 space-y-3 animate-fade-in-up">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="section-label mb-2">Allies</div>
              <div className="space-y-1.5">
                {entry.ally_picks?.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <ChampImg champKey={p.champion_key} size={22} />
                    <span className="text-xs text-txt-secondary">{p.champion_name}</span>
                    <span className="text-[10px] text-txt-muted capitalize">{p.role}</span>
                  </div>
                ))}
                {(!entry.ally_picks || entry.ally_picks.length === 0) && (
                  <div className="text-[11px] text-txt-muted">Aucun allie enregistre</div>
                )}
              </div>
            </div>
            <div>
              <div className="section-label mb-2">Ennemis</div>
              <div className="space-y-1.5">
                {entry.enemy_picks?.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <ChampImg champKey={p.champion_key} size={22} />
                    <span className="text-xs text-txt-secondary">{p.champion_name}</span>
                    <span className="text-[10px] text-txt-muted capitalize">{p.role}</span>
                  </div>
                ))}
                {(!entry.enemy_picks || entry.enemy_picks.length === 0) && (
                  <div className="text-[11px] text-txt-muted">Aucun ennemi enregistre</div>
                )}
              </div>
            </div>
          </div>

          {((entry.ally_bans && entry.ally_bans.length > 0) || (entry.enemy_bans && entry.enemy_bans.length > 0)) && (
            <div>
              <div className="section-label mb-2">Bans</div>
              <div className="flex gap-1.5 flex-wrap">
                {[...(entry.ally_bans || []), ...(entry.enemy_bans || [])].map((b, i) => (
                  <div key={i} className="flex items-center gap-1 bg-surface-elevated rounded-lg px-2 py-0.5 border border-border-subtle">
                    <ChampImg champKey={b.champion_key} size={18} />
                    <span className="text-[10px] text-txt-secondary">{b.champion_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {entry.tags && entry.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {entry.tags.map((t, i) => (
                <Badge key={i} variant="default">{t}</Badge>
              ))}
            </div>
          )}

          {entry.notes && (
            <div className="text-[11px] text-txt-secondary italic leading-relaxed">
              "{entry.notes}"
            </div>
          )}

          {entry.patch && (
            <div className="text-[10px] text-txt-muted">Patch {entry.patch}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* -- Main History Component -- */
export default function DraftHistory({ champions, embedded = false }) {
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

  // When embedded inside InsightsPage, skip the outer wrapper + own header
  const content = (
    <>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="input-field !w-auto !py-1.5 !px-3 text-xs"
        >
          <option value="all">Tous roles</option>
          <option value="top">Top</option>
          <option value="jungle">Jungle</option>
          <option value="mid">Mid</option>
          <option value="bot">Bot</option>
          <option value="support">Support</option>
        </select>
        <select
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value)}
          className="input-field !w-auto !py-1.5 !px-3 text-xs"
        >
          <option value="all">Tous resultats</option>
          <option value="win">Victoires</option>
          <option value="loss">Defaites</option>
          <option value="remake">Remakes</option>
          <option value="">Non enregistres</option>
        </select>
      </div>

      <StatsOverview stats={stats} />

      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MostPicked champions={stats.most_picked} />
          <RoleStats byRole={stats.by_role} />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-txt-secondary">Chargement...</div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 mb-4">
          {error}
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-xl bg-surface-default border border-border-subtle flex items-center justify-center mb-4">
            <Clock size={28} className="text-txt-muted" />
          </div>
          <div className="text-sm font-medium text-txt-secondary mb-1">{"Pas encore d'historique"}</div>
          <div className="text-xs text-txt-muted text-center max-w-xs leading-relaxed">
            {"Vos sessions de draft seront automatiquement enregistrees quand vous utilisez l'analyseur. Vous pourrez ensuite noter victoire ou defaite."}
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="space-y-2 mt-4">
          <div className="text-[11px] text-txt-muted mb-2">
            {filtered.length} session{filtered.length > 1 ? 's' : ''}
            {(roleFilter !== 'all' || resultFilter !== 'all') && ' (filtre)'}
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
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/12 border border-purple-500/20 flex items-center justify-center">
              <Clock size={20} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-txt-primary">Historique</h1>
              <p className="text-xs text-txt-muted">Vos sessions de draft passees et statistiques</p>
            </div>
          </div>
        </div>

        {content}
      </div>
    </div>
  );
}
