import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

/**
 * Error Boundary -- Catches React render crashes and shows a recovery UI.
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
          <div className="max-w-md text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-lg font-bold text-txt-primary">Oups, DALIA a crashe</h1>
            <p className="text-sm text-txt-secondary leading-relaxed">
              {"Une erreur inattendue s'est produite. Ca arrive parfois quand les donnees locales sont corrompues."}
            </p>
            {this.state.error && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-left">
                <p className="text-xs text-red-400 font-mono break-all">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={this.handleReload}
                className="btn-primary flex items-center gap-2"
              >
                <RefreshCw size={14} />
                Recharger
              </button>
              <button
                onClick={this.handleReset}
                className="btn-secondary flex items-center gap-2"
              >
                <Trash2 size={14} />
                Reinitialiser les donnees
              </button>
            </div>
            <p className="text-[11px] text-txt-muted leading-relaxed">
              {"Reinitialiser efface le cache local et te deconnecte. Ton compte serveur reste intact."}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
