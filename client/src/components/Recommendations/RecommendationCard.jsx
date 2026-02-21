import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Users, Crosshair, Swords, HelpCircle } from 'lucide-react';
import ScoreBreakdown from './ScoreBreakdown';
import Badge from '../ui/Badge';
import RoleIcon from '../RoleIcon';
import { getScoreClasses, formatGames } from '../../lib/scores';

/* ── Score display ── */
function ScoreDisplay({ value, scoreRange, size = 'md' }) {
  const colors = getScoreClasses(value);
  const sizeClasses = size === 'lg' ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm';
  const hasRange = scoreRange && scoreRange.length === 2;
  const halfWidth = hasRange ? Math.round((scoreRange[1] - scoreRange[0]) / 2) : 0;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={`${sizeClasses} rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center font-bold tabular-nums ${colors.text}`}>
        {value.toFixed(0)}
      </div>
      {hasRange && halfWidth > 0 && (
        <span className="text-[9px] text-txt-muted tabular-nums" title={`Fourchette : ${scoreRange[0].toFixed(0)} -- ${scoreRange[1].toFixed(0)}`}>
          +/-{halfWidth}
        </span>
      )}
    </div>
  );
}

/* ── Confidence tooltip ── */
function ConfidenceTooltip({ value }) {
  const level = value >= 60 ? 'Elevee' : value >= 35 ? 'Moyenne' : 'Faible';
  const color = value >= 60 ? 'text-emerald-400' : value >= 35 ? 'text-amber-400' : 'text-red-400';
  return (
    <span className="relative group/conf inline-flex items-center gap-1">
      <span className={`text-[10px] ${color}`}>{value.toFixed(0)}% fiable</span>
      <HelpCircle size={10} className="text-txt-muted group-hover/conf:text-txt-secondary cursor-help" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                        w-48 px-2.5 py-1.5 rounded-xl bg-surface-overlay border border-border
                        text-[10px] text-txt-primary leading-relaxed shadow-xl
                        opacity-0 group-hover/conf:opacity-100 transition-opacity duration-150 z-50"
            role="tooltip"
      >
        <span className="font-medium">Fiabilite {level}</span> -- quantite de donnees reelles utilisees. Plus d'ennemis visibles = plus fiable.
      </span>
    </span>
  );
}

/* ── Winrate indicator ── */
function WinrateIndicator({ delta }) {
  if (Math.abs(delta) < 0.5) {
    return (
      <div className="flex items-center gap-0.5 text-txt-muted text-[11px]">
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
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/15',
    red: 'bg-red-500/10 text-red-400 border-red-500/15',
    slate: 'bg-surface-elevated text-txt-secondary border-border-subtle',
  };

  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] ${colorClasses[color]}`}>
      <Icon size={11} aria-hidden="true" />
      <span className="text-txt-muted">{label}</span>
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

  const matchupScore = rec.breakdown?.matchup ?? 50;
  const synergyScore = rec.breakdown?.synergy ?? 50;

  return (
    <div className={`glass-card transition-all duration-200 ${
      rank === 1 && !isWildcard
        ? '!border-accent/20 !bg-accent/[0.04]'
        : 'hover:!border-border'
    }`}>
      <div className="p-3">
        <div className="flex items-center gap-3">
          {/* Rank */}
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs tabular-nums ${
            rank === 1
              ? 'bg-accent-muted text-accent'
              : rank <= 3
                ? 'bg-surface-elevated text-txt-secondary'
                : 'bg-surface-elevated text-txt-muted'
          }`}>
            {rank}
          </div>

          {/* Champion portrait */}
          <div className={`w-11 h-11 rounded-xl overflow-hidden border-2 ${
            rank === 1 && !isWildcard ? 'border-accent/30' : 'border-border-subtle'
          }`}>
            <img
              src={champData?.image_url || ''}
              alt={rec.champion_name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm text-txt-primary">{rec.champion_name}</span>
              {isWildcard && <Badge variant="default">Hors pool</Badge>}
              {(rec.tags || []).filter(t => t !== 'off-meta').map(tag => {
                const s = TAG_VARIANTS[tag];
                if (!s) return null;
                return <Badge key={tag} variant={s.variant}>{s.label}</Badge>;
              })}
              {rec.meta_games > 0 && (
                <span className={`text-[10px] tabular-nums ${rec.meta_games < 5000 ? 'text-red-400' : rec.meta_games < 15000 ? 'text-amber-400' : 'text-txt-muted'}`}>
                  {formatGames(rec.meta_games)} games
                </span>
              )}
            </div>

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

          {/* Score */}
          <ScoreDisplay value={rec.total_score} scoreRange={rec.score_range} size="lg" />

          {/* Expand */}
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Reduire' : 'Details'}
            className="p-1.5 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-surface-elevated transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border-subtle space-y-3 animate-fade-in-up">
          <ScoreBreakdown breakdown={rec.breakdown} />

          <div className="grid grid-cols-2 gap-3">
            {rec.matchup_details?.length > 0 && (
              <div className="space-y-1.5">
                <div className="section-label">Matchups</div>
                <div className="space-y-0.5">
                  {rec.matchup_details.slice(0, 5).map((d, i) => (
                    <div
                      key={i}
                      className={`flex items-center text-[11px] py-1 px-2 rounded-lg gap-1.5 ${
                        d.is_lane_opponent ? 'bg-surface-elevated' : 'bg-surface-elevated/50'
                      }`}
                    >
                      <span className={`shrink-0 flex justify-center ${d.is_lane_opponent ? 'text-accent' : 'text-txt-muted'}`}>
                        {d.is_lane_opponent ? <Swords size={10} aria-label="Adversaire de lane" /> : <span className="w-2.5 text-center">-</span>}
                      </span>
                      <span className="text-txt-secondary truncate">{d.opponent_name}</span>
                      <RoleIcon role={d.opponent_role} size={11} className="text-txt-muted shrink-0" />
                      <span className="ml-auto shrink-0">
                        <WinrateIndicator delta={d.delta} />
                      </span>
                      <span className="text-txt-muted text-[10px] shrink-0 w-10 text-right tabular-nums">
                        {d.win_rate.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rec.synergy_details?.length > 0 && (
              <div className="space-y-1.5">
                <div className="section-label">Synergies</div>
                <div className="space-y-0.5">
                  {rec.synergy_details.slice(0, 5).map((d, i) => (
                    <div key={i} className="flex items-center text-[11px] py-1 px-2 rounded-lg bg-surface-elevated/50 gap-1.5">
                      <span className="text-txt-muted shrink-0 w-2.5 text-center">-</span>
                      <span className="text-txt-secondary truncate">{d.ally_name}</span>
                      <RoleIcon role={d.ally_role} size={11} className="text-txt-muted shrink-0" />
                      <span className="ml-auto shrink-0">
                        <WinrateIndicator delta={d.delta} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {rec.composition_warnings?.length > 0 && (
            <div className="space-y-1.5">
              <div className="section-label">{"Points d'attention"}</div>
              <div className="space-y-0.5">
                {rec.composition_warnings.map((w, i) => (
                  <div
                    key={i}
                    className={`text-[11px] py-1.5 px-2 rounded-lg flex items-start gap-1.5 ${
                      w.severity === 'critical'
                        ? 'bg-red-500/8 text-red-400 border border-red-500/12'
                        : 'bg-amber-500/8 text-amber-400 border border-amber-500/12'
                    }`}
                  >
                    <span className="shrink-0 mt-px">!</span>
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
