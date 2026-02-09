import React from 'react';

const SCORE_LABELS = {
  meta:        { label: 'Meta',        icon: '📊', tip: 'Force du champion dans le patch actuel' },
  matchup:     { label: 'Matchups',    icon: '⚔️', tip: 'Winrate contre les ennemis révélés' },
  synergy:     { label: 'Synergies',   icon: '🤝', tip: 'Synergie avec les alliés' },
  composition: { label: 'Composition', icon: '📐', tip: 'Équilibre AD/AP, tank, CC, engage' },
  mastery:     { label: 'Maîtrise',    icon: '⭐', tip: 'Votre tier personnel sur ce champion' },
  draft_risk:  { label: 'Risque draft',icon: '🎲', tip: "Sécurité du pick (counter dispo, blind pick…)" },
  ml_prediction: { label: 'IA Draft', icon: '🧠', tip: 'Prédiction du modèle ML entraîné sur 15K+ games D2+' },
};

function barGradient(val) {
  if (val >= 70) return 'from-emerald-500/80 to-emerald-400/60';
  if (val >= 50) return 'from-dalia-accent/80 to-amber-500/60';
  if (val >= 35) return 'from-orange-500/80 to-amber-400/60';
  return 'from-red-500/80 to-red-400/60';
}

function textColor(val) {
  if (val >= 70) return 'text-dalia-green';
  if (val >= 50) return 'text-dalia-accent';
  if (val >= 35) return 'text-orange-400';
  return 'text-dalia-red';
}

export default function ScoreBreakdown({ breakdown }) {
  if (!breakdown) return null;

  return (
    <div>
      <div className="text-[11px] font-semibold text-dalia-muted/80 mb-2.5 uppercase tracking-wider">
        Détail des scores
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-2">
        {Object.entries(SCORE_LABELS).map(([key, { label, icon, tip }]) => {
          const val = breakdown[key];
          if (val == null) return null;   // hide row if score absent (e.g. ML model not loaded)
          return (
            <div key={key} className="group" title={tip}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-dalia-muted/70 flex items-center gap-1">
                  <span>{icon}</span> {label}
                </span>
                <span className={`text-[11px] font-bold tabular-nums ${textColor(val)}`}>
                  {val.toFixed(0)}
                </span>
              </div>
              <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${barGradient(val)} transition-all duration-500 ease-out`}
                  style={{ width: `${Math.min(val, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
