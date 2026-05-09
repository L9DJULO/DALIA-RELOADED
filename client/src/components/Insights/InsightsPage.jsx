import React, { useState, useEffect, useMemo } from 'react';
import { History, BarChart2, Trash2, RefreshCw, Trophy } from 'lucide-react';
import useHistoryStore from '../../stores/historyStore';
import { getDDragonChampUrl } from '../../lib/constants';

const RESULT_COLORS = {
  win:     { text: 'var(--win)',  bg: 'var(--win-bg)',  border: 'var(--win-border)' },
  loss:    { text: 'var(--loss)', bg: 'var(--loss-bg)', border: 'var(--loss-border)' },
  pending: { text: 'var(--text-muted)', bg: 'transparent', border: 'var(--border-subtle)' },
};

const SE_LBL = {
  fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--accent)',
  letterSpacing: '0.18em', textTransform: 'uppercase',
  paddingBottom: 4, borderBottom: '1.5px solid var(--accent)', marginBottom: 10,
};

/* ─── History Tab ─── */
function HistoryTab({ champions }) {
  const { entries, loading, error, loadHistory, updateResult, deleteEntry } = useHistoryStore();

  const champByKey = useMemo(() => {
    const m = {};
    for (const c of champions) m[c.key] = c;
    return m;
  }, [champions]);

  useEffect(() => { loadHistory(); }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 52 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, margin: '0 auto 12px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-muted)' }}>Chargement...</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ padding: 24, background: 'var(--loss-bg)', border: '2px solid var(--loss-border)' }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--loss)', marginBottom: 10 }}>{error}</div>
      <button onClick={loadHistory} className="btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <RefreshCw size={10}/> Réessayer
      </button>
    </div>
  );

  if (!entries.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 64 }}>
      <History size={32} style={{ color: 'var(--accent)', marginBottom: 14 }}/>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, letterSpacing: '0.1em', marginBottom: 8 }}>AUCUN HISTORIQUE</div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        Lance une analyse depuis le Draft Board pour commencer
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          {entries.length} DRAFT{entries.length !== 1 ? 'S' : ''}
        </span>
        <button onClick={loadHistory} className="btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={10}/> ACTUALISER
        </button>
      </div>

      {entries.map(entry => {
        const champ = entry.my_champion_key ? champByKey[entry.my_champion_key] : null;
        const res = entry.result || 'pending';
        const rc = RESULT_COLORS[res] || RESULT_COLORS.pending;
        return (
          <div key={entry.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', marginBottom: 6,
            background: 'var(--surface-card)',
            border: `2px solid ${rc.border}`,
            borderLeft: `4px solid ${rc.text}`,
          }}>
            {/* Champion portrait */}
            {champ ? (
              <img src={getDDragonChampUrl(champ.key)} alt={champ.name} style={{ width: 42, height: 42, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-subtle)' }}/>
            ) : (
              <div style={{ width: 42, height: 42, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>?</span>
              </div>
            )}

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 14, letterSpacing: '0.04em' }}>
                  {entry.my_champion_name || '—'}
                </span>
                {entry.my_role && (
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-muted)', padding: '1px 6px', border: '1px solid var(--border-subtle)', letterSpacing: '0.1em' }}>
                    {entry.my_role.toUpperCase()}
                  </span>
                )}
                {entry.my_team && (
                  <span style={{
                    fontFamily: 'var(--f-mono)', fontSize: 9, padding: '1px 6px', letterSpacing: '0.08em',
                    background: entry.my_team === 'blue' ? 'rgba(74,139,255,0.12)' : 'var(--accent-muted)',
                    color: entry.my_team === 'blue' ? '#4a8bff' : 'var(--accent)',
                    border: `1px solid ${entry.my_team === 'blue' ? 'rgba(74,139,255,0.3)' : 'var(--border-accent)'}`,
                  }}>
                    {entry.my_team.toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {entry.win_probability != null && <span>P(WIN) <span style={{ color: entry.win_probability >= 52 ? 'var(--win)' : entry.win_probability <= 48 ? 'var(--loss)' : 'var(--warn)' }}>{entry.win_probability.toFixed(1)}%</span></span>}
                {entry.recommendation_score != null && <span>SCORE {Math.round(entry.recommendation_score)}</span>}
                {entry.created_at && <span>{new Date(entry.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })}</span>}
              </div>
            </div>

            {/* Result buttons */}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {['win','loss'].map(r => {
                const isActive = entry.result === r;
                const c = r === 'win' ? 'var(--win)' : 'var(--loss)';
                const bg = r === 'win' ? 'var(--win-bg)' : 'var(--loss-bg)';
                const bd = r === 'win' ? 'var(--win-border)' : 'var(--loss-border)';
                return (
                  <button
                    key={r}
                    onClick={() => updateResult(entry.id, isActive ? null : r)}
                    style={{
                      padding: '4px 10px',
                      fontFamily: 'var(--f-display)', fontSize: 10, letterSpacing: '0.12em',
                      background: isActive ? bg : 'var(--surface-elevated)',
                      color: isActive ? c : 'var(--text-muted)',
                      border: `2px solid ${isActive ? bd : 'var(--border-subtle)'}`,
                      cursor: 'pointer', transition: 'all 0.1s',
                    }}
                  >
                    {r === 'win' ? 'V' : 'D'}
                  </button>
                );
              })}
              <button
                onClick={() => deleteEntry(entry.id)}
                style={{ padding: '4px 8px', background: 'transparent', border: '2px solid transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Supprimer"
              >
                <Trash2 size={11}/>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Stats Tab ─── */
function StatsTab() {
  const { stats, loading, loadStats } = useHistoryStore();

  useEffect(() => { loadStats(); }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 52 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, margin: '0 auto 12px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-muted)' }}>Chargement...</div>
      </div>
    </div>
  );

  if (!stats) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 64 }}>
      <BarChart2 size={32} style={{ color: 'var(--accent)', marginBottom: 14 }}/>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, letterSpacing: '0.1em', marginBottom: 8 }}>AUCUNE STAT</div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        Joue et enregistre des drafts pour voir tes statistiques
      </div>
      <button onClick={loadStats} className="btn-secondary" style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <RefreshCw size={11}/> CHARGER
      </button>
    </div>
  );

  const total = stats.total || 0;
  const wins  = stats.wins  || 0;
  const losses= stats.losses|| 0;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : null;
  const wrColor = winRate >= 55 ? 'var(--win)' : winRate >= 50 ? 'var(--warn)' : 'var(--loss)';

  const cards = [
    { label: 'TOTAL', value: total, color: 'var(--text-primary)' },
    { label: 'VICTOIRES', value: wins, color: 'var(--win)' },
    { label: 'DÉFAITES', value: losses, color: 'var(--loss)' },
    { label: 'WINRATE', value: winRate ? `${winRate}%` : '—', color: wrColor },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {cards.map(({ label, value, color }) => (
          <div key={label} style={{ padding: '18px 20px', background: 'var(--surface-card)', border: '2px solid var(--border-subtle)' }}>
            <div style={SE_LBL}>{label}</div>
            <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 40, letterSpacing: '-0.02em', color, lineHeight: 1 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {(stats.most_played_champion || stats.best_role) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {stats.most_played_champion && (
            <div style={{ padding: '16px 20px', background: 'var(--surface-card)', border: '2px solid var(--border-subtle)' }}>
              <div style={SE_LBL}>CHAMPION FAVORI</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Trophy size={18} style={{ color: 'var(--accent)' }}/>
                <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.04em' }}>
                  {stats.most_played_champion}
                </div>
              </div>
            </div>
          )}
          {stats.best_role && (
            <div style={{ padding: '16px 20px', background: 'var(--surface-card)', border: '2px solid var(--border-subtle)' }}>
              <div style={SE_LBL}>RÔLE PRINCIPAL</div>
              <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 24, letterSpacing: '0.08em' }}>
                {stats.best_role.toUpperCase()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
const TABS = [
  { id: 'history', label: 'HISTORIQUE', icon: History },
  { id: 'stats',   label: 'MES STATS',  icon: BarChart2 },
];

export default function InsightsPage({ champions = [] }) {
  const [tab, setTab] = useState('history');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', flexShrink: 0,
        background: 'var(--surface-default)',
        borderBottom: '2.5px solid #f0ebe0',
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 20, letterSpacing: '0.2em' }}>INSIGHTS</div>

        <div style={{ display: 'flex', gap: 0, background: 'var(--surface-card)', border: '2px solid var(--border-subtle)', padding: 3 }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px',
                fontFamily: 'var(--f-display)', fontSize: 10, letterSpacing: '0.12em',
                background: tab === id ? 'var(--accent)' : 'transparent',
                color: tab === id ? '#000' : 'var(--text-muted)',
                border: 'none', cursor: 'pointer', transition: 'all 0.1s',
              }}
            >
              <Icon size={12}/>{label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {tab === 'history' && <HistoryTab champions={champions}/>}
        {tab === 'stats'   && <StatsTab/>}
      </div>
    </div>
  );
}
