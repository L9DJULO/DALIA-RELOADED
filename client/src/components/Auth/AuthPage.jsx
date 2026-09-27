// ─────────────────────────────────────────────
// Auth page — l'écran de référence de la DA : lune, entaille, équerres
// ─────────────────────────────────────────────
import React, { useId, useState } from 'react';
import useAuthStore from '../../stores/authStore';
import DaliaLogo from '../DaliaLogo';

function Field({ label, ...props }) {
  const id = useId();
  return (
    <div className="auth__field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="field auth__input" {...props}/>
    </div>
  );
}

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { login, register, loading, error, clearError } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    if (mode === 'register') {
      if (password !== confirmPassword) { useAuthStore.setState({ error: 'Les mots de passe ne correspondent pas.' }); return; }
      if (password.length < 6) { useAuthStore.setState({ error: 'Le mot de passe doit faire au moins 6 caractères.' }); return; }
      await register(username, email, password);
    } else {
      await login(username, password);
    }
  };

  const isLogin = mode === 'login';

  return (
    <div className={`auth ${isLogin ? '' : 'auth--register'}`}>
      <div className="auth__splash">
        <div className="auth__brand anim-fade-up">
          <DaliaLogo size={320} alt="DALIA" className="auth__logo"/>
          <p className="auth__tagline">DRAFT INTELLIGENCE</p>
        </div>
      </div>

      <main className="auth__panel">
        <div className="auth__form anim-fade-up">
          <h1 className="auth__title">{isLogin ? 'CONNEXION' : 'INSCRIPTION'}</h1>
          <div className="seg seg--fill auth__modes" role="group" aria-label="Connexion ou inscription">
            {['login', 'register'].map(m => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); clearError(); }}>
                {m === 'login' ? 'Se connecter' : "S'inscrire"}
              </button>
            ))}
          </div>

          {error && <p className="notice notice--bad anim-fade" role="alert">{error}</p>}

          <form onSubmit={handleSubmit} className="auth__fields">
            <Field label="Nom d'utilisateur" type="text" name="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="soul_eater" required autoComplete="username" spellCheck={false}/>
            {!isLogin && (
              <Field label="Email" type="email" name="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="death@city.com" required autoComplete="email" spellCheck={false}/>
            )}
            <Field label="Mot de passe" type="password" name="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required minLength={6} autoComplete={isLogin ? 'current-password' : 'new-password'}/>
            {!isLogin && (
              <Field label="Confirmer le mot de passe" type="password" name="confirm-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required autoComplete="new-password"/>
            )}
            <button type="submit" className="btn btn--primary btn--lg btn--block auth__submit" disabled={loading}>
              {loading ? 'Connexion…' : isLogin ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>

          <p className="auth__foot">DALIA · SOUL EATER EDITION</p>
        </div>
      </main>
    </div>
  );
}
