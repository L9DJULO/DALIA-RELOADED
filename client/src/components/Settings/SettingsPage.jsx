/**
 * Settings Page — User preferences + Admin ML controls.
 *
 * The ML training/status panel is hidden here for admin use only,
 * keeping the main UI clean for regular users.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Server, Shield, Brain, RefreshCw, CheckCircle,
  AlertTriangle, Clock, Cpu, Loader2, LogOut, User, Sliders,
} from 'lucide-react';
import { fetchMLStatus, triggerRetrain, reloadModel, getServerUrl, setServerUrl } from '../../services/api';
import useAuthStore from '../../stores/authStore';
import useUserStore from '../../stores/userStore';

/* ── ML Admin Panel (hidden in settings) ── */
const STATUS_CONFIG = {
  idle:      { label: 'Inactif',       icon: Clock,         color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-500/20' },
  checking:  { label: 'Vérification…', icon: Loader2,       color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/20' },
  training:  { label: 'Entraînement…', icon: Loader2,       color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
  trained:   { label: 'Entraîné',      icon: CheckCircle,   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  error:     { label: 'Erreur',        icon: AlertTriangle, color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
};

function MLAdminPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchMLStatus();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [load]);

  const handleRetrain = async () => {
    setRetraining(true);
    try {
      await triggerRetrain();
      await load();
    } finally {
      setRetraining(false);
    }
  };

  const handleReload = async () => {
    try {
      await reloadModel();
      await load();
    } catch {}
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-slate-700 rounded w-1/3" />
        <div className="h-3 bg-slate-700/50 rounded w-2/3" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-sm text-slate-500">
        Impossible de contacter le serveur ML.
      </div>
    );
  }

  const cfg = STATUS_CONFIG[status.status] || STATUS_CONFIG.idle;
  const StatusIcon = cfg.icon;
  const isTraining = status.status === 'training';

  return (
    <div className="space-y-3">
      {/* Status badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-violet-500" />
          <span className="text-xs font-semibold text-slate-200">Modèle IA</span>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium ${cfg.bg} ${cfg.color}`}>
          <StatusIcon size={11} className={isTraining ? 'animate-spin' : ''} />
          {cfg.label}
        </div>
      </div>

      {/* Info rows */}
      <div className="space-y-1">
        {status.current_patch && (
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-500">Patch actuel</span>
            <span className="text-slate-300 font-medium">{status.current_patch}</span>
          </div>
        )}
        {status.last_trained_patch && (
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-500">Dernier entraînement</span>
            <span className="text-slate-300 font-medium">{status.last_trained_patch}</span>
          </div>
        )}
        {status.last_val_accuracy != null && (
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-500">Précision (val)</span>
            <span className="text-emerald-400 font-medium tabular-nums">
              {(status.last_val_accuracy * 100).toFixed(1)}%
            </span>
          </div>
        )}
        {status.last_trained_at && (
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-500">Date</span>
            <span className="text-slate-400 tabular-nums">
              {new Date(status.last_trained_at).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        )}
        {isTraining && status.training_elapsed != null && (
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-500">Temps écoulé</span>
            <span className="text-amber-400 tabular-nums">{status.training_elapsed.toFixed(0)}s</span>
          </div>
        )}
        {status.needs_retrain && !isTraining && (
          <div className="text-[11px] text-amber-400 flex items-center gap-1 mt-1">
            <AlertTriangle size={11} />
            Nouveau patch détecté — re-entraînement nécessaire
          </div>
        )}
        {status.last_error && (
          <div className="text-[10px] text-red-400 mt-1 truncate" title={status.last_error}>
            ⚠ {status.last_error}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 pt-1">
        <button
          onClick={handleRetrain}
          disabled={isTraining || retraining}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md
                     bg-violet-500/10 text-violet-400 border border-violet-500/20
                     hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed
                     text-[11px] font-medium transition-colors"
        >
          <RefreshCw size={11} className={retraining ? 'animate-spin' : ''} />
          {isTraining ? 'En cours…' : 'Re-entraîner'}
        </button>
        {status.status === 'trained' && (
          <button
            onClick={handleReload}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md
                       bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
                       hover:bg-emerald-500/20 text-[11px] font-medium transition-colors"
          >
            Recharger
          </button>
        )}
      </div>

      {/* Info */}
      <div className="text-[10px] text-slate-600 leading-relaxed">
        Le modèle IA utilise un réseau de neurones entraîné sur des parties D2+.
        Le re-entraînement automatique se déclenche à chaque nouveau patch.
      </div>
    </div>
  );
}

/* ── Main Settings Page ── */
export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetPool = useUserStore((s) => s.resetPool);
  const [serverUrl, setUrl] = useState(getServerUrl());
  const [showAdmin, setShowAdmin] = useState(false);

  const handleLogout = () => {
    resetPool();
    logout();
  };

  const handleServerUrlChange = (newUrl) => {
    setUrl(newUrl);
    setServerUrl(newUrl);
  };

  return (
    <div className="h-[calc(100vh-2.5rem)] overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-700/50 border border-slate-700 flex items-center justify-center">
            <Settings size={18} className="text-slate-300" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Paramètres</h1>
            <p className="text-xs text-slate-500">Configuration de l'application</p>
          </div>
        </div>

        {/* Account */}
        <div className="panel p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <User size={14} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-200">Compte</span>
          </div>
          {user && (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-100 font-medium">{user.username}</div>
                <div className="text-xs text-slate-500">{user.email}</div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-xs font-medium transition-colors"
              >
                <LogOut size={12} />
                Déconnexion
              </button>
            </div>
          )}
        </div>

        {/* Server connection */}
        <div className="panel p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Server size={14} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-200">Serveur</span>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">URL du serveur DALIA</label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => handleServerUrlChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-elevated border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-violet-500/50 transition-colors"
              placeholder="http://localhost:8000"
            />
            <div className="text-[10px] text-slate-600 mt-1">
              Adresse du serveur backend. En développement : http://localhost:8000
            </div>
          </div>
        </div>

        {/* Admin section — ML controls */}
        <div className="panel p-4 space-y-3">
          <button
            onClick={() => setShowAdmin(!showAdmin)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-violet-500" />
              <span className="text-sm font-medium text-slate-200">Administration</span>
            </div>
            <span className="text-[11px] text-slate-500">
              {showAdmin ? '▲ Masquer' : '▼ Afficher'}
            </span>
          </button>

          {showAdmin && (
            <div className="pt-2 border-t border-slate-700/30 space-y-4">
              {/* ML Panel */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Brain size={14} className="text-violet-400" />
                  <span className="text-xs font-medium text-slate-300">Modèle IA — Entraînement</span>
                </div>
                <MLAdminPanel />
              </div>
            </div>
          )}
        </div>

        {/* App info */}
        <div className="text-center text-[11px] text-slate-600 pt-4">
          DALIA v2.0 · Draft Assistant for League Intelligence Analysis
        </div>
      </div>
    </div>
  );
}
