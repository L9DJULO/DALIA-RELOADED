import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Users, Crosshair, Swords, HelpCircle, AlertTriangle } from 'lucide-react';
import ScoreBreakdown from './ScoreBreakdown';
import RoleIcon from '../RoleIcon';

/* ── Score color — smooth gradient: red → amber → sky → emerald ── */
function getScoreColor(v) {
  if (v >= 70) return { text: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30' };
  if (v >= 55) return { text: 'text-sky-400', bg: 'bg-sky-500/20', border: 'border-sky-500/30' };
  if (v >= 40) return { text: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/30' };
  return { text: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30' };
}

/* ── Score display ── */
function ScoreDisplay({ value, size = 'md' }) {
  const colors = getScoreColor(value);
  const sizeClasses = size === 'lg' 
    ? 'w-14 h-14 text-lg' 
    : 'w-11 h-11 text-sm';

  return (
    <div className={`${sizeClasses} rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center font-bold ${colors.text}`}>
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
      <HelpCircle size={10} className="text-slate-600 group-hover/conf:text-slate-400 cursor-help" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                        w-52 px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 
                        text-[11px] text-slate-200 leading-relaxed shadow-xl
                        opacity-0 group-hover/conf:opacity-100 transition-opacity z-50
                        before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2
                        before:border-4 before:border-transparent before:border-t-slate-700">
        <span className="font-medium">Fiabilité {level}</span> — mesure la quantité de données réelles (matchups, synergies, picks révélés) utilisées pour cette recommandation. Plus d'ennemis visibles = plus fiable.
      </span>
    </span>
  );
}

/* ── Winrate indicator ── */
function WinrateIndicator({ delta }) {
  if (Math.abs(delta) < 0.5) {
    return (
      <div className="flex items-center gap-1 text-slate-500 text-xs">
        <Minus size={12} />
        <span>Neutre</span>
      </div>
    );
  }
  
  const positive = delta > 0;
  return (
    <div className={`flex items-center gap-1 text-xs ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
      {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      <span>{positive ? '+' : ''}{delta.toFixed(1)}%</span>
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
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs ${colorClasses[color]}`}>
      <Icon size={12} />
      <span className="text-slate-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/* ── Format large numbers (e.g. 3400 → "3.4k", 125000 → "125k") ── */
function formatGames(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

/* ── Tag label mapping ── */
const TAG_STYLES = {
  'safe-blind':       { label: 'Safe blind', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  'counter-pick':     { label: 'Counter',    cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  'last-pick-counter':{ label: 'Last pick',  cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  'meta-forte':       { label: 'Meta S',     cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  'flex':             { label: 'Flex',        cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  'low-data':         { label: 'Peu de data', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export default function RecommendationCard({ rec, rank, champData, isWildcard = false }) {
  const [expanded, setExpanded] = useState(false);

  // Determine card style based on rank
  const getCardStyle = () => {
    if (rank === 1 && !isWildcard) {
      return 'bg-gradient-to-r from-amber-500/5 to-slate-900/80 border-amber-500/30 shadow-lg shadow-amber-500/5';
    }
    if (isWildcard) {
      return 'bg-slate-900/60 border-slate-700/50';
    }
    return 'bg-slate-900/60 border-slate-700/50 hover:border-slate-600';
  };

  // Calculate key metrics for display
  const matchupScore = rec.breakdown?.matchup ?? 50;
  const synergyScore = rec.breakdown?.synergy ?? 50;

  return (
    <div className={`rounded-xl border backdrop-blur-sm transition-all duration-200 ${getCardStyle()}`}>
      <div className="p-3">
        <div className="flex items-center gap-3">
          {/* Rank indicator */}
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm ${
            rank === 1 
              ? 'bg-amber-500/20 text-amber-400' 
              : rank <= 3 
                ? 'bg-slate-700/50 text-slate-300' 
                : 'bg-slate-800/50 text-slate-500'
          }`}>
            {rank}
          </div>

          {/* Champion portrait */}
          <div className="relative">
            <div className={`w-12 h-12 rounded-xl overflow-hidden border-2 ${
              rank === 1 && !isWildcard ? 'border-amber-500/40' : 'border-slate-700'
            }`}>
              <img 
                src={champData?.image_url || ''} 
                alt={rec.champion_name}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Champion info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{rec.champion_name}</span>
              {isWildcard && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700 text-slate-400 border border-slate-600">
                  Hors pool
                </span>
              )}
              {/* Tags */}
              {(rec.tags || []).filter(t => t !== 'off-meta').map(tag => {
                const s = TAG_STYLES[tag];
                if (!s) return null;
                return (
                  <span key={tag} className={`px-1.5 py-0.5 rounded text-[10px] border ${s.cls}`}>{s.label}</span>
                );
              })}
              {/* Game count indicator */}
              {rec.meta_games > 0 && (
                <span className={`text-[10px] ${rec.meta_games < 5000 ? 'text-red-400' : rec.meta_games < 15000 ? 'text-amber-400' : 'text-slate-500'}`}>
                  {formatGames(rec.meta_games)} games
                </span>
              )}
            </div>
            
            {/* Quick stats row */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <StatPill 
                icon={Crosshair} 
                label="Matchup" 
                value={`${matchupScore.toFixed(0)}`}
                color={matchupScore >= 60 ? 'emerald' : matchupScore >= 45 ? 'amber' : 'red'}
              />
              <StatPill 
                icon={Users} 
                label="Synergie" 
                value={`${synergyScore.toFixed(0)}`}
                color={synergyScore >= 60 ? 'emerald' : synergyScore >= 45 ? 'amber' : 'slate'}
              />
              {rec.confidence != null && (
                <ConfidenceTooltip value={rec.confidence} />
              )}
            </div>
          </div>

          {/* Main score */}
          <ScoreDisplay value={rec.total_score} size="lg" />

          {/* Expand button */}
          <button 
            onClick={() => setExpanded(!expanded)}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* ── Expanded details ── */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-700/50 space-y-4 animate-fade-in-up">
          <ScoreBreakdown breakdown={rec.breakdown} />

          {/* Matchups + Synergies side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Matchups details */}
            {rec.matchup_details?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Matchups <span className="text-slate-600 font-normal normal-case">(winrate vs ennemi)</span>
                </div>
                <div className="space-y-1">
                  {rec.matchup_details.slice(0, 5).map((d, i) => (
                    <div 
                      key={i} 
                      className={`flex items-center text-xs py-1.5 px-2 rounded-lg gap-1.5 ${
                        d.is_lane_opponent ? 'bg-slate-800/80' : 'bg-slate-800/30'
                      }`}
                    >
                      <span className={`shrink-0 flex justify-center ${d.is_lane_opponent ? 'text-amber-500' : 'text-slate-600'}`}>
                        {d.is_lane_opponent ? <Swords size={12} /> : '•'}
                      </span>
                      <span className="text-slate-300 truncate">{d.opponent_name}</span>
                      <RoleIcon role={d.opponent_role} size={13} className="text-slate-500 shrink-0" />
                      <span className="ml-auto shrink-0">
                        <WinrateIndicator delta={d.delta} />
                      </span>
                      <span className="text-slate-500 text-[10px] shrink-0 w-12 text-right tabular-nums">
                        {d.win_rate.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Synergies details */}
            {rec.synergy_details?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Synergies <span className="text-slate-600 font-normal normal-case">(delta winrate en duo)</span>
                </div>
                <div className="space-y-1">
                  {rec.synergy_details.slice(0, 5).map((d, i) => (
                    <div key={i} className="flex items-center text-xs py-1.5 px-2 rounded-lg bg-slate-800/30 gap-1.5">
                      <span className="text-slate-600 shrink-0">•</span>
                      <span className="text-slate-300 truncate">{d.ally_name}</span>
                      <RoleIcon role={d.ally_role} size={13} className="text-slate-500 shrink-0" />
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
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Points d'attention
              </div>
              <div className="space-y-1">
                {rec.composition_warnings.map((w, i) => (
                  <div 
                    key={i} 
                    className={`text-xs py-1.5 px-2 rounded-lg flex items-start gap-2 ${
                      w.severity === 'critical' 
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    <span className="shrink-0 mt-0.5">⚠</span>
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
