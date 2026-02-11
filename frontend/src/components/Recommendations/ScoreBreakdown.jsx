import React from 'react';
import { BarChart3, Swords, Users, LayoutGrid, Star, Dice6, Brain } from 'lucide-react';

const SCORE_LABELS = {
  meta:        { label: 'Meta',        Icon: BarChart3, tip: 'Force du champion dans le patch actuel' },
  matchup:     { label: 'Matchups',    Icon: Swords, tip: 'Winrate contre les ennemis révélés' },
  synergy:     { label: 'Synergies',   Icon: Users, tip: 'Synergie avec les alliés' },
  composition: { label: 'Composition', Icon: LayoutGrid, tip: 'Équilibre AD/AP, tank, CC, engage' },
  mastery:     { label: 'Maîtrise',    Icon: Star, tip: 'Votre tier personnel sur ce champion' },
  draft_risk:  { label: 'Risque draft',Icon: Dice6, tip: "Sécurité du pick (counter dispo, blind pick…)" },
  ml_prediction: { label: 'IA Draft', Icon: Brain, tip: 'Prédiction du modèle ML' },
};

function barColor(val) {
  if (val >= 70) return 'bg-emerald-500';
  if (val >= 55) return 'bg-amber-500';
  if (val >= 40) return 'bg-slate-500';
  return 'bg-red-500';
}

function textColor(val) {
  if (val >= 70) return 'text-emerald-400';
  if (val >= 55) return 'text-amber-400';
  if (val >= 40) return 'text-slate-400';
  return 'text-red-400';
}

/* ── ML Explanation panel ── */
function MLExplanationPanel({ explanation }) {
  if (!explanation) return null;
  
  const confColors = {
    high: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    low: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const confLabels = { high: 'Fiable', medium: 'Moyenne', low: 'Faible' };
  
  const conf = confColors[explanation.confidence] || confColors.low;
  const confLabel = confLabels[explanation.confidence] || 'Faible';
  const wp = (explanation.win_probability * 100).toFixed(1);

  return (
    <div className="mt-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
          <Brain size={12} /> Analyse IA
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${conf}`}>
          {confLabel}
        </span>
        <span className="text-[10px] text-slate-500 ml-auto">
          P(win) = {wp}%
        </span>
      </div>
      {explanation.reasons?.length > 0 && (
        <ul className="space-y-1">
          {explanation.reasons.map((reason, i) => (
            <li key={i} className="text-[11px] text-slate-400 flex items-start gap-1.5">
              <span className="text-slate-600 mt-px shrink-0">›</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ScoreBreakdown({ breakdown }) {
  if (!breakdown) return null;

  return (
    <div className="pt-2">
      <div className="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wider">
        Détail des scores
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
        {Object.entries(SCORE_LABELS).map(([key, { label, Icon, tip }]) => {
          const val = breakdown[key];
          if (val == null) return null;
          return (
            <div key={key} className="group" title={tip}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Icon size={12} />
                  <span>{label}</span>
                </span>
                <span className={`text-xs font-bold tabular-nums ${textColor(val)}`}>
                  {val.toFixed(0)}
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor(val)} transition-all duration-500 ease-out`}
                  style={{ width: `${Math.min(val, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ML Explanation */}
      <MLExplanationPanel explanation={breakdown.ml_explanation} />
    </div>
  );
}
