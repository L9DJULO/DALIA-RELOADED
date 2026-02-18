import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Users, Crosshair, Swords, HelpCircle } from 'lucide-react';
import ScoreBreakdown from './ScoreBreakdown';
import Badge from '../ui/Badge';
import RoleIcon from '../RoleIcon';
import { getScoreClasses, formatGames } from '../../lib/scores';

/* ── Score display ── */
function ScoreDisplay({ value, size = 'md' }) {
  const colors = getScoreClasses(value);
  const sizeClasses = size === 'lg'
    ? 'w-12 h-12 text-base'
    : 'w-10 h-10 text-sm';

  return (
    <div className={`${sizeClasses} rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center font-bold tabular-nums ${colors.text}`}>
      {value.toFixed(0)}
    </div>
  );
}

/* ── Confidence tooltip ── */
function ConfidenceTooltip({ value }) {
  const level = value >= 60 ? 'Élevée' : value >= 35 ? 'Moyenne' : 'Faible';
  const color = value >= 60 ? 'text-emerald-400' : value >= 35 ? 'text-amber-400' : 'text-red-400';
  return (
    <span className="relative group/conf inline-flex items-center gap-1">
      <span className={`text-[10px] ${color}`}>{value.toFixed(0)}% fiable</span>
      <HelpCircle size={10} className="text-slate-600 group-hover/conf:text-slate-400 cursor-help" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                        w-48 px-2.5 py-1.5 rounded-lg bg-slate-700 border border-slate-600
                        text-[10px] text-slate-200 leading-relaxed shadow-xl
                        opacity-0 group-hover/conf:opacity-100 transition-opacity duration-150 z-50
                        before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2
                        before:border-4 before:border-transparent before:border-t-slate-700"
            role="tooltip"
      >
        <span className="font-medium">Fiabilité {level}</span> — quantité de données réelles utilisées. Plus d'ennemis visibles = plus fiable.
      </span>
    </span>
  );
}

/* ── Winrate indicator ── */
function WinrateIndicator({ delta }) {
  if (Math.abs(delta) < 0.5) {
    return (
      <div className="flex items-center gap-0.5 text-slate-500 text-[11px]">
        <Minus size={11} aria-hidden="true" />
        <span>Neutre</span>
      </div>
    );
  }
  const positive = delta > 0;
  return (
    <div className={`flex items-center gap-0.5 text-[11px] ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      {positive ? <TrendingUp size={11} aria-hidden="true" /> : <TrendingDown size={11} aria-hidden="true" />}
      <span className="tabular-nums">{positive ? '+' : ''}{delta.toFixed(1)}%</span>
    </div>
  );
}

/* ── Quick stat pill ── */
function StatPill({ icon: Icon, label, value, color = 'slate' }) {
  const colorClasses = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    slate: 'bg-slate-700/50 text-slate-300 border-slate-600/50',
  };

  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] ${colorClasses[color]}`}>
      <Icon size={11} aria-hidden="true" />
      <span className="text-slate-400">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

/* ── Tag label mapping ── */
const TAG_VARIANTS = {
  'safe-blind':       { label: 'Safe blind', variant: 'success' },
  'counter-pick':     { label: 'Counter',    variant: 'info' },
  'last-pick-counter':{ label: 'Last pick',  variant: 'info' },
  'meta-forte':       { label: 'Meta S',     variant: 'accent' },
  'flex':             { label: 'Flex',        variant: 'purple' },
  'low-data':         { label: 'Peu de data', variant: 'danger' },
};

export default function RecommendationCard({ rec, rank, champData, isWildcard = false }) {
  const [expanded, setExpanded] = useState(false);

  const getCardStyle = () => {
    if (rank === 1 && !isWildcard) {
      return 'bg-amber-500/5 border-amber-500/25';
    }
    return 'bg-surface border-slate-700/50 hover:border-slate-600';
  };

  const matchupScore = rec.breakdown?.matchup ?? 50;
  const synergyScore = rec.breakdown?.synergy ?? 50;

  return (
    <div className={`rounded-lg border transition-colors duration-150 ${getCardStyle()}`}>
      <div className="p-2.5">
        <div className="flex items-center gap-2.5">
          {/* Rank */}
          <div className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs tabular-nums ${
            rank === 1
              ? 'bg-amber-500/15 text-amber-400'
              : rank <= 3
                ? 'bg-slate-700/50 text-slate-300'
                : 'bg-slate-800/50 text-slate-500'
          }`}>
            {rank}
          </div>

          {/* Champion portrait */}
          <div className={`w-10 h-10 rounded-lg overflow-hidden border ${
            rank === 1 && !isWildcard ? 'border-amber-500/30' : 'border-slate-700'
          }`}>
            <img
              src={champData?.image_url || ''}
              alt={rec.champion_name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Champion info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm text-slate-100">{rec.champion_name}</span>
              {isWildcard && <Badge variant="default">Hors pool</Badge>}
              {(rec.tags || []).filter(t => t !== 'off-meta').map(tag => {
                const s = TAG_VARIANTS[tag];
                if (!s) return null;
                return <Badge key={tag} variant={s.variant}>{s.label}</Badge>;
              })}
              {rec.meta_games > 0 && (
                <span className={`text-[10px] tabular-nums ${rec.meta_games < 5000 ? 'text-red-400' : rec.meta_games < 15000 ? 'text-amber-400' : 'text-slate-500'}`}>
                  {formatGames(rec.meta_games)} games
                </span>
              )}
            </div>

            {/* Quick stats */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <StatPill
                icon={Crosshair}
                label="MU"
                value={matchupScore.toFixed(0)}
                color={matchupScore >= 60 ? 'emerald' : matchupScore >= 45 ? 'amber' : 'red'}
              />
              <StatPill
                icon={Users}
                label="Syn"
                value={synergyScore.toFixed(0)}
                color={synergyScore >= 60 ? 'emerald' : synergyScore >= 45 ? 'amber' : 'slate'}
              />
              {rec.confidence != null && (
                <ConfidenceTooltip value={rec.confidence} />
              )}
            </div>
          </div>

          {/* Main score */}
          <ScoreDisplay value={rec.total_score} size="lg" />

          {/* Expand */}
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Réduire' : 'Détails'}
            className="p-1.5 rounded-lg hover:bg-surface-elevated text-slate-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* ── Expanded details ── */}
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-slate-700/30 space-y-3 animate-fade-in-up">
          <ScoreBreakdown breakdown={rec.breakdown} />

          {/* Matchups + Synergies */}
          <div className="grid grid-cols-2 gap-3">
            {rec.matchup_details?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                  Matchups
                </div>
                <div className="space-y-0.5">
                  {rec.matchup_details.slice(0, 5).map((d, i) => (
                    <div
                      key={i}
                      className={`flex items-center text-[11px] py-1 px-1.5 rounded-md gap-1 ${
                        d.is_lane_opponent ? 'bg-surface-elevated/60' : 'bg-surface-elevated/30'
                      }`}
                    >
                      <span className={`shrink-0 flex justify-center ${d.is_lane_opponent ? 'text-amber-500' : 'text-slate-600'}`}>
                        {d.is_lane_opponent ? <Swords size={10} aria-label="Adversaire de lane" /> : '·'}
                      </span>
                      <span className="text-slate-300 truncate">{d.opponent_name}</span>
                      <RoleIcon role={d.opponent_role} size={11} className="text-slate-500 shrink-0" />
                      <span className="ml-auto shrink-0">
                        <WinrateIndicator delta={d.delta} />
                      </span>
                      <span className="text-slate-500 text-[10px] shrink-0 w-10 text-right tabular-nums">
                        {d.win_rate.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rec.synergy_details?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                  Synergies
                </div>
                <div className="space-y-0.5">
                  {rec.synergy_details.slice(0, 5).map((d, i) => (
                    <div key={i} className="flex items-center text-[11px] py-1 px-1.5 rounded-md bg-surface-elevated/30 gap-1">
                      <span className="text-slate-600 shrink-0">·</span>
                      <span className="text-slate-300 truncate">{d.ally_name}</span>
                      <RoleIcon role={d.ally_role} size={11} className="text-slate-500 shrink-0" />
                      <span className="ml-auto shrink-0">
                        <WinrateIndicator delta={d.delta} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Composition warnings */}
          {rec.composition_warnings?.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                Points d'attention
              </div>
              <div className="space-y-0.5">
                {rec.composition_warnings.map((w, i) => (
                  <div
                    key={i}
                    className={`text-[11px] py-1 px-1.5 rounded-md flex items-start gap-1.5 ${
                      w.severity === 'critical'
                        ? 'bg-red-500/10 text-red-400 border border-red-500/15'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/15'
                    }`}
                  >
                    <span className="shrink-0 mt-px">⚠</span>
                    <span>{w.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
