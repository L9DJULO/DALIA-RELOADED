import React from 'react';
import { AlertTriangle, TrendingUp, Lightbulb, Swords, BarChart3, Trophy } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import RecommendationCard from './RecommendationCard';

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
          <div className="relative w-12 h-12 mx-auto mb-4">
            <div className="absolute inset-0 border-2 border-slate-700 rounded-full" />
            <div className="absolute inset-0 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-sm text-slate-300 font-medium">Analyse en cours</div>
          <div className="text-xs text-slate-500 mt-1">Calcul des matchups et synergies...</div>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 max-w-sm text-center">
          <AlertTriangle size={28} className="text-red-400 mx-auto mb-3" />
          <div className="text-sm text-red-400 font-medium mb-1">Erreur d'analyse</div>
          <div className="text-xs text-slate-500">{error}</div>
          <div className="text-xs text-slate-600 mt-3">
            Vérifiez que le backend est démarré sur le port 8000.
          </div>
        </div>
      </div>
    );
  }

  /* ── Empty state ── */
  if (recommendations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <TrendingUp size={28} className="text-amber-500" />
          </div>
          <div className="text-xl font-semibold text-white mb-2">Prêt à analyser</div>
          <div className="text-sm text-slate-400 leading-relaxed mb-6">
            Remplissez les picks dans le draft, puis cliquez sur
            <span className="text-amber-500 font-medium"> Analyser le draft</span> pour obtenir
            les meilleures recommandations.
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <Lightbulb size={18} className="text-amber-500 mx-auto mb-2" />
              <div className="text-slate-400">Configurez votre pool de champions</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <Swords size={18} className="text-amber-500 mx-auto mb-2" />
              <div className="text-slate-400">Plus de picks = meilleure analyse</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <BarChart3 size={18} className="text-amber-500 mx-auto mb-2" />
              <div className="text-slate-400">Données Master+ actualisées</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const poolRecs = recommendations.filter((r) => r.is_pool_champion);
  const wildcards = recommendations.filter((r) => !r.is_pool_champion);

  return (
    <div className="p-5 space-y-5">
      {/* Warnings banner */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 animate-fade-in-up">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              {warnings.map((w, i) => (
                <div key={i} className="text-sm text-amber-400">{w}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comp summary */}
      {Object.keys(compSummary).length > 0 && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4 animate-fade-in-up">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Équilibre de la composition
            </div>
            {winProbability != null && (
              <div className="flex items-center gap-1.5">
                <Trophy size={14} className={winProbability >= 52 ? 'text-emerald-400' : winProbability >= 48 ? 'text-amber-400' : 'text-red-400'} />
                <span className={`text-sm font-bold tabular-nums ${
                  winProbability >= 52 ? 'text-emerald-400' : winProbability >= 48 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {winProbability.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-500">win (IA)</span>
              </div>
            )}
          </div>

          {/* Stacked damage distribution bar */}
          {(compSummary.damage_physical != null || compSummary.damage_magical != null) && (() => {
            const phys = compSummary.damage_physical || 0;
            const mag = compSummary.damage_magical || 0;
            const trueDmg = compSummary.damage_true || 0;
            const total = phys + mag + trueDmg || 1;
            const pPhys = (phys / total) * 100;
            const pMag = (mag / total) * 100;
            const pTrue = (trueDmg / total) * 100;
            const empty = compSummary.team_size < 5 ? ((5 - compSummary.team_size) / 5) * 100 : 0;
            // Scale filled portion
            const scale = (100 - empty) / 100;
            return (
              <div className="mb-4">
                <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
                  <span>Répartition des dégâts</span>
                  <div className="flex gap-3">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" /> AD {(pPhys).toFixed(0)}%</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" /> AP {(pMag).toFixed(0)}%</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-300 inline-block" /> Brut {(pTrue).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="h-4 bg-slate-800 rounded-full overflow-hidden flex">
                  <div className="bg-red-500 transition-all duration-500" style={{ width: `${pPhys * scale}%` }} title={`AD: ${pPhys.toFixed(1)}%`} />
                  <div className="bg-blue-500 transition-all duration-500" style={{ width: `${pMag * scale}%` }} title={`AP: ${pMag.toFixed(1)}%`} />
                  <div className="bg-slate-300 transition-all duration-500" style={{ width: `${pTrue * scale}%` }} title={`Brut: ${pTrue.toFixed(1)}%`} />
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
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {Object.entries(compSummary)
              .filter(([key]) => !key.startsWith('damage_') && key !== 'team_size')
              .map(([key, val]) => {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const pct = Math.round((val / 5) * 100);
                return (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 w-24 truncate capitalize">{label}</span>
                    <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-amber-500/70 transition-all" 
                        style={{ width: `${Math.min(pct, 100)}%` }} 
                      />
                    </div>
                    <span className="text-slate-400 w-6 text-right tabular-nums">
                      {typeof val === 'number' ? val.toFixed(1) : val}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Pool recommendations */}
      {poolRecs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-white">Recommandations</span>
            <span className="text-xs text-slate-500">
              {poolRecs.length} champion{poolRecs.length > 1 ? 's' : ''} de votre pool
            </span>
          </div>
          <div className="space-y-2 stagger-children">
            {poolRecs.map((rec, i) => (
              <RecommendationCard key={rec.champion_id} rec={rec} rank={i + 1} champData={champMap[rec.champion_id]} />
            ))}
          </div>
        </div>
      )}

      {/* Wild-card suggestions */}
      {wildcards.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-white">Autres suggestions</span>
            <span className="text-xs text-slate-500">Champions hors de votre pool</span>
          </div>
          <div className="space-y-2 stagger-children">
            {wildcards.map((rec, i) => (
              <RecommendationCard key={rec.champion_id} rec={rec} rank={i + 1} champData={champMap[rec.champion_id]} isWildcard />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
