import React from 'react';
import { AlertTriangle, TrendingUp, Trophy } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import RecommendationCard from './RecommendationCard';
import { getWinProbColor } from '../../lib/scores';

export default function RecommendationPanel({ champions }) {
  const { recommendations, compSummary, warnings, winProbability, loading, error } = useDraftStore();

  const champMap = React.useMemo(() => {
    const m = {};
    for (const c of champions) m[c.id] = c;
    return m;
  }, [champions]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="relative w-10 h-10 mx-auto mb-3">
            <div className="absolute inset-0 border-2 rounded-full" style={{ borderColor: 'var(--border-subtle)' }} />
            <div className="absolute inset-0 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Analyse en cours</div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Calcul des matchups et synergies…</div>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-5 max-w-xs text-center">
          <AlertTriangle size={24} className="text-red-400 mx-auto mb-2" aria-hidden="true" />
          <div className="text-sm text-red-400 font-medium mb-1">Erreur d'analyse</div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{error}</div>
        </div>
      </div>
    );
  }

  /* ── Empty state ── */
  if (recommendations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center max-w-xs">
          <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-surface-elevated flex items-center justify-center" style={{ border: '1px solid var(--border-subtle)' }}>
            <TrendingUp size={22} className="text-violet-500" aria-hidden="true" />
          </div>
          <div className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Prêt à analyser</div>
          <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Remplissez le draft puis cliquez sur <span className="text-violet-500 font-medium">Analyser</span>.
          </div>
        </div>
      </div>
    );
  }

  // Unified list: pool first, then wildcards, maintaining overall ranking
  const allRecs = recommendations;

  return (
    <div className="p-4 space-y-4">
      {/* Warnings banner */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 animate-fade-in-up">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              {warnings.map((w, i) => (
                <div key={i} className="text-sm text-amber-400">{w}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comp summary — only show when at least 2 champions (allies + candidate) */}
      {Object.keys(compSummary).length > 0 && (compSummary.team_size ?? 0) >= 2 && (
        <div className="rounded-lg border border-slate-700/50 bg-surface p-3 animate-fade-in-up">
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Équilibre compo
            </div>
            {winProbability != null && (
              <div className="flex items-center gap-1.5">
                <Trophy size={13} className={getWinProbColor(winProbability)} aria-hidden="true" />
                <span className={`text-sm font-bold tabular-nums ${getWinProbColor(winProbability)}`}>
                  {winProbability.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-500">win</span>
              </div>
            )}
          </div>

          {/* Damage distribution bar */}
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
                <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                  <span>Répartition dégâts</span>
                  <div className="flex gap-2.5">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-red-500 inline-block" /> AD {pPhys.toFixed(0)}%</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-blue-500 inline-block" /> AP {pMag.toFixed(0)}%</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-slate-300 inline-block" /> Brut {pTrue.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="h-3 bg-surface-elevated rounded-lg overflow-hidden flex" role="img" aria-label={`AD ${pPhys.toFixed(0)}%, AP ${pMag.toFixed(0)}%, Brut ${pTrue.toFixed(0)}%`}>
                  <div className="bg-red-500 transition-all duration-500" style={{ width: `${pPhys * scale}%` }} />
                  <div className="bg-blue-500 transition-all duration-500" style={{ width: `${pMag * scale}%` }} />
                  <div className="bg-slate-300 transition-all duration-500" style={{ width: `${pTrue * scale}%` }} />
                  {empty > 0 && (
                    <div className="bg-slate-700/50 transition-all duration-500 flex items-center justify-center" style={{ width: `${empty}%` }}>
                      <span className="text-[9px] text-slate-500">{5 - compSummary.team_size} slot{5 - compSummary.team_size > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Other stats */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {Object.entries(compSummary)
              .filter(([key]) => !key.startsWith('damage_') && key !== 'team_size')
              .map(([key, val]) => {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const pct = Math.round((val / 5) * 100);
                return (
                  <div key={key} className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-slate-500 w-20 truncate capitalize">{label}</span>
                    <div className="w-16 h-1 bg-surface-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-violet-500/60 transition-all"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className="text-slate-400 w-5 text-right tabular-nums text-[10px]">
                      {typeof val === 'number' ? val.toFixed(1) : val}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* All recommendations (unified) */}
      {allRecs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recommandations</span>
            <span className="text-[11px] text-slate-500">
              {allRecs.length} champion{allRecs.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1.5 stagger-children">
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
