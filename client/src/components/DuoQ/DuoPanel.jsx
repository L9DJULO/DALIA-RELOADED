import React, { useEffect, useState } from 'react';
import { Users, Copy, Link2, Link2Off, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import useDuoStore from '../../stores/duoStore';
import { ROLES } from '../../lib/constants';

const ROLE_SHORT = { top: 'TOP', jungle: 'JGL', mid: 'MID', bot: 'ADC', support: 'SUP' };

export default function DuoPanel({ embedded = false }) {
  const {
    duoActive, myCode, linked, partner, partnerRole,
    loading, linking, error,
    loadDuoState, linkWithCode, unlink, toggleDuoActive,
    setPartnerRole, regenerateCode, clearError,
  } = useDuoStore();

  const [linkCode, setLinkCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadDuoState();
  }, []);

  const handleCopy = () => {
    if (!myCode) return;
    navigator.clipboard.writeText(myCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLink = async () => {
    const ok = await linkWithCode(linkCode);
    if (ok) setLinkCode('');
  };

  const containerStyle = embedded
    ? { padding: 16, overflow: 'auto', height: '100%', background: 'var(--ink-0)' }
    : { padding: 32, maxWidth: 520, margin: '0 auto' };

  const SE_LBL = {
    fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--accent)',
    letterSpacing: '0.18em', marginBottom: 8, textTransform: 'uppercase',
    paddingBottom: 4, borderBottom: '1.5px solid var(--accent)',
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Users size={16} style={{ color: 'var(--accent)' }}/>
        <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.18em', color: 'var(--bone-0)' }}>DUO Q</span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--bone-3)', letterSpacing: '0.1em' }}>/ ANALYSE PARTENAIRE</span>
        {linked && (
          <button
            onClick={toggleDuoActive}
            style={{
              marginLeft: 'auto', padding: '5px 14px',
              fontFamily: 'var(--f-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
              background: duoActive ? 'var(--accent)' : 'var(--ink-3)',
              color: duoActive ? 'var(--accent-ink)' : 'var(--bone-2)',
              border: `1.5px solid ${duoActive ? 'var(--accent)' : 'var(--ink-5)'}`,
              cursor: 'pointer', transition: 'all 0.1s',
              boxShadow: duoActive ? '2px 2px 0 var(--ink-0)' : 'none',
            }}
          >
            {duoActive ? '▸ ACTIF' : 'ACTIVER'}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'rgba(255,40,50,0.08)', border: '1.5px solid rgba(255,40,50,0.4)',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <AlertCircle size={13} style={{ color: 'var(--bad)', flexShrink: 0, marginTop: 1 }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bad)' }}>
              {typeof error === 'string' ? error : error.message}
            </div>
            <button onClick={clearError} style={{
              background: 'none', border: 'none', color: 'var(--bone-3)',
              fontFamily: 'var(--f-mono)', fontSize: 10, cursor: 'pointer', marginTop: 4, padding: 0,
            }}>FERMER ×</button>
          </div>
        </div>
      )}

      {/* My code */}
      <div style={{
        marginBottom: 16, padding: '14px 16px',
        background: 'var(--ink-2)', border: 'var(--edge-weight) solid var(--ink-5)',
      }}>
        <div style={SE_LBL}>Mon code duo</div>
        {loading && !myCode ? (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bone-3)' }}>Chargement...</div>
        ) : myCode ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              flex: 1, padding: '10px 14px',
              background: 'var(--ink-3)',
              border: '1.5px solid var(--ink-5)',
              fontFamily: 'var(--f-mono)', fontWeight: 700, fontSize: 22,
              letterSpacing: '0.35em', color: 'var(--accent)', textAlign: 'center',
            }}>{myCode}</div>
            <button
              onClick={handleCopy}
              title="Copier"
              style={{
                padding: '10px 13px',
                background: copied ? 'rgba(38,255,110,0.10)' : 'var(--ink-3)',
                border: `1.5px solid ${copied ? 'rgba(38,255,110,0.4)' : 'var(--ink-5)'}`,
                color: copied ? '#26ff6e' : 'var(--bone-2)',
                cursor: 'pointer', transition: 'all 0.1s', display: 'flex',
              }}
            >
              {copied ? <CheckCircle2 size={14}/> : <Copy size={14}/>}
            </button>
            <button
              onClick={regenerateCode}
              title="Régénérer"
              style={{
                padding: '10px 13px',
                background: 'var(--ink-3)', border: '1.5px solid var(--ink-5)',
                color: 'var(--bone-2)', cursor: 'pointer', display: 'flex',
              }}
            >
              <RefreshCw size={14}/>
            </button>
          </div>
        ) : (
          <button
            onClick={loadDuoState}
            style={{
              padding: '7px 16px',
              fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.12em',
              background: 'var(--ink-3)', color: 'var(--bone-1)',
              border: '1.5px solid var(--ink-5)', cursor: 'pointer',
            }}
          >Charger</button>
        )}
      </div>

      {/* Link / Partner */}
      {!linked ? (
        <div style={{
          padding: '14px 16px',
          background: 'var(--ink-2)', border: 'var(--edge-weight) solid var(--ink-5)',
          marginBottom: 16,
        }}>
          <div style={SE_LBL}>Entrer le code du partenaire</div>
          <div style={{ display: 'flex', gap: 0 }}>
            <input
              value={linkCode}
              onChange={e => setLinkCode(e.target.value.toUpperCase())}
              placeholder="CODE DUO..."
              maxLength={8}
              style={{
                flex: 1, padding: '10px 14px',
                background: 'var(--ink-3)',
                border: '1.5px solid var(--ink-5)', borderRight: 0,
                color: 'var(--bone-0)',
                fontFamily: 'var(--f-mono)', fontWeight: 700, fontSize: 18,
                letterSpacing: '0.3em', outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--ink-5)'}
              onKeyDown={e => { if (e.key === 'Enter') handleLink(); }}
            />
            <button
              onClick={handleLink}
              disabled={linking || !linkCode.trim()}
              style={{
                padding: '10px 20px',
                background: (linking || !linkCode.trim()) ? 'var(--ink-3)' : 'var(--accent)',
                color: (linking || !linkCode.trim()) ? 'var(--bone-3)' : 'var(--accent-ink)',
                border: 'var(--edge-weight) solid var(--bone-0)',
                fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.15em',
                cursor: (linking || !linkCode.trim()) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: (linking || !linkCode.trim()) ? 'none' : '2px 2px 0 var(--ink-0)',
              }}
            >
              <Link2 size={12}/>{linking ? '...' : 'LIER'}
            </button>
          </div>
        </div>
      ) : (
        /* Partner card */
        <div style={{
          padding: '14px 16px',
          background: 'var(--ink-2)',
          border: 'var(--edge-weight) solid var(--bone-0)',
          marginBottom: 16,
          boxShadow: '4px 4px 0 var(--accent)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.08em', color: 'var(--bone-0)' }}>
                {partner?.username || '—'}
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#26ff6e', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#26ff6e', display: 'inline-block', boxShadow: '0 0 4px #26ff6e' }}/>LIÉ
              </div>
            </div>
            <button
              onClick={unlink}
              disabled={linking}
              style={{
                padding: '5px 12px',
                background: 'rgba(255,40,50,0.08)', border: '1.5px solid rgba(255,40,50,0.4)',
                color: 'var(--bad)',
                fontFamily: 'var(--f-display)', fontSize: 10, letterSpacing: '0.1em',
                cursor: linking ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <Link2Off size={11}/> DÉLIER
            </button>
          </div>

          {/* Partner role */}
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--bone-3)', letterSpacing: '0.15em', marginBottom: 8 }}>
              RÔLE DU PARTENAIRE
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {ROLES.map(r => (
                <button
                  key={r}
                  onClick={() => setPartnerRole(r)}
                  style={{
                    flex: 1, padding: '6px 0',
                    fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 9, letterSpacing: '0.1em',
                    background: partnerRole === r ? 'var(--accent)' : 'var(--ink-3)',
                    color: partnerRole === r ? 'var(--accent-ink)' : 'var(--bone-2)',
                    border: `1.5px solid ${partnerRole === r ? 'var(--accent)' : 'var(--ink-5)'}`,
                    cursor: 'pointer', transition: 'all 0.1s',
                  }}
                >
                  {ROLE_SHORT[r]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!linked && !loading && (
        <div style={{
          fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bone-3)',
          lineHeight: 1.8, padding: '0 2px', letterSpacing: '0.04em',
          borderLeft: '2px solid var(--ink-5)', paddingLeft: 12,
        }}>
          Partage ton code à ton duo. Il entre ton code et vous êtes liés.<br/>
          Active le mode <span style={{ color: 'var(--accent)', letterSpacing: '0.12em' }}>DUO Q</span> pour booster les synergies dans l'analyse.
        </div>
      )}
    </div>
  );
}
