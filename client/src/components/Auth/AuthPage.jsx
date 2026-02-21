import React, { useState } from 'react';
import { LogIn, UserPlus, AlertCircle, Server, Eye, EyeOff, ChevronDown, Loader2 } from 'lucide-react';
import useAuthStore from '../../stores/authStore';
import { getServerUrl, setServerUrl } from '../../services/api';
import DaliaLogo from '../DaliaLogo';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [serverUrl, setServerUrlState] = useState(getServerUrl());
  const [showServerConfig, setShowServerConfig] = useState(false);
  const isLocalhost = serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1');

  const { login, register, loading, error, clearError } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (mode === 'register') {
      if (password !== confirmPassword) {
        useAuthStore.setState({ error: 'Les mots de passe ne correspondent pas.' });
        return;
      }
      if (password.length < 6) {
        useAuthStore.setState({ error: 'Le mot de passe doit faire au moins 6 caracteres.' });
        return;
      }
      await register(username, email, password);
    } else {
      await login(username, password);
    }
  };

  const handleServerUrlSave = () => {
    setServerUrl(serverUrl);
    setShowServerConfig(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface-base relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.08]"
          style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, var(--accent-glow), transparent)' }}
        />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in-up">
        {/* ── Branding ── */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
            <DaliaLogo size={64} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-accent">DALIA</h1>
          <p className="text-sm mt-1.5 text-txt-muted">Draft Analysis League Intelligence Assistant</p>
        </div>

        {/* ── Auth Card ── */}
        <div className="glass-panel p-6">
          {/* Tab switcher */}
          <div className="flex mb-6 rounded-xl p-1 bg-surface-elevated">
            {[
              { id: 'login', label: 'Connexion', icon: LogIn },
              { id: 'register', label: 'Inscription', icon: UserPlus },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setMode(id); clearError(); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  mode === id
                    ? 'bg-accent text-white shadow-glow'
                    : 'text-txt-muted hover:text-txt-secondary'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/8 border border-red-500/15 rounded-xl flex items-start gap-2.5 animate-fade-in-up">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5 text-txt-secondary">
                Nom d'utilisateur
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="ton_pseudo"
                required
                autoFocus
                autoComplete="username"
              />
            </div>

            {mode === 'register' && (
              <div className="animate-fade-in-up">
                <label className="block text-xs font-medium mb-1.5 text-txt-secondary">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="ton@email.com"
                  required
                  autoComplete="email"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1.5 text-txt-secondary">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder={'*'.repeat(8)}
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-secondary transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Masquer' : 'Afficher'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className="animate-fade-in-up">
                <label className="block text-xs font-medium mb-1.5 text-txt-secondary">
                  Confirmer le mot de passe
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field"
                  placeholder={'*'.repeat(8)}
                  required
                  autoComplete="new-password"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Chargement...
                </>
              ) : mode === 'login' ? (
                <>
                  <LogIn size={16} />
                  Se connecter
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  {"S'inscrire"}
                </>
              )}
            </button>
          </form>
        </div>

        {/* ── Server Config ── */}
        <div className="mt-4">
          <button
            onClick={() => setShowServerConfig(!showServerConfig)}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-txt-muted hover:text-accent transition-colors py-2"
          >
            <Server size={12} />
            <span>Configurer le serveur</span>
            <ChevronDown size={12} className={`transition-transform duration-200 ${showServerConfig ? 'rotate-180' : ''}`} />
          </button>

          {showServerConfig && (
            <div className="mt-1 glass-panel p-4 animate-fade-in-up">
              <label className="block text-xs font-medium mb-1.5 text-txt-secondary">
                URL du serveur DALIA
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={serverUrl}
                  onChange={(e) => setServerUrlState(e.target.value)}
                  className="input-field flex-1"
                  placeholder="https://dalia-reloaded-production.up.railway.app"
                />
                <button
                  onClick={handleServerUrlSave}
                  className="btn-secondary px-4"
                >
                  OK
                </button>
              </div>
              {isLocalhost && (
                <p className="text-[11px] mt-2 text-accent/70">
                  Serveur local detecte. Pour jouer en ligne, entre l'URL du serveur fournie par l'admin.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Version */}
        <p className="text-center text-[10px] mt-6 text-txt-muted">
          DALIA v2.0 -- Architecture Client/Serveur
        </p>
      </div>
    </div>
  );
}
