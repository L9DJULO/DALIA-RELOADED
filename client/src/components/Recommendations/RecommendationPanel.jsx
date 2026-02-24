import React, { useMemo } from 'react';
import { AlertTriangle, TrendingUp, Trophy } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import RecommendationCard from './RecommendationCard';
import { getWinProbColor } from '../../lib/scores';

export default function RecommendationPanel({ champions }) {
  const { recommendations, compSummary, warnings, winProbability, loading, error } = useDraftStore();
  const unavailableIds = useDraftStore((s) => s.getAllUnavailableIds());

  const champMap = React.useMemo(() => {
    const m = {};
    for (const c of champions) m[c.id] = c;
    return m;
  }, [champions]);

  // Must be called unconditionally (Rules of Hooks — no hook after early return)
  const allRecs = useMemo(
    () => recommendations.filter((r) => !unavailableIds.has(r.champion_id)),
    [recommendations, unavailableIds],
  );

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center animate-fade-in">
          <div className="relative w-12 h-12 mx-auto mb-4">
            <div className="absolute inset-0 border-2 rounded-full border-border-subtle" />
            <div className="absolute inset-0 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-sm font-semibold text-txt-primary">Analyse en cours</div>
          <div className="text-[11px] mt-1 text-txt-muted">Calcul des matchups et synergies...</div>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="glass-card p-6 max-w-xs text-center animate-fade-in-up">
          <AlertTriangle size={24} className="text-red-400 mx-auto mb-3" aria-hidden="true" />
          <div className="text-sm text-red-400 font-semibold mb-1">{"Erreur d'analyse"}</div>
          <div className="text-[11px] text-txt-muted">{error}</div>
        </div>
      </div>
    );
  }

  /* ── Empty ── */
  if (recommendations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center max-w-xs animate-fade-in">
          <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-surface-elevated border border-border-subtle flex items-center justify-center">
            <TrendingUp size={24} className="text-accent" aria-hidden="true" />
          </div>
          <div className="text-base font-bold mb-1.5 text-txt-primary">{"Pret a analyser"}</div>
          <div className="text-sm leading-relaxed text-txt-secondary">
            Remplissez le draft puis cliquez sur <span className="text-accent font-semibold">Analyser</span>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="glass-card p-3.5 border-amber-500/15 animate-fade-in-up">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              {warnings.map((w, i) => (
                <div key={i} className="text-sm text-amber-400">{w}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comp summary */}
      {Object.keys(compSummary).length > 0 && (compSummary.team_size ?? 0) >= 2 && (
        <div className="glass-card p-4 animate-fade-in-up">
          <div className="flex items-center justify-between mb-3">
            <div className="section-label">Equilibre compo</div>
            {winProbability != null && (
              <div className="flex items-center gap-1.5">
                <Trophy size={13} className={getWinProbColor(winProbability)} aria-hidden="true" />
                <span className={`text-sm font-bold tabular-nums ${getWinProbColor(winProbability)}`}>
                  {winProbability.toFixed(1)}%
                </span>
                <span className="text-[10px] text-txt-muted">win</span>
              </div>
            )}
          </div>

          {/* Damage bar */}
          {(compSummary.damage_physical != null || compSummary.damage_magical != null) && (() => {
            const phys = compSummary.damage_physical || 0;
            const mag = compSummary.damage_magical || 0;
            const trueDmg = compSummary.damage_true || 0;
            const total = phys + mag + trueDmg || 1;
            const pPhys = (phys / total) * 100;
            const pMag = (mag / total) * 100;
            const pTrue = (trueDmg / total) * 100;
            const empty = compSummary.team_size < 5 ? ((5 - compSummary.team_size) / 5) * 100 : 0;
            const scale = (100 - empty) / 100;
            return (
              <div className="mb-3">
                <div className="flex items-center justify-between text-[10px] text-txt-muted mb-1.5">
                  <span>Repartition degats</span>
                  <div className="flex gap-3">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-red-500 inline-block" /> AD {pPhys.toFixed(0)}%</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-blue-500 inline-block" /> AP {pMag.toFixed(0)}%</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-slate-300 inline-block" /> Brut {pTrue.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="h-2.5 bg-surface-elevated rounded-lg overflow-hidden flex" role="img" aria-label={`AD ${pPhys.toFixed(0)}%, AP ${pMag.toFixed(0)}%, Brut ${pTrue.toFixed(0)}%`}>
                  <div className="bg-red-500 transition-all duration-500" style={{ width: `${pPhys * scale}%` }} />
                  <div className="bg-blue-500 transition-all duration-500" style={{ width: `${pMag * scale}%` }} />
                  <div className="bg-slate-300 transition-all duration-500" style={{ width: `${pTrue * scale}%` }} />
                  {empty > 0 && (
                    <div className="bg-surface-overlay transition-all duration-500 flex items-center justify-center" style={{ width: `${empty}%` }}>
                      <span className="text-[8px] text-txt-muted">{5 - compSummary.team_size} slots</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Stats */}
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {Object.entries(compSummary)
              .filter(([key]) => !key.startsWith('damage_') && key !== 'team_size')
              .map(([key, val]) => {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const pct = Math.round((val / 5) * 100);
                return (
                  <div key={key} className="flex items-center gap-2 text-[11px]">
                    <span className="text-txt-muted w-20 truncate capitalize">{label}</span>
                    <div className="w-16 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent/50 transition-all"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className="text-txt-secondary w-5 text-right tabular-nums text-[10px]">
                      {typeof val === 'number' ? val.toFixed(1) : val}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {allRecs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-txt-primary">Recommandations</span>
            <span className="text-[11px] text-txt-muted">
              {allRecs.length} champion{allRecs.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2 stagger-children">
            {allRecs.map((rec, i) => (
              <RecommendationCard
                key={rec.champion_id}
                rec={rec}
                rank={i + 1}
                champData={champMap[rec.champion_id]}
                isWildcard={!rec.is_pool_champion}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
