// ─────────────────────────────────────────────
// Auth page — Soul Eater design tokens
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import useAuthStore from '../../stores/authStore';
import { getServerUrl, setServerUrl } from '../../services/api';
import logo from '../../assets/logo.png';

const fieldStyle = {
  display: 'block', width: '100%',
  padding: '11px 14px',
  background: 'var(--ink-2)',
  border: 'var(--edge-weight) solid var(--ink-5)',
  color: 'var(--bone-0)',
  fontFamily: 'var(--f-mono)',
  fontSize: 12,
  outline: 'none',
  transition: 'border-color 0.1s, box-shadow 0.1s',
};

function Field({ label, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--bone-2)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</label>
      <input
        {...props}
        style={{
          ...fieldStyle,
          borderColor: focused ? 'var(--accent)' : 'var(--ink-5)',
          boxShadow: focused ? '3px 3px 0 var(--accent)' : 'none',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrlState] = useState(getServerUrl());

  const { login, register, loading, error, clearError } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    if (mode === 'register') {
      if (password !== confirmPassword) { useAuthStore.setState({ error: 'Les mots de passe ne correspondent pas.' }); return; }
      if (password.length < 6) { useAuthStore.setState({ error: 'Minimum 6 caractères.' }); return; }
      await register(username, email, password);
    } else {
      await login(username, password);
    }
  };

  const isLogin = mode === 'login';

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--ink-0)', overflow: 'hidden' }}>
      {/* LEFT — splash */}
      <div style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'var(--ink-1)',
        borderRight: 'var(--edge-weight) solid var(--bone-0)',
        overflow: 'hidden',
        padding: 48,
        order: isLogin ? 1 : 2,
      }}>
        {/* diagonal stripes */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(-38deg, transparent 0 24px, rgba(244,239,230,0.05) 24px 25px)',
          pointerEvents: 'none',
        }}/>
        {/* bottom accent slash */}
        <div style={{
          position: 'absolute', bottom: -28, left: -20, right: -20, height: 70,
          background: 'var(--accent)',
          transform: 'rotate(-2deg)',
          boxShadow: '0 -2px 0 var(--bone-0)',
        }}/>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }} className="anim-fade-up">
          <img
            src={logo}
            alt="DALIA"
            style={{
              width: 320,
              height: 'auto',
              maxWidth: '80%',
              filter: 'drop-shadow(6px 6px 0 var(--ink-0)) drop-shadow(0 0 28px rgba(217,30,43,0.35))',
            }}
          />
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.3em', color: 'var(--bone-2)' }}>
            DRAFT INTELLIGENCE
          </div>
        </div>
      </div>

      {/* RIGHT — form */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 64px',
        position: 'relative',
        order: isLogin ? 2 : 1,
        background: 'var(--ink-0)',
      }}>
        {/* corner accents */}
        <div style={{ position: 'absolute', top: 14, right: 14, width: 22, height: 22, borderTop: '2px solid var(--accent)', borderRight: '2px solid var(--accent)' }}/>
        <div style={{ position: 'absolute', bottom: 14, left: 14, width: 22, height: 22, borderBottom: '2px solid var(--accent)', borderLeft: '2px solid var(--accent)' }}/>

        <div style={{ width: '100%', maxWidth: 400 }} className="anim-fade-up">
          {/* Title */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 30, letterSpacing: '0.12em', color: 'var(--bone-0)', marginBottom: 10 }}>
              {isLogin ? 'CONNEXION' : 'INSCRIPTION'}
            </div>
            <div style={{ display: 'flex', gap: 0 }}>
              {['login','register'].map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); clearError(); }}
                  style={{
                    flex: 1, padding: '9px 0',
                    fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.15em',
                    background: mode === m ? 'var(--accent)' : 'var(--ink-2)',
                    color: mode === m ? 'var(--accent-ink)' : 'var(--bone-2)',
                    border: 'var(--edge-weight) solid ' + (mode === m ? 'var(--accent)' : 'var(--ink-5)'),
                    borderRight: m === 'login' ? '0' : undefined,
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                >
                  {m === 'login' ? 'SE CONNECTER' : "S'INSCRIRE"}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: 14, padding: '9px 12px',
              background: 'rgba(255,77,86,0.08)',
              border: 'var(--edge-weight) solid var(--bad)',
              fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bad)',
            }} className="anim-fade">
              ! {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <Field label="Nom d'utilisateur" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="soul_eater" required autoComplete="username"/>
            {!isLogin && (
              <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="death@city.com" required autoComplete="email"/>
            )}
            <Field
              label="Mot de passe"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
            {!isLogin && (
              <Field label="Confirmer le mot de passe" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required autoComplete="new-password"/>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '13px 0', marginTop: 6,
                fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 14, letterSpacing: '0.25em',
                background: 'var(--accent)', color: 'var(--accent-ink)',
                border: 'var(--edge-weight) solid var(--bone-0)',
                boxShadow: '5px 5px 0 var(--ink-0)',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: 'transform 0.1s, box-shadow 0.1s',
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translate(-2px,-2px)'; e.currentTarget.style.boxShadow = '7px 7px 0 var(--ink-0)'; }}}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '5px 5px 0 var(--ink-0)'; }}
            >
              {loading ? 'CHARGEMENT…' : isLogin ? '▸ SE CONNECTER' : '▸ CRÉER MON COMPTE'}
            </button>
          </form>

          {/* Server config */}
          <div style={{ marginTop: 22 }}>
            <button
              onClick={() => setShowServerConfig(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', padding: '8px 0',
                fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em',
                color: 'var(--bone-2)', background: 'none', border: 'none', cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              ⚙ CONFIGURER LE SERVEUR {showServerConfig ? '▴' : '▾'}
            </button>
            {showServerConfig && (
              <div style={{ marginTop: 8, padding: 12, background: 'var(--ink-2)', border: 'var(--edge-weight) solid var(--ink-5)' }} className="anim-fade">
                <label style={{ display: 'block', fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--bone-2)', marginBottom: 6, textTransform: 'uppercase' }}>URL serveur DALIA</label>
                <div style={{ display: 'flex', gap: 0 }}>
                  <input
                    type="url" value={serverUrl} onChange={e => setServerUrlState(e.target.value)}
                    style={{ ...fieldStyle, flex: 1, borderRight: 0 }}
                    placeholder="http://localhost:8000"
                  />
                  <button
                    onClick={() => { setServerUrl(serverUrl); setShowServerConfig(false); }}
                    style={{
                      padding: '0 14px',
                      background: 'var(--accent)', color: 'var(--accent-ink)',
                      border: 'var(--edge-weight) solid var(--bone-0)',
                      fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.15em',
                      cursor: 'pointer',
                    }}
                  >OK</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 18, textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--bone-3)', letterSpacing: '0.12em' }}>
            DALIA · SOUL EATER EDITION
          </div>
        </div>
      </div>
    </div>
  );
}
