import { BarChart3, Swords, Users, LayoutGrid, Star, Dice6, Brain, HelpCircle } from 'lucide-react';
import { getScoreClasses } from '../../lib/scores';

const SCORE_LABELS = {
  meta:        { label: 'Meta',        Icon: BarChart3, tip: 'Force dans le patch actuel (WPA, pickrate, banrate Master+)' },
  matchup:     { label: 'Matchups',    Icon: Swords, tip: "Perf vs ennemis reveles -- x3 pour l'adversaire direct" },
  synergy:     { label: 'Synergies',   Icon: Users, tip: 'Synergie avec les allies selectionnes' },
  composition: { label: 'Composition', Icon: LayoutGrid, tip: 'Equilibre compo : AD/AP, tank, CC, engage, peel' },
  mastery:     { label: 'Maitrise',    Icon: Star, tip: 'Votre tier sur ce champion dans votre pool' },
  draft_risk:  { label: 'Risque draft',Icon: Dice6, tip: 'Securite du pick : counters disponibles, risque de blind' },
  ml_prediction: { label: 'IA Draft', Icon: Brain, tip: "Prediction IA entrainee sur des milliers de parties Master+" },
};

function InfoTooltip({ text }) {
  return (
    <span className="relative group/tip ml-0.5 inline-flex">
      <HelpCircle size={10} className="text-txt-muted hover:text-txt-secondary cursor-help transition-colors" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                        w-48 px-2.5 py-1.5 rounded-xl bg-surface-overlay border border-border
                        text-[10px] text-txt-primary leading-relaxed shadow-xl
                        opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50"
            role="tooltip"
      >
        {text}
      </span>
    </span>
  );
}

function MLExplanationPanel({ explanation }) {
  if (!explanation) return null;

  const confColors = {
    high: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/15',
    low: 'bg-red-500/10 text-red-400 border-red-500/15',
  };
  const confLabels = { high: 'Fiable', medium: 'Moyenne', low: 'Faible' };

  const conf = confColors[explanation.confidence] || confColors.low;
  const confLabel = confLabels[explanation.confidence] || 'Faible';
  const wp = (explanation.win_probability * 100).toFixed(1);

  return (
    <div className="mt-2.5 p-3 rounded-xl bg-surface-elevated/60 border border-border-subtle">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-medium text-txt-secondary flex items-center gap-1">
          <Brain size={11} aria-hidden="true" /> Analyse IA
        </span>
        <span className={`text-[9px] px-1.5 py-px rounded-md border font-medium ${conf}`}>
          {confLabel}
        </span>
        <span className="text-[10px] text-txt-muted ml-auto tabular-nums">
          P(win) = {wp}%
        </span>
      </div>
      {explanation.reasons?.length > 0 && (
        <ul className="space-y-0.5">
          {explanation.reasons.map((reason, i) => (
            <li key={i} className="text-[10px] text-txt-secondary flex items-start gap-1.5">
              <span className="text-txt-muted mt-px shrink-0">{'>'}</span>
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
      <div className="section-label mb-2.5">Detail des scores</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {Object.entries(SCORE_LABELS).map(([key, { label, Icon, tip }]) => {
          const val = breakdown[key];
          if (val == null) return null;
          const colors = getScoreClasses(val);
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-txt-muted flex items-center gap-1">
                  <Icon size={10} aria-hidden="true" />
                  <span>{label}</span>
                  <InfoTooltip text={tip} />
                </span>
                <span className={`text-[11px] font-bold tabular-nums ${colors.text}`}>
                  {val.toFixed(0)}
                </span>
              </div>
              <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
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
