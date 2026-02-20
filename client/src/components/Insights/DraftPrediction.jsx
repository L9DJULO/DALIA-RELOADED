/**
 * Draft Prediction — Live win probability from current draft state.
 * Shows the ML model's analysis of the ongoing draft with breakdown.
 */
import { useState, useEffect, useMemo } from 'react';
import { Sparkles, Trophy, Shield, Swords, Users, BarChart3, Loader2 } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import RoleIcon from '../RoleIcon';

const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion';

/* Win probability gauge */
function WinGauge({ probability }) {
  const pct = probability || 50;
  const color = pct >= 55 ? 'text-emerald-400' : pct >= 48 ? 'text-amber-400' : 'text-red-400';
  const barColor = pct >= 55 ? 'bg-emerald-500' : pct >= 48 ? 'bg-amber-500' : 'bg-red-500';
  const label = pct >= 55 ? 'Favorable' : pct >= 48 ? 'Équilibré' : 'Défavorable';

  return (
    <div className="panel p-6 text-center">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium mb-4">
        Probabilité de victoire
      </div>

      {/* Big percentage */}
      <div className={`text-5xl font-black tabular-nums ${color} mb-2`}>
        {pct.toFixed(1)}%
      </div>
      <div className={`text-sm font-medium ${color} mb-4`}>{label}</div>

      {/* Bar */}
      <div className="relative h-3 bg-surface-elevated rounded-full overflow-hidden mb-2">
        <div
          className={`absolute inset-y-0 left-0 ${barColor} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
        {/* Center marker */}
        <div className="absolute inset-y-0 left-1/2 w-0.5 bg-slate-400/30" />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

/* Team picks display */
function TeamDisplay({ picks, label, color, borderColor }) {
  const roles = ['top', 'jungle', 'mid', 'bot', 'support'];
  const safePicks = picks || {};
  const pickedCount = roles.filter((r) => safePicks[r]).length;

  return (
    <div className="panel p-3">
      <div className={`text-[10px] uppercase tracking-wider font-medium mb-2 ${color}`}>
        {label} ({pickedCount}/5)
      </div>
      <div className="flex gap-1.5">
        {roles.map((role) => {
          const champ = safePicks[role];
          return (
            <div key={role} className="flex flex-col items-center gap-1">
              {champ ? (
                <img
                  src={`${DDRAGON}/${champ.key}.png`}
                  alt={champ.name}
                  className={`w-10 h-10 rounded-lg border-2 ${borderColor}`}
                  loading="lazy"
                />
              ) : (
                <div className={`w-10 h-10 rounded-lg border-2 border-dashed ${borderColor} bg-surface-elevated/30 flex items-center justify-center`}>
                  <RoleIcon role={role} size={14} className="text-slate-600" />
                </div>
              )}
              <span className="text-[9px] text-slate-500 capitalize">{role}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Score factor row */
function FactorRow({ icon: Icon, label, value, maxValue = 100 }) {
  const pct = Math.min((value / maxValue) * 100, 100);
  const color = value >= 60 ? 'text-emerald-400' : value >= 45 ? 'text-amber-400' : 'text-red-400';
  const barColor = value >= 60 ? 'bg-emerald-500' : value >= 45 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-3">
      <Icon size={14} className="text-slate-400 shrink-0" />
      <span className="text-xs text-slate-400 w-24">{label}</span>
      <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-bold tabular-nums w-8 text-right ${color}`}>
        {value.toFixed(0)}
      </span>
    </div>
  );
}

export default function DraftPrediction() {
  const rawState = useDraftStore();
  const allyPicks = rawState.allyPicks || {};
  const enemyPicks = rawState.enemyPicks || [];
  const myTeam = rawState.myTeam || 'blue';
  const myRole = rawState.myRole || 'mid';
  const recommendations = rawState.recommendations || [];
  const compSummary = rawState.compSummary || {};
  const winProbability = rawState.winProbability;
  const warnings = rawState.warnings || [];

  // Count total picks
  const totalPicks = useMemo(() => {
    let count = 0;
    for (const c of Object.values(allyPicks || {})) if (c) count++;
    for (const c of (enemyPicks || [])) if (c) count++;
    return count;
  }, [allyPicks, enemyPicks]);

  // Convert enemyPicks (ordered array) to a role-keyed object for display
  const enemyPicksDisplay = useMemo(() => {
    const roles = ['top', 'jungle', 'mid', 'bot', 'support'];
    const result = { top: null, jungle: null, mid: null, bot: null, support: null };
    (enemyPicks || []).forEach((pick, i) => {
      if (pick && i < 5) result[roles[i]] = pick;
    });
    return result;
  }, [enemyPicks]);

  // Get top recommendation data for breakdown
  const topRec = recommendations.length > 0 ? recommendations[0] : null;

  // No draft data
  if (totalPicks === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-16 h-16 rounded-xl bg-surface border border-slate-700/50 flex items-center justify-center mb-4">
          <Sparkles size={28} className="text-slate-500" />
        </div>
        <div className="text-sm font-medium text-slate-300 mb-1">Aucun draft en cours</div>
        <div className="text-xs text-slate-500 text-center max-w-xs">
          Commencez un draft dans l'onglet Draft, puis revenez ici pour voir
          l'analyse IA en temps réel.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Win probability gauge */}
      {winProbability != null ? (
        <WinGauge probability={winProbability} />
      ) : (
        <div className="panel p-6 text-center">
          <Sparkles size={24} className="text-violet-400 mx-auto mb-2" />
          <div className="text-sm text-slate-300 font-medium mb-1">
            Analyse en attente
          </div>
          <div className="text-xs text-slate-500">
            Cliquez sur "Analyser" dans le draft pour obtenir la prédiction IA.
          </div>
        </div>
      )}

      {/* Team compositions */}
      <div className="grid grid-cols-2 gap-3">
        <TeamDisplay
          picks={allyPicks || {}}
          label="Ton équipe"
          color="text-sky-400"
          borderColor="border-sky-500/30"
        />
        <TeamDisplay
          picks={enemyPicksDisplay}
          label="Équipe adverse"
          color="text-red-400"
          borderColor="border-red-500/30"
        />
      </div>

      {/* Composition summary */}
      {compSummary && typeof compSummary === 'object' && Object.keys(compSummary).length > 0 && (
        <div className="panel p-4 space-y-3">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">
            Analyse de la composition
          </div>

          {/* Damage distribution */}
          {(compSummary.damage_physical != null || compSummary.damage_magical != null) && (() => {
            const phys = compSummary.damage_physical || 0;
            const mag = compSummary.damage_magical || 0;
            const trueDmg = compSummary.damage_true || 0;
            const total = phys + mag + trueDmg || 1;
            return (
              <div>
                <div className="text-[10px] text-slate-500 mb-1">Répartition des dégâts</div>
                <div className="h-3 rounded-lg overflow-hidden flex">
                  <div className="bg-red-500 transition-all" style={{ width: `${(phys / total) * 100}%` }} />
                  <div className="bg-blue-500 transition-all" style={{ width: `${(mag / total) * 100}%` }} />
                  <div className="bg-slate-300 transition-all" style={{ width: `${(trueDmg / total) * 100}%` }} />
                </div>
                <div className="flex gap-3 mt-1 text-[10px]">
                  <span className="flex items-center gap-1 text-red-400">
                    <span className="w-1.5 h-1.5 rounded-sm bg-red-500" /> AD {((phys / total) * 100).toFixed(0)}%
                  </span>
                  <span className="flex items-center gap-1 text-blue-400">
                    <span className="w-1.5 h-1.5 rounded-sm bg-blue-500" /> AP {((mag / total) * 100).toFixed(0)}%
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-sm bg-slate-300" /> Brut {((trueDmg / total) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Team attributes */}
          <div className="space-y-2">
            {Object.entries(compSummary)
              .filter(([key]) => !key.startsWith('damage_') && key !== 'team_size')
              .map(([key, val]) => {
                const icons = {
                  frontline: Shield,
                  cc: Swords,
                  engage: TrendingUp,
                  carry: Trophy,
                  peel: Users,
                };
                const Icon = icons[key] || BarChart3;
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                return (
                  <FactorRow key={key} icon={Icon} label={label} value={typeof val === 'number' ? val * 20 : 50} />
                );
              })}
          </div>
        </div>
      )}

      {/* Warnings */}
      {Array.isArray(warnings) && warnings.length > 0 && (
        <div className="panel p-3 border-violet-500/20 bg-violet-500/5">
          <div className="text-[10px] text-violet-400 uppercase tracking-wider font-medium mb-2">
            Points d'attention
          </div>
          <div className="space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="text-xs text-violet-400 flex items-start gap-1.5">
                <span className="mt-0.5">⚠</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top recommendation breakdown */}
      {topRec?.breakdown && (
        <div className="panel p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">
              Meilleure recommandation
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <img
                src={`${DDRAGON}/${topRec.champion_key}.png`}
                alt={topRec.champion_name}
                className="w-6 h-6 rounded-md border border-violet-500/30"
                loading="lazy"
              />
              <span className="text-sm font-semibold text-violet-400">{topRec.champion_name}</span>
              <span className="text-sm font-bold tabular-nums text-slate-200">
                {topRec.total_score.toFixed(0)} pts
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {topRec.breakdown.meta != null && (
              <FactorRow icon={BarChart3} label="Meta" value={topRec.breakdown.meta} />
            )}
            {topRec.breakdown.matchup != null && (
              <FactorRow icon={Swords} label="Matchups" value={topRec.breakdown.matchup} />
            )}
            {topRec.breakdown.synergy != null && (
              <FactorRow icon={Users} label="Synergies" value={topRec.breakdown.synergy} />
            )}
            {topRec.breakdown.composition != null && (
              <FactorRow icon={Shield} label="Composition" value={topRec.breakdown.composition} />
            )}
            {topRec.breakdown.mastery != null && (
              <FactorRow icon={Trophy} label="Maîtrise" value={topRec.breakdown.mastery} />
            )}
            {topRec.breakdown.ml_prediction != null && (
              <FactorRow icon={Sparkles} label="IA Draft" value={topRec.breakdown.ml_prediction} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
