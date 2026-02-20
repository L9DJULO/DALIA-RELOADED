import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, Clock, Cpu, Loader2 } from 'lucide-react';
import { fetchMLStatus, triggerRetrain, reloadModel } from '../../services/api';

const STATUS_CONFIG = {
  idle:     { label: 'Inactif',       icon: Clock,         color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-500/20' },
  checking: { label: 'Vérification…', icon: Loader2,       color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/20' },
  training: { label: 'Entraînement…', icon: Loader2,       color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
  trained:  { label: 'Entraîné',      icon: CheckCircle,   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  error:    { label: 'Erreur',        icon: AlertTriangle, color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
};

export default function MLStatusPanel() {
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
    const iv = setInterval(load, 10000); // poll every 10s
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

  if (loading || !status) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-surface p-3 animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-1/3 mb-2" />
        <div className="h-3 bg-slate-700/50 rounded w-2/3" />
      </div>
    );
  }

  const cfg = STATUS_CONFIG[status.status] || STATUS_CONFIG.idle;
  const StatusIcon = cfg.icon;
  const isTraining = status.status === 'training';

  return (
    <div className="rounded-lg border border-slate-700/50 bg-surface p-3 space-y-2.5">
      {/* Header */}
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
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Patch actuel</span>
            <span className="text-slate-300 font-medium">{status.current_patch}</span>
          </div>
        )}
        {status.last_trained_patch && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Dernier entraînement</span>
            <span className="text-slate-300 font-medium">{status.last_trained_patch}</span>
          </div>
        )}
        {status.last_val_accuracy != null && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Précision (val)</span>
            <span className="text-emerald-400 font-medium tabular-nums">
              {(status.last_val_accuracy * 100).toFixed(1)}%
            </span>
          </div>
        )}
        {status.last_trained_at && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Date</span>
            <span className="text-slate-400 tabular-nums">
              {new Date(status.last_trained_at).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        )}
        {isTraining && status.training_elapsed != null && (
          <div className="flex items-center justify-between text-[11px]">
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
    </div>
  );
}
