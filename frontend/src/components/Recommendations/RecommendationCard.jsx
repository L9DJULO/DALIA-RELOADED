import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, Shield, Swords, Sparkles } from 'lucide-react';
import ScoreBreakdown from './ScoreBreakdown';

const TAG_STYLES = {
  'safe-blind':       'tag-green',
  'counter-pick':     'tag-red',
  'flex':             'tag-blue',
  'off-meta':         'tag-purple',
  'last-pick-counter':'tag-gold',
  'meta-forte':       'tag-gold',
};

const TAG_LABELS = {
  'safe-blind':       'Safe Blind',
  'counter-pick':     'Counter',
  'flex':             'Flex',
  'off-meta':         'Off-meta',
  'last-pick-counter':'Last Pick',
  'meta-forte':       'Méta',
};

/* ── Circular SVG score gauge ── */
function ScoreGauge({ value, size = 58 }) {
  const strokeW = 3.5;
  const radius = (size - strokeW * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, value)) / 100;
  const offset = circumference * (1 - progress);
  const color =
    value >= 70 ? '#2dbd6e' :
    value >= 50 ? '#c8aa6e' :
    value >= 35 ? '#f59e0b' : '#c24b4b';
  const glow =
    value >= 70 ? 'rgba(45,189,110,0.25)' :
    value >= 50 ? 'rgba(200,170,110,0.2)' :
    value >= 35 ? 'rgba(245,158,11,0.2)' : 'rgba(194,75,75,0.2)';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={radius}
          stroke="#1e293b" strokeWidth={strokeW} fill="none" />
        <circle cx={size/2} cy={size/2} r={radius}
          stroke={color} strokeWidth={strokeW} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
          style={{ filter: `drop-shadow(0 0 4px ${glow})` }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-bold text-base tabular-nums" style={{ color }}>
          {value.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

/* ── Delta badge ── */
function DeltaBadge({ value, suffix = '%' }) {
  const pos = value > 0.05;
  const neg = value < -0.05;
  return (
    <span className={`font-mono text-xs tabular-nums ${pos ? 'text-dalia-green' : neg ? 'text-dalia-red' : 'text-dalia-muted'}`}>
      {pos ? '+' : ''}{value.toFixed(1)}{suffix}
    </span>
  );
}

export default function RecommendationCard({ rec, rank, champData, isWildcard = false }) {
  const [expanded, setExpanded] = useState(false);

  const borderClass =
    rank === 1 && !isWildcard ? 'border-dalia-accent/30 glow-accent' :
    isWildcard ? 'border-dalia-purple/20' : 'border-dalia-border/40';
  const bgClass =
    rank === 1 && !isWildcard ? 'bg-gradient-to-r from-dalia-accent/[0.06] to-dalia-card/80' :
    isWildcard ? 'bg-gradient-to-r from-dalia-purple/[0.04] to-dalia-card/80' : 'bg-dalia-card/60';

  return (
    <div className={`rounded-xl border backdrop-blur-sm p-3 transition-all duration-200 hover:border-dalia-accent/30 ${borderClass} ${bgClass}`}>
      <div className="flex items-center gap-3">
        {/* Rank */}
        <div className={`w-6 text-center font-bold text-sm ${
          rank === 1 ? 'text-dalia-accent' : rank <= 3 ? 'text-dalia-text/70' : 'text-dalia-muted/50'
        }`}>{rank}</div>

        {/* Champion portrait */}
        <div className="relative">
          <div className={`w-12 h-12 rounded-lg overflow-hidden border ${
            rank === 1 && !isWildcard ? 'border-dalia-accent/40' : 'border-dalia-border/40'
          }`}>
            <img src={champData?.image_url || ''} alt={rec.champion_name}
              className="w-full h-full object-cover" />
          </div>
          {isWildcard && (
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-dalia-purple flex items-center justify-center">
              <Sparkles size={9} className="text-white" />
            </div>
          )}
        </div>

        {/* Name + Tags + mini indicators */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm">{rec.champion_name}</span>
            {rec.tags?.map((t) => (
              <span key={t} className={`tag ${TAG_STYLES[t] || 'tag-gold'}`}>
                {TAG_LABELS[t] || t}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-dalia-muted/60">
              Confiance {rec.confidence?.toFixed(0) || '?'}%
            </span>
            <div className="flex items-center gap-1.5">
              {[
                { key: 'matchup', icon: '⚔' },
                { key: 'composition', icon: '📐' },
                { key: 'draft_risk', icon: '🎲' },
              ].map(({ key, icon }) => {
                const v = rec.breakdown?.[key] ?? 50;
                const c = v >= 65 ? 'text-dalia-green' : v >= 45 ? 'text-dalia-muted' : 'text-dalia-red';
                return <span key={key} className={`text-[10px] ${c}`} title={key}>{icon}{v.toFixed(0)}</span>;
              })}
            </div>
          </div>
        </div>

        {/* Score gauge */}
        <ScoreGauge value={rec.total_score} />

        {/* Expand */}
        <button onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded-lg hover:bg-white/[0.05] text-dalia-muted hover:text-dalia-text transition-colors">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* ── Expanded details ── */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-4 animate-fade-in-up">
          <ScoreBreakdown breakdown={rec.breakdown} />

          {/* Matchups */}
          {rec.matchup_details?.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-dalia-muted/80 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                <Swords size={11} /> Matchups
              </div>
              <div className="space-y-1">
                {rec.matchup_details.map((d, i) => (
                  <div key={i} className={`flex items-center text-xs gap-2 py-0.5 ${
                    d.is_lane_opponent ? 'bg-white/[0.02] rounded-md px-1.5 -mx-1.5' : ''
                  }`}>
                    <span className={`w-5 text-center ${d.is_lane_opponent ? 'text-dalia-accent' : 'text-dalia-muted/40'}`}>
                      {d.is_lane_opponent ? '⚔️' : '•'}
                    </span>
                    <span className="w-20 truncate text-dalia-text/80">{d.opponent_name}</span>
                    <span className="text-dalia-muted/50 w-12 text-[10px]">{d.opponent_role}</span>
                    <DeltaBadge value={d.delta} />
                    <span className="text-dalia-muted/40 text-[10px]">({d.win_rate.toFixed(1)}% WR)</span>
                    {d.games === 0 && <span className="text-[9px] text-dalia-muted/30 italic">estimé</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Synergies */}
          {rec.synergy_details?.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-dalia-muted/80 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                <Shield size={11} /> Synergies
              </div>
              <div className="space-y-1">
                {rec.synergy_details.map((d, i) => (
                  <div key={i} className="flex items-center text-xs gap-2 py-0.5">
                    <span className="text-dalia-muted/40 w-5 text-center">•</span>
                    <span className="w-20 truncate text-dalia-text/80">{d.ally_name}</span>
                    <span className="text-dalia-muted/50 w-12 text-[10px]">{d.ally_role}</span>
                    <DeltaBadge value={d.delta} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Composition warnings */}
          {rec.composition_warnings?.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-dalia-muted/80 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                <AlertTriangle size={11} /> Alertes
              </div>
              <div className="space-y-1.5">
                {rec.composition_warnings.map((w, i) => (
                  <div key={i} className={`text-xs flex items-start gap-2 ${
                    w.severity === 'critical' ? 'text-dalia-red/90' : 'text-orange-400/80'
                  }`}>
                    <AlertTriangle size={11} className="shrink-0 mt-0.5" />
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
