import React, { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Users, Crosshair, Swords } from 'lucide-react';
import ScoreBreakdown from './ScoreBreakdown';

/* ── Score display ── */
function ScoreDisplay({ value, size = 'md' }) {
  const getColor = (v) => {
    if (v >= 70) return { text: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30' };
    if (v >= 55) return { text: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/30' };
    if (v >= 40) return { text: 'text-slate-400', bg: 'bg-slate-500/20', border: 'border-slate-500/30' };
    return { text: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30' };
  };
  
  const colors = getColor(value);
  const sizeClasses = size === 'lg' 
    ? 'w-14 h-14 text-lg' 
    : 'w-11 h-11 text-sm';

  return (
    <div className={`${sizeClasses} rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center font-bold ${colors.text}`}>
      {value.toFixed(0)}
    </div>
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
              {rec.confidence && (
                <div className="text-[10px] text-slate-500">
                  {rec.confidence.toFixed(0)}% fiable
                </div>
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

          {/* Matchups details */}
          {rec.matchup_details?.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Matchups
              </div>
              <div className="space-y-1">
                {rec.matchup_details.slice(0, 5).map((d, i) => (
                  <div 
                    key={i} 
                    className={`flex items-center text-xs py-1.5 px-2 rounded-lg ${
                      d.is_lane_opponent ? 'bg-slate-800/80' : 'bg-slate-800/30'
                    }`}
                  >
                    <span className={`w-5 text-center flex justify-center ${d.is_lane_opponent ? 'text-amber-500' : 'text-slate-600'}`}>
                      {d.is_lane_opponent ? <Swords size={12} /> : '•'}
                    </span>
                    <span className="flex-1 text-slate-300">{d.opponent_name}</span>
                    <span className="text-slate-500 text-[10px] w-16">{d.opponent_role}</span>
                    <WinrateIndicator delta={d.delta} />
                    <span className="text-slate-500 text-[10px] ml-2 w-14 text-right">
                      {d.win_rate.toFixed(1)}% WR
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
                Synergies
              </div>
              <div className="space-y-1">
                {rec.synergy_details.slice(0, 4).map((d, i) => (
                  <div key={i} className="flex items-center text-xs py-1.5 px-2 rounded-lg bg-slate-800/30">
                    <span className="text-slate-600 w-5 text-center">•</span>
                    <span className="flex-1 text-slate-300">{d.ally_name}</span>
                    <span className="text-slate-500 text-[10px] w-16">{d.ally_role}</span>
                    <WinrateIndicator delta={d.delta} />
                  </div>
                ))}
              </div>
            </div>
          )}

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
