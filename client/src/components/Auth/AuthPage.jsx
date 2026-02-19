import React, { useState } from 'react';
import { LogIn, UserPlus, Zap, AlertCircle, Server } from 'lucide-react';
import useAuthStore from '../../stores/authStore';
import { getServerUrl, setServerUrl } from '../../services/api';

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
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg">
            <Zap className="w-7 h-7 text-slate-900" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">DALIA</h1>
          <p className="text-sm text-slate-400 mt-1">Draft Analysis League Intelligence Assistant</p>
        </div>

        {/* Auth Card */}
        <div className="bg-surface-card border border-white/[0.06] rounded-xl p-6 shadow-xl">
          {/* Tab switcher */}
          <div className="flex mb-6 bg-surface-base rounded-lg p-1">
            <button
              onClick={() => { setMode('login'); clearError(); }}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                mode === 'login'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <LogIn className="w-4 h-4 inline mr-2" />
              Connexion
            </button>
            <button
              onClick={() => { setMode('register'); clearError(); }}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                mode === 'register'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <UserPlus className="w-4 h-4 inline mr-2" />
              Inscription
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Nom d'utilisateur
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 bg-surface-base border border-white/[0.08] rounded-lg text-slate-200 text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                placeholder="ton_pseudo"
                required
                autoFocus
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-base border border-white/[0.08] rounded-lg text-slate-200 text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  placeholder="ton@email.com"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-surface-base border border-white/[0.08] rounded-lg text-slate-200 text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-base border border-white/[0.08] rounded-lg text-slate-200 text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="text-xs text-slate-500 hover:text-slate-400 transition-colors inline-flex items-center gap-1"
          >
            <Server className="w-3 h-3" />
            Configurer le serveur
          </button>

          {showServerConfig && (
            <div className="mt-2 p-3 bg-surface-card border border-white/[0.06] rounded-lg">
              <label className="block text-xs text-slate-400 mb-1.5 text-left">
                URL du serveur DALIA
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={serverUrl}
                  onChange={(e) => setServerUrlState(e.target.value)}
                  className="flex-1 px-3 py-2 bg-surface-base border border-white/[0.08] rounded-lg text-slate-200 text-sm focus:outline-none focus:border-amber-500/50"
                  placeholder="https://dalia-reloaded-production.up.railway.app"
                />
                <button
                  onClick={handleServerUrlSave}
                  className="px-3 py-2 bg-amber-500/20 text-amber-400 text-sm rounded-lg hover:bg-amber-500/30 transition-colors"
                >
                  OK
                </button>
              </div>
              {isLocalhost && (
                <p className="text-[11px] text-amber-400 mt-2 text-left">
                  ⚠️ Serveur local détecté. Pour jouer en ligne, entre l'URL du serveur fournie par l'admin.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          DALIA v2.0 — Client/Server Architecture
        </p>
      </div>
    </div>
  );
}
