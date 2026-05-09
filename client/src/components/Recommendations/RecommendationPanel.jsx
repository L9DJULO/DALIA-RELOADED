import React, { useMemo, useState } from 'react';
import { AlertTriangle, TrendingUp, Trophy, RefreshCw, ChevronDown, ChevronUp, Crosshair, Users } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import { getWinProbColor } from '../../lib/scores';
import { getDDragonChampUrl } from '../../lib/constants';

function Bar({ label, value, max = 100 }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontFamily: 'var(--f-display)', fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(value)}</span>
      </div>
      <div style={{ height: 4, background: 'var(--surface-overlay)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width 0.5s' }}/>
      </div>
    </div>
  );
}

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
};
function Tag({ tag }) {
  const m = TAG_META[tag];
  if (!m) return null;
  return <span style={{ padding: '2px 7px', fontFamily: 'var(--f-display)', fontSize: 9, letterSpacing: '0.12em', color: m.color, background: m.bg, border: `1px solid ${m.color}` }}>{m.label}</span>;
}

// META S must reflect a genuinely top-tier patch winner. The backend
// adds `meta-forte` when meta_score ≥ 75, but in case the data is
// inconsistent (low meta, weak winrate) we filter here so a B/C/D
// pick can never display META S.
const META_S_MIN_SCORE = 60;
function tagAllowed(tag, rec) {
  if (tag === 'off-meta') return false;
  if (tag === 'meta-forte') {
    const meta = rec?.breakdown?.meta ?? 0;
    return meta >= META_S_MIN_SCORE;
  }
  return true;
}

function RecommendationCard({ rec, rank, champData, isWildcard }) {
  const [open, setOpen] = useState(rank === 1);

  const matchupScore = rec.breakdown?.matchup ?? 50;
  const synergyScore = rec.breakdown?.synergy ?? 50;
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
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: matchupScore >= 60 ? 'var(--win)' : matchupScore < 45 ? 'var(--loss)' : 'var(--text-muted)', letterSpacing: '0.08em' }}>
              MU {Math.round(matchupScore)}
            </span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: synergyScore >= 60 ? 'var(--win)' : 'var(--text-muted)', letterSpacing: '0.08em' }}>
              SYN {Math.round(synergyScore)}
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
          <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 0.85, letterSpacing: '-0.04em' }}>{Math.round(rec.total_score)}</div>
          {rec.score_range && (
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, marginTop: 3, opacity: 0.7 }}>
              ±{Math.round((rec.score_range[1] - rec.score_range[0]) / 2)}
            </div>
          )}
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
                {Object.entries({ meta: 'Meta', matchup: 'Matchup', synergy: 'Synergy', composition: 'Comp', mastery: 'Maîtrise', draft_risk: 'Risque', ml_prediction: 'IA' }).map(([k, lbl]) => {
                  const v = rec.breakdown[k];
                  if (v == null) return null;
                  return <Bar key={k} label={lbl} value={v}/>;
                })}
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

export default function RecommendationPanel({ champions }) {
  const { recommendations, compSummary, warnings, winProbability, loading, error } = useDraftStore();
  const unavailableIds = useDraftStore(s => s.getAllUnavailableIds());

  const champMap = useMemo(() => { const m = {}; for (const c of champions) m[c.id] = c; return m; }, [champions]);
  const allRecs  = useMemo(() => recommendations.filter(r => !unavailableIds.has(r.champion_id)), [recommendations, unavailableIds]);

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

  return (
    <div style={{ padding: '14px 16px', overflowY: 'auto', height: '100%' }}>
      {warnings.length > 0 && (
        <div style={{ padding: '10px 14px', background: 'var(--warn-bg)', border: '2px solid var(--warn-border)', marginBottom: 12, display: 'flex', gap: 10 }}>
          <AlertTriangle size={15} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }}/>
          <div>{warnings.map((w,i) => <div key={i} style={{ fontFamily: 'var(--f-body)', fontSize: 12, color: 'var(--warn)' }}>{w}</div>)}</div>
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

      {allRecs.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 14, letterSpacing: '0.1em' }}>RECOMMANDATIONS</span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{allRecs.length} champion{allRecs.length > 1 ? 's' : ''}</span>
          </div>
          <div className="stagger-children">
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
