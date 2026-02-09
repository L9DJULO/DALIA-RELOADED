import React from 'react';
import { AlertTriangle, Sparkles, TrendingUp } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import RecommendationCard from './RecommendationCard';

export default function RecommendationPanel({ champions }) {
  const { recommendations, compSummary, warnings, loading, error } = useDraftStore();

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
            <div className="absolute inset-0 border-2 border-dalia-accent/20 rounded-full" />
            <div className="absolute inset-0 border-2 border-dalia-accent border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-sm text-dalia-text/80 font-medium">Analyse en cours…</div>
          <div className="text-[11px] text-dalia-muted/50 mt-1">Récupération des matchups & synergies</div>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="rounded-xl border border-dalia-red/20 bg-dalia-red/[0.04] backdrop-blur-sm p-6 max-w-sm text-center">
          <AlertTriangle size={24} className="text-dalia-red mx-auto mb-3" />
          <div className="text-sm text-dalia-red/90 font-medium">{error}</div>
          <div className="text-[11px] text-dalia-muted/50 mt-2">
            Vérifiez que le backend est démarré sur le port 8000.
          </div>
        </div>
      </div>
    );
  }

  /* ── Empty state ── */
  if (recommendations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-dalia-accent/10 to-dalia-accent/[0.02] border border-dalia-accent/10 flex items-center justify-center">
            <TrendingUp size={28} className="text-dalia-accent/60" />
          </div>
          <div className="text-lg font-display text-dalia-accent/90 mb-2 tracking-wide">Prêt à analyser</div>
          <div className="text-sm text-dalia-muted/70 leading-relaxed">
            Remplissez les bans et picks dans le draft board, puis cliquez sur
            <span className="text-dalia-accent font-medium"> « Analyser le draft »</span> pour obtenir
            les recommandations.
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 text-[11px] text-dalia-muted/40">
            <div className="rounded-lg border border-white/[0.04] p-2.5">
              <div className="text-base mb-1">💡</div>
              <div>Configurez votre pool</div>
            </div>
            <div className="rounded-lg border border-white/[0.04] p-2.5">
              <div className="text-base mb-1">⚔️</div>
              <div>Plus de picks = meilleure analyse</div>
            </div>
            <div className="rounded-lg border border-white/[0.04] p-2.5">
              <div className="text-base mb-1">🎯</div>
              <div>Meta, matchups, synergies, comp</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const poolRecs = recommendations.filter((r) => r.is_pool_champion);
  const wildcards = recommendations.filter((r) => !r.is_pool_champion);

  return (
    <div className="p-4 space-y-5">
      {/* Warnings banner */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-dalia-red/20 bg-dalia-red/[0.04] p-3 animate-fade-in-up">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="text-dalia-red/80 shrink-0 mt-0.5" />
            <div className="space-y-1">
              {warnings.map((w, i) => (
                <div key={i} className="text-xs text-dalia-red/80">{w}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comp summary */}
      {Object.keys(compSummary).length > 0 && (
        <div className="rounded-xl border border-dalia-border/30 bg-dalia-card/40 backdrop-blur-sm p-3 animate-fade-in-up">
          <div className="text-[11px] font-semibold text-dalia-muted/70 mb-2 uppercase tracking-wider">
            Résumé composition
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {Object.entries(compSummary).map(([key, val]) => {
              const label = key.replace('damage_', 'DMG ').replace('_', ' ');
              const pct = Math.round((val / 5) * 100);
              return (
                <div key={key} className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-dalia-muted/50 capitalize w-20 truncate">{label}</span>
                  <div className="w-14 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-dalia-accent/50 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <span className="text-dalia-text/60 w-5 text-right tabular-nums">{typeof val === 'number' ? val.toFixed(1) : val}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pool recommendations */}
      <div>
        <div className="text-sm font-semibold mb-3 flex items-center gap-2">
          <span className="text-dalia-text/90">Recommandations</span>
          <span className="text-[11px] text-dalia-muted/40 font-normal">
            {poolRecs.length} champion{poolRecs.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="space-y-2 stagger-children">
          {poolRecs.map((rec, i) => (
            <RecommendationCard key={rec.champion_id} rec={rec} rank={i + 1} champData={champMap[rec.champion_id]} />
          ))}
        </div>
      </div>

      {/* Wild-card suggestions */}
      {wildcards.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Sparkles size={14} className="text-dalia-purple/70" />
            <span className="text-dalia-text/90">Suggestions off-pool</span>
            <span className="text-[11px] text-dalia-muted/40 font-normal">Champions hors pool</span>
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
