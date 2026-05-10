// ─────────────────────────────────────────────
// Settings page — Soul Eater design tokens
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import useLCUStore from '../../stores/lcuStore';
import useAuthStore from '../../stores/authStore';
import useUserStore from '../../stores/userStore';
import { SectionLbl } from '../Primitives';

const ACCENTS = [
  { id: 'red',     hex: '#d91e2b', label: 'ROUGE'   },
  { id: 'violet',  hex: '#7b2cff', label: 'VIOLET'  },
  { id: 'acid',    hex: '#e5ff00', label: 'ACIDE'   },
  { id: 'cyan',    hex: '#00e7ff', label: 'CYAN'    },
  { id: 'magenta', hex: '#ff1ec0', label: 'MAGENTA' },
  { id: 'toxic',   hex: '#26ff6e', label: 'TOXIC'   },
];

function Card({ children }) {
  return (
    <section style={{
      marginBottom: 18, padding: '16px 20px',
      background: 'var(--ink-2)',
      border: 'var(--edge-weight) solid var(--ink-5)',
      boxShadow: '4px 4px 0 var(--ink-0)',
    }}>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const [accent, setAccent] = useState(
    document.documentElement.dataset.accent || localStorage.getItem('dalia_accent') || 'red'
  );
  const [connecting, setConnecting] = useState(false);

  const lcuConnected = useLCUStore(s => s.connected);
  const summoner     = useLCUStore(s => s.summoner);
  const lcuConnect   = useLCUStore(s => s.connect);
  const user         = useAuthStore(s => s.user);
  const userLogout   = useUserStore(s => s.logout);

  const handleAccent = (id) => {
    document.documentElement.dataset.accent = id;
    localStorage.setItem('dalia_accent', id);
    setAccent(id);
  };

  const handleLCUConnect = async () => {
    setConnecting(true);
    await lcuConnect();
    setConnecting(false);
  };

  const handleLogout = () => {
    // userStore.logout() clears pool + dispatches `dalia:logout` which is
    // also listened to by authStore + duoStore (token, profile, duo state cleared).
    userLogout();
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--ink-0)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 64px' }}>

        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 24, letterSpacing: '0.18em', color: 'var(--bone-0)', marginBottom: 4 }}>
            PARAMÈTRES
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bone-2)', letterSpacing: '0.08em' }}>
            CONFIGURATION DE L'APPLICATION
          </div>
        </div>

        {/* Account */}
        {user && (
          <Card>
            <SectionLbl n={1}>COMPTE</SectionLbl>
            <div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, letterSpacing: '0.06em', color: 'var(--bone-0)' }}>
                {user.username}
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bone-2)', marginTop: 2 }}>
                {user.email}
              </div>
            </div>
          </Card>
        )}

        {/* Accent color */}
        <Card>
          <SectionLbl n={2}>COULEUR D'ACCENT</SectionLbl>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {ACCENTS.map(a => {
              const isActive = accent === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => handleAccent(a.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                    padding: '10px 14px',
                    background: isActive ? 'var(--ink-3)' : 'var(--ink-2)',
                    border: `var(--edge-weight) solid ${isActive ? a.hex : 'var(--ink-5)'}`,
                    boxShadow: isActive ? `3px 3px 0 ${a.hex}` : 'none',
                    cursor: 'pointer', transition: 'all 0.1s',
                  }}
                >
                  <div style={{ width: 28, height: 28, background: a.hex, border: '1.5px solid var(--bone-0)' }}/>
                  <span style={{ fontFamily: 'var(--f-display)', fontSize: 9, letterSpacing: '0.18em', color: isActive ? a.hex : 'var(--bone-2)' }}>
                    {a.label}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* LCU */}
        <Card>
          <SectionLbl n={3}>CLIENT LEAGUE (LCU)</SectionLbl>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <span className={`lcu-dot ${lcuConnected ? 'lcu-on' : 'lcu-off'}`}/>
            <span style={{
              fontFamily: 'var(--f-display)', fontSize: 12, letterSpacing: '0.1em',
              color: lcuConnected ? 'var(--ok)' : 'var(--bone-2)',
            }}>
              {lcuConnected ? 'CONNECTÉ' : 'DÉCONNECTÉ'}
            </span>
            {!lcuConnected && (
              <button
                onClick={handleLCUConnect}
                disabled={connecting}
                style={{
                  marginLeft: 'auto',
                  padding: '6px 14px',
                  fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em',
                  background: 'transparent', color: 'var(--accent)',
                  border: '1.5px solid var(--accent)',
                  cursor: connecting ? 'wait' : 'pointer',
                  opacity: connecting ? 0.6 : 1,
                }}
              >
                {connecting ? 'CONNEXION…' : '◇ CONNECTER'}
              </button>
            )}
          </div>

          {summoner && (
            <div style={{ padding: '10px 14px', background: 'var(--ink-3)', border: '1.5px solid var(--ink-5)', marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 14, letterSpacing: '0.06em', color: 'var(--bone-0)' }}>
                {summoner.gameName}
                <span style={{ color: 'var(--bone-2)', fontSize: 12, marginLeft: 4 }}>#{summoner.tagLine}</span>
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--bone-2)', letterSpacing: '0.08em', marginTop: 2 }}>
                NIV {summoner.summonerLevel} · {summoner.region || 'EUW'}
              </div>
            </div>
          )}

          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--bone-3)', lineHeight: 1.7, letterSpacing: '0.05em' }}>
            Le LCU se connecte au client League pour détecter les drafts en cours. Disponible uniquement dans l'application desktop (Tauri).
          </div>
        </Card>

        {/* Logout — bouton clairement visible en bas */}
        {user && (
          <div style={{ marginTop: 32, padding: '20px 0', borderTop: '1px solid var(--ink-5)' }}>
            <button
              onClick={handleLogout}
              style={{
                width: '100%', padding: '14px 0',
                fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.28em',
                background: 'var(--bad)',
                color: '#fff',
                border: 'var(--edge-weight) solid var(--bone-0)',
                boxShadow: '5px 5px 0 var(--ink-0)',
                cursor: 'pointer',
                transition: 'transform 0.1s, box-shadow 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-2px,-2px)'; e.currentTarget.style.boxShadow = '7px 7px 0 var(--ink-0)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '5px 5px 0 var(--ink-0)'; }}
            >
              ↩ SE DÉCONNECTER
            </button>
            <div style={{ marginTop: 8, textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--bone-3)', letterSpacing: '0.08em' }}>
              Vide le token, le profil et le pool · retour à la page de connexion
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--bone-3)', letterSpacing: '0.12em', marginTop: 24 }}>
          DALIA v2.0 · DRAFT INTELLIGENCE
        </div>
      </div>
    </div>
  );
}
