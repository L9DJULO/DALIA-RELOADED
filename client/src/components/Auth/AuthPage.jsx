import React, { useState } from 'react';
import { LogIn, UserPlus, AlertCircle, Server } from 'lucide-react';
import useAuthStore from '../../stores/authStore';
import { getServerUrl, setServerUrl } from '../../services/api';
import DaliaLogo from '../DaliaLogo';

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [serverUrl, setServerUrlState] = useState(getServerUrl());
  const [showServerConfig, setShowServerConfig] = useState(true);
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
        useAuthStore.setState({ error: 'Le mot de passe doit faire au moins 6 caractères.' });
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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--surface-base)' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4">
            <DaliaLogo size={56} />
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--accent)' }}>DALIA</h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>Draft Analysis League Intelligence Assistant</p>
        </div>

        {/* Auth Card */}
        <div className="panel p-6">
          {/* Tab switcher */}
          <div className="flex mb-6 rounded-xl p-1" style={{ background: 'var(--surface-elevated)' }}>
            <button
              onClick={() => { setMode('login'); clearError(); }}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                mode === 'login' ? 'text-white' : ''
              }`}
              style={mode === 'login' ? {
                background: 'var(--accent)',
              } : {
                color: 'var(--text-muted)',
              }}
            >
              <LogIn className="w-4 h-4 inline mr-2" />
              Connexion
            </button>
            <button
              onClick={() => { setMode('register'); clearError(); }}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
                mode === 'register' ? 'text-white' : ''
              }`}
              style={mode === 'register' ? {
                background: 'var(--accent)',
              } : {
                color: 'var(--text-muted)',
              }}
            >
              <UserPlus className="w-4 h-4 inline mr-2" />
              Inscription
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
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
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="ton@email.com"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field"
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? 'Chargement…'
                : mode === 'login'
                ? 'Se connecter'
                : "S'inscrire"}
            </button>
          </form>
        </div>

        {/* Server config */}
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowServerConfig(!showServerConfig)}
            className="text-xs transition-colors inline-flex items-center gap-1 hover:text-[var(--accent)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <Server className="w-3 h-3" />
            Configurer le serveur
          </button>

          {showServerConfig && (
            <div className="mt-2 p-3 panel">
              <label className="block text-xs mb-1.5 text-left" style={{ color: 'var(--text-secondary)' }}>
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
                  className="px-3 py-2 text-sm rounded-xl transition-all duration-200"
                  style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                >
                  OK
                </button>
              </div>
              {isLocalhost && (
                <p className="text-[11px] mt-2 text-left" style={{ color: 'var(--accent)' }}>
                  ⚠️ Serveur local détecté. Pour jouer en ligne, entre l'URL du serveur fournie par l'admin.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
          DALIA v2.0 — Client/Server Architecture
        </p>
      </div>
    </div>
  );
}
