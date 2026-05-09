import React, { useState, useCallback } from 'react';
import { Shield, RefreshCw, AlertTriangle } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import useUserStore from '../../stores/userStore';
import { fetchBanRecommendations } from '../../services/api';
import { getDDragonChampUrl } from '../../lib/constants';

export default function BanPanel() {
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const myRole       = useDraftStore(s => s.myRole);
  const championPool = useUserStore(s => s.championPool);

  const fetchBans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBanRecommendations(myRole, championPool, [], []);
      setBans(data.recommendations || data.bans || []);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Erreur lors de la récupération des bans');
    } finally {
      setLoading(false);
    }
  }, [myRole, championPool]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Analyse des bans...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, background: 'var(--loss-bg)', border: '2px solid var(--loss-border)', display: 'flex', gap: 10 }}>
        <AlertTriangle size={14} style={{ color: 'var(--loss)', flexShrink: 0, marginTop: 1 }}/>
        <div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 11, color: 'var(--loss)', marginBottom: 6, letterSpacing: '0.1em' }}>ERREUR</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>{error}</div>
          <button onClick={fetchBans} className="btn-secondary btn-sm" style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <RefreshCw size={10}/> RÉESSAYER
          </button>
        </div>
      </div>
    );
  }

  if (!bans.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 32, gap: 12 }}>
        <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-elevated)', border: '2px solid var(--border-subtle)' }}>
          <Shield size={22} style={{ color: 'var(--accent)' }}/>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: '0.1em', marginBottom: 6 }}>RECOMMANDATIONS DE BANS</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>Quels champions bannir selon ton rôle et pool</div>
        </div>
        <button onClick={fetchBans} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px' }}>
          <RefreshCw size={11}/> ANALYSER LES BANS
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 14, letterSpacing: '0.1em' }}>TOP BANS</div>
        <button onClick={fetchBans} className="btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={10}/> RAFRAÎCHIR
        </button>
      </div>

      {bans.map((ban, i) => (
        <div key={ban.champion_id || i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', marginBottom: 6,
          background: 'var(--surface-card)',
          border: '1.5px solid var(--border-subtle)',
          borderLeft: `3px solid ${i === 0 ? 'var(--accent)' : i < 3 ? 'var(--loss)' : 'var(--border-subtle)'}`,
        }}>
          <div style={{
            fontFamily: 'var(--f-mono)', fontWeight: 700, fontSize: 12,
            color: i === 0 ? 'var(--accent)' : 'var(--text-muted)',
            width: 22, textAlign: 'center', flexShrink: 0,
          }}>
            {String(i + 1).padStart(2, '0')}
          </div>

          {ban.champion_key && (
            <img
              src={getDDragonChampUrl(ban.champion_key)}
              alt={ban.champion_name}
              style={{ width: 36, height: 36, objectFit: 'cover', border: '1px solid var(--border-subtle)', flexShrink: 0 }}
            />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em' }}>{ban.champion_name}</div>
            {ban.reason && (
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ban.reason}</div>
            )}
          </div>

          {ban.priority_score != null && (
            <div style={{
              fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 22,
              color: i === 0 ? 'var(--accent)' : 'var(--text-primary)',
              flexShrink: 0,
            }}>
              {Math.round(ban.priority_score)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
