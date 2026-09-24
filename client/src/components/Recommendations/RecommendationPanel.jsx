import React, { useMemo, useState } from 'react';
import { AlertTriangle, TrendingUp, Trophy, RefreshCw, ChevronDown, ChevronUp, Crosshair, Users } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import { advantageColor, formatAdvantage, formatSd } from '../../lib/scores';
import { TermBar } from '../Primitives';
import { getDDragonChampUrl } from '../../lib/constants';

function Delta({ value }) {
  if (Math.abs(value) < 0.5) return <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>≈</span>;
  const pos = value > 0;
  return (
    <span style={{ fontFamily: 'var(--f-mono)', fontWeight: 700, fontSize: 11, color: pos ? 'var(--win)' : 'var(--loss)', minWidth: 44, textAlign: 'right', display: 'inline-block' }}>
      {pos ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

const TAG_META = {
  'safe-blind':        { label: 'SAFE',      color: '#9cd36b', bg: 'rgba(156,211,107,0.10)' },
  'counter-pick':      { label: 'COUNTER',   color: 'var(--accent)', bg: 'var(--accent-muted)' },
  'last-pick-counter': { label: 'LAST PICK', color: 'var(--accent)', bg: 'var(--accent-muted)' },
  'meta-forte':        { label: 'META S',    color: 'var(--accent)', bg: 'var(--accent-muted)' },
  'flex':              { label: 'FLEX',       color: '#4ac8e8', bg: 'rgba(74,200,232,0.10)' },
  'low-data':          { label: 'PEU DATA',  color: 'var(--loss)', bg: 'var(--loss-bg)' },
  'risky-blind':       { label: 'BLIND RISQUÉ', color: 'var(--loss)', bg: 'var(--loss-bg)' },
  'comfort':           { label: 'CONFORT',  color: '#9cd36b', bg: 'rgba(156,211,107,0.10)' },
};
function Tag({ tag }) {
  const m = TAG_META[tag];
  if (!m) return null;
  return <span style={{ padding: '2px 7px', fontFamily: 'var(--f-display)', fontSize: 9, letterSpacing: '0.12em', color: m.color, background: m.bg, border: `1px solid ${m.color}` }}>{m.label}</span>;
}

// META S doit refléter un vrai gagnant du patch. Le serveur pose `meta-forte`
// à partir de +1,5 point de win rate rétréci, lu avant la pondération du signal
// méta (le terme affiché n'en garde qu'un quart) ; ce filtre évite qu'une donnée
// incohérente affiche META S sur une contribution méta négative.
function tagAllowed(tag, rec) {
  if (tag === 'off-meta') return false;
  if (tag === 'meta-forte') {
    const meta = rec?.breakdown?.meta ?? 0;
    return meta > 0;
  }
  return true;
}

function RecommendationCard({ rec, rank, champData, isWildcard }) {
  const [open, setOpen] = useState(rank === 1);

  const matchup = rec.breakdown?.matchup ?? 0;
  const synergy = rec.breakdown?.synergy ?? 0;
  const isBest = rank === 1 && !isWildcard;

  return (
    <div style={{
      background: isBest ? 'var(--surface-card)' : 'var(--surface-elevated)',
      border: `2px solid ${isBest ? 'var(--accent)' : 'var(--border-subtle)'}`,
      boxShadow: isBest ? '4px 4px 0 var(--accent)' : 'none',
      marginBottom: 8,
      transition: 'border-color 0.12s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <div style={{
          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 13,
          background: isBest ? 'var(--accent)' : 'var(--surface-overlay)',
          color: isBest ? '#000' : 'var(--text-muted)',
          flexShrink: 0,
        }}>{rank}</div>

        {champData && (
          <img
            src={champData.image_url || getDDragonChampUrl(champData.key)}
            alt={rec.champion_name}
            style={{ width: 48, height: 48, objectFit: 'cover', border: `2px solid ${isBest ? 'var(--accent)' : 'var(--border-subtle)'}`, flexShrink: 0 }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 15, letterSpacing: '0.04em' }}>{rec.champion_name}</span>
            {isWildcard && <span style={{ padding: '1px 6px', fontFamily: 'var(--f-display)', fontSize: 9, letterSpacing: '0.12em', background: 'var(--warn-bg)', color: 'var(--warn)', border: '1px solid var(--warn-border)' }}>SECRET</span>}
            {(rec.tags || []).filter(t => tagAllowed(t, rec)).map(t => <Tag key={t} tag={t}/>)}
            {rec.tie_with_leader && rank !== 1 && (
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--warn)', letterSpacing: '0.08em' }}>ÉQUIVALENT AU 1ER</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: advantageColor(matchup), letterSpacing: '0.08em' }}>
              MU {formatAdvantage(matchup)}
            </span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: advantageColor(synergy), letterSpacing: '0.08em' }}>
              SYN {formatAdvantage(synergy)}
            </span>
            {rec.confidence != null && (
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: rec.confidence >= 60 ? 'var(--win)' : rec.confidence >= 35 ? 'var(--warn)' : 'var(--loss)', letterSpacing: '0.08em' }}>
                {rec.confidence.toFixed(0)}% fiable
              </span>
            )}
          </div>
        </div>

        <div style={{
          background: isBest ? 'var(--accent)' : 'var(--surface-overlay)',
          color: isBest ? '#000' : 'var(--text-primary)',
          padding: '8px 14px',
          fontFamily: 'var(--f-display)',
          textAlign: 'center',
          flexShrink: 0,
          minWidth: 72,
          border: isBest ? '2px solid #f0ebe0' : '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 0.85, letterSpacing: '-0.04em' }}>{formatAdvantage(rec.total_score)}</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, marginTop: 3, opacity: 0.7 }}>
            {formatSd(rec.score_sd) || 'pts WR'}
          </div>
        </div>

        <button
          onClick={() => setOpen(v => !v)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex' }}
        >
          {open ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </button>
      </div>

      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border-subtle)', animation: 'fadeInUp 0.18s ease-out both' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 12 }}>
            {rec.matchup_details?.length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.18em', marginBottom: 8, paddingBottom: 3, borderBottom: '1.5px solid var(--accent)', textTransform: 'uppercase' }}>Matchups</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {rec.matchup_details.slice(0, 5).map((d, i) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '1fr auto auto',
                      gap: 8, alignItems: 'center',
                      padding: '4px 8px',
                      background: d.is_lane_opponent ? 'var(--accent-subtle)' : 'var(--surface-overlay)',
                      borderLeft: `2px solid ${d.is_lane_opponent ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      fontSize: 11,
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {d.is_lane_opponent && <Crosshair size={9} style={{ color: 'var(--accent)', flexShrink: 0 }}/>}
                        <span style={{ fontFamily: 'var(--f-body)' }}>{d.opponent_name}</span>
                        {d.opponent_role && (
                          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{d.opponent_role?.slice(0,3).toUpperCase()}</span>
                        )}
                      </span>
                      <Delta value={d.delta}/>
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' }}>
                        {d.win_rate ? d.win_rate.toFixed(1) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rec.synergy_details?.length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.18em', marginBottom: 8, paddingBottom: 3, borderBottom: '1.5px solid var(--accent)', textTransform: 'uppercase' }}>Synergies</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {rec.synergy_details.slice(0, 5).map((d, i) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '1fr auto',
                      gap: 8, alignItems: 'center',
                      padding: '4px 8px',
                      background: 'var(--surface-overlay)',
                      borderLeft: '2px solid var(--border-subtle)',
                      fontSize: 11,
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Users size={9} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
                        <span>{d.ally_name}</span>
                        {d.ally_role && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-muted)' }}>{d.ally_role?.slice(0,3).toUpperCase()}</span>}
                      </span>
                      <Delta value={d.delta}/>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {rec.breakdown && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.18em', marginBottom: 8, paddingBottom: 3, borderBottom: '1.5px solid var(--accent)', textTransform: 'uppercase' }}>Breakdown</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                {(rec.breakdown.terms || []).map(t => <TermBar key={t.name} term={t}/>)}
              </div>
            </div>
          )}

          {rec.composition_warnings?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {rec.composition_warnings.map((w, i) => (
                <div key={i} style={{
                  padding: '6px 10px', marginBottom: 4,
                  background: w.severity === 'critical' ? 'var(--loss-bg)' : 'var(--warn-bg)',
                  border: `1px solid ${w.severity === 'critical' ? 'var(--loss-border)' : 'var(--warn-border)'}`,
                  borderLeft: `3px solid ${w.severity === 'critical' ? 'var(--loss)' : 'var(--warn)'}`,
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                  fontFamily: 'var(--f-body)', fontSize: 11,
                  color: w.severity === 'critical' ? 'var(--loss)' : 'var(--warn)',
                }}>
                  <span style={{ flexShrink: 0 }}>!</span>
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WildcardMini({ rec, champData }) {
  const score = formatAdvantage(rec.total_score);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '6px 8px', marginBottom: 5,
      background: 'var(--surface-card)',
      border: '1px solid var(--warn-border)',
    }}>
      {champData && (
        <img
          src={champData.image_url || getDDragonChampUrl(champData.key)}
          alt={rec.champion_name}
          style={{ width: 32, height: 32, objectFit: 'cover', border: '1px solid var(--warn-border)', flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rec.champion_name}
        </div>
        {rec.matchup_details?.length > 0 && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
            MU {formatAdvantage(rec.breakdown?.matchup ?? 0)}
          </div>
        )}
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 18, color: 'var(--warn)', flexShrink: 0 }}>{score}</div>
    </div>
  );
}

export default function RecommendationPanel({ champions }) {
  const { recommendations, compSummary, warnings, winProbability, loading, error, banImpact } = useDraftStore();
  const unavailableIds = useDraftStore(s => s.getAllUnavailableIds());

  const champMap = useMemo(() => { const m = {}; for (const c of champions) m[c.id] = c; return m; }, [champions]);
  const allRecs      = useMemo(() => recommendations.filter(r => !unavailableIds.has(r.champion_id)), [recommendations, unavailableIds]);
  const poolRecs     = useMemo(() => allRecs.filter(r => r.is_pool_champion), [allRecs]);
  const wildcardRecs = useMemo(() => allRecs.filter(r => !r.is_pool_champion), [allRecs]);

  const SE = {
    lbl: { fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.18em', textTransform: 'uppercase', paddingBottom: 3, borderBottom: '1.5px solid var(--accent)', marginBottom: 8 },
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 48, height: 48, margin: '0 auto 14px' }}>
          <div style={{ position: 'absolute', inset: 0, border: '2px solid var(--border-subtle)', borderRadius: '50%' }}/>
          <div style={{ position: 'absolute', inset: 0, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: '0.12em', color: 'var(--text-primary)' }}>ANALYSE EN COURS</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 6, letterSpacing: '0.08em' }}>Calcul matchups · synergies · IA</div>
      </div>
    </div>
  );

  if (error) {
    const clearError = () => useDraftStore.setState({ error: null });
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 20 }}>
        <div style={{ background: 'var(--surface-card)', border: '2px solid var(--loss-border)', padding: 24, maxWidth: 340, textAlign: 'center' }}>
          <AlertTriangle size={22} style={{ color: 'var(--loss)', margin: '0 auto 12px' }}/>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: '0.1em', color: 'var(--loss)', marginBottom: 8 }}>ERREUR D'ANALYSE</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>{error}</div>
          <button onClick={clearError} className="btn-secondary" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, margin: '14px auto 0' }}>
            <RefreshCw size={11}/>FERMER
          </button>
        </div>
      </div>
    );
  }

  if (recommendations.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 280 }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-elevated)', border: '2px solid var(--border-subtle)' }}>
          <TrendingUp size={24} style={{ color: 'var(--accent)' }}/>
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 16, letterSpacing: '0.1em', marginBottom: 8 }}>PRÊT À ANALYSER</div>
        <div style={{ fontFamily: 'var(--f-body)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          Remplis le draft puis clique sur <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Analyser</span>.
        </div>
      </div>
    </div>
  );

  const hasWildcards = wildcardRecs.length > 0;
  const notableBans  = (banImpact || []).filter(b => b.is_lane_threat || b.helped_recommendations?.length > 0);

  const mainContent = (
    <div style={{ padding: '14px 16px', overflowY: 'auto', height: '100%' }}>
      {warnings.length > 0 && (
        <div style={{ padding: '10px 14px', background: 'var(--warn-bg)', border: '2px solid var(--warn-border)', marginBottom: 12, display: 'flex', gap: 10 }}>
          <AlertTriangle size={15} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }}/>
          <div>{warnings.map((w,i) => <div key={i} style={{ fontFamily: 'var(--f-body)', fontSize: 12, color: 'var(--warn)' }}>{w}</div>)}</div>
        </div>
      )}

      {notableBans.length > 0 && (
        <div style={{ padding: '8px 12px', background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)', marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.18em', marginBottom: 5 }}>BANS IMPACTANTS</div>
          {notableBans.map(b => (
            <div key={b.champion_id} style={{ fontFamily: 'var(--f-body)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>
              <span style={{ color: 'var(--win)', fontWeight: 700 }}>{b.champion_name} banni</span>
              {b.helped_recommendations.length > 0
                ? ` — lane plus libre pour ${b.helped_recommendations.join(', ')}`
                : ` — menace meta éliminée`}
            </div>
          ))}
        </div>
      )}

      {Object.keys(compSummary).length > 0 && (compSummary.team_size ?? 0) >= 2 && (
        <div style={{ background: 'var(--surface-card)', border: '2px solid var(--border-subtle)', padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={SE.lbl}>ÉQUILIBRE COMPO</div>
            {winProbability != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trophy size={12} style={{ color: winProbability >= 52 ? 'var(--win)' : winProbability <= 48 ? 'var(--loss)' : 'var(--warn)' }}/>
                <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 14, color: winProbability >= 52 ? 'var(--win)' : winProbability <= 48 ? 'var(--loss)' : 'var(--warn)' }}>
                  {winProbability.toFixed(1)}%
                </span>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>win</span>
              </div>
            )}
          </div>

          {(compSummary.damage_physical != null || compSummary.damage_magical != null) && (() => {
            const phys = compSummary.damage_physical || 0;
            const mag  = compSummary.damage_magical  || 0;
            const trueDmg = compSummary.damage_true  || 0;
            const total = phys + mag + trueDmg || 1;
            const pPhys = (phys / total) * 100;
            const pMag  = (mag  / total) * 100;
            const pTrue = (trueDmg / total) * 100;
            const empty = compSummary.team_size < 5 ? ((5 - compSummary.team_size) / 5) * 100 : 0;
            const scale = (100 - empty) / 100;
            return (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 5 }}>
                  <span>RÉPARTITION DÉGATS</span>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span><span style={{ display: 'inline-block', width: 6, height: 6, background: '#ef4444', marginRight: 4 }}/>AD {pPhys.toFixed(0)}%</span>
                    <span><span style={{ display: 'inline-block', width: 6, height: 6, background: '#3b82f6', marginRight: 4 }}/>AP {pMag.toFixed(0)}%</span>
                  </div>
                </div>
                <div style={{ height: 8, background: 'var(--surface-overlay)', border: '1px solid var(--border-subtle)', display: 'flex', overflow: 'hidden' }}>
                  <div style={{ background: '#ef4444', width: `${pPhys * scale}%`, transition: 'width 0.5s' }}/>
                  <div style={{ background: '#3b82f6', width: `${pMag  * scale}%`, transition: 'width 0.5s' }}/>
                  <div style={{ background: '#94a3b8', width: `${pTrue * scale}%`, transition: 'width 0.5s' }}/>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {poolRecs.length > 0 && (
        <div>
          {poolRecs.filter(r => r.tie_with_leader).length > 1 && (
            <div style={{ padding: '8px 12px', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', marginBottom: 10, fontFamily: 'var(--f-body)', fontSize: 11, color: 'var(--warn)' }}>
              {poolRecs.filter(r => r.tie_with_leader).length} options équivalentes : joue ton confort.
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 14, letterSpacing: '0.1em' }}>RECOMMANDATIONS</span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>points de win rate vs moyenne du pool</span>
          </div>
          <div className="stagger-children">
            {poolRecs.map((rec, i) => (
              <RecommendationCard
                key={rec.champion_id}
                rec={rec}
                rank={i + 1}
                champData={champMap[rec.champion_id]}
                isWildcard={false}
              />
            ))}
          </div>
        </div>
      )}

      {allRecs.length === 0 && recommendations.length > 0 && (
        <div style={{ padding: '20px 0', textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
          Tous les champions recommandés sont déjà sélectionnés.
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {mainContent}
      </div>

      {hasWildcards && (
        <div style={{
          width: 156, flexShrink: 0,
          borderLeft: '2px solid var(--warn-border)',
          background: 'var(--surface-elevated)',
          overflowY: 'auto',
          padding: '10px 8px',
        }}>
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--warn)',
            letterSpacing: '0.18em', marginBottom: 8,
            paddingBottom: 4, borderBottom: '1px solid var(--warn-border)',
          }}>HORS POOL</div>
          <div style={{ fontFamily: 'var(--f-body)', fontSize: 9, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
            Picks conseillés hors pool si besoin
          </div>
          {wildcardRecs.map(rec => (
            <WildcardMini key={rec.champion_id} rec={rec} champData={champMap[rec.champion_id]}/>
          ))}
        </div>
      )}
    </div>
  );
}
