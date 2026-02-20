import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

/**
 * Error Boundary — Catches React render crashes and shows a recovery UI
 * instead of a blank/black screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[DALIA] React crash caught by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleReset = () => {
    // Clear all persisted state that could cause crash loops
    localStorage.removeItem('dalia-user-store');
    localStorage.removeItem('dalia-draft-store');
    localStorage.removeItem('dalia_token');
    localStorage.removeItem('dalia_user');
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-base flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-400" />
            </div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Oups, DALIA a crashé</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Une erreur inattendue s'est produite. Ça arrive parfois quand les données locales sont corrompues.
            </p>
            {this.state.error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-left">
                <p className="text-xs text-red-400 font-mono break-all">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2.5 btn-primary font-semibold text-sm rounded-lg transition-colors"
              >
                <RefreshCw size={14} />
                Recharger
              </button>
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-4 py-2.5 btn-secondary font-medium text-sm rounded-lg transition-colors"
              >
                <Trash2 size={14} />
                Réinitialiser les données
              </button>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              « Réinitialiser » efface le cache local et te déconnecte. Ton compte serveur reste intact.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
