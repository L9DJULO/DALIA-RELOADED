import { BarChart3, Swords, Users, LayoutGrid, Star, Dice6, Brain, HelpCircle } from 'lucide-react';
import { getScoreClasses } from '../../lib/scores';

const SCORE_LABELS = {
  meta:        { label: 'Meta',        Icon: BarChart3, tip: 'Force dans le patch actuel (winrate, pickrate, banrate Master+)' },
  matchup:     { label: 'Matchups',    Icon: Swords, tip: "Perf vs ennemis révélés — ×3 pour l'adversaire direct" },
  synergy:     { label: 'Synergies',   Icon: Users, tip: 'Winrate en duo avec les alliés sélectionnés' },
  composition: { label: 'Composition', Icon: LayoutGrid, tip: 'Équilibre compo : AD/AP, tank, CC, engage, peel' },
  mastery:     { label: 'Maîtrise',    Icon: Star, tip: 'Votre tier sur ce champion dans votre pool' },
  draft_risk:  { label: 'Risque draft',Icon: Dice6, tip: 'Sécurité du pick : counters disponibles, risque de blind' },
  ml_prediction: { label: 'IA Draft', Icon: Brain, tip: "Prédiction IA entraînée sur des milliers de parties Master+" },
};

/* ── Info tooltip ── */
function InfoTooltip({ text }) {
  return (
    <span className="relative group/tip ml-0.5 inline-flex">
      <HelpCircle size={10} className="text-slate-600 hover:text-slate-400 cursor-help transition-colors" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                        w-48 px-2.5 py-1.5 rounded-lg bg-slate-700 border border-slate-600
                        text-[10px] text-slate-200 leading-relaxed shadow-xl
                        opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50
                        before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2
                        before:border-4 before:border-transparent before:border-t-slate-700"
            role="tooltip"
      >
        {text}
      </span>
    </span>
  );
}

/* ── ML Explanation ── */
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
    <div className="mt-2 p-2.5 rounded-lg bg-surface-elevated/50 border border-slate-700/30">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
          <Brain size={11} aria-hidden="true" /> Analyse IA
        </span>
        <span className={`text-[9px] px-1 py-px rounded border font-medium ${conf}`}>
          {confLabel}
        </span>
        <span className="text-[10px] text-slate-500 ml-auto tabular-nums">
          P(win) = {wp}%
        </span>
      </div>
      {explanation.reasons?.length > 0 && (
        <ul className="space-y-0.5">
          {explanation.reasons.map((reason, i) => (
            <li key={i} className="text-[10px] text-slate-400 flex items-start gap-1">
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
    <div className="pt-1.5">
      <div className="text-[10px] font-medium text-slate-400 mb-2 uppercase tracking-wider">
        Détail des scores
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {Object.entries(SCORE_LABELS).map(([key, { label, Icon, tip }]) => {
          const val = breakdown[key];
          if (val == null) return null;
          const colors = getScoreClasses(val);
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Icon size={10} aria-hidden="true" />
                  <span>{label}</span>
                  <InfoTooltip text={tip} />
                </span>
                <span className={`text-[11px] font-bold tabular-nums ${colors.text}`}>
                  {val.toFixed(0)}
                </span>
              </div>
              <div className="h-1 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${colors.bar} transition-all duration-500 ease-out`}
                  style={{ width: `${Math.min(val, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <MLExplanationPanel explanation={breakdown.ml_explanation} />
    </div>
  );
}
