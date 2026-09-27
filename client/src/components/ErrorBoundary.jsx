import React from 'react';

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null, info: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[DALIA ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="crash" role="alert">
        <div className="crash__box se-corners">
          <h1 className="crash__title">Erreur critique</h1>
          <p className="crash__sub">Une erreur inattendue a interrompu l'application. Recharge-la pour reprendre ; la draft en cours sera réinitialisée.</p>
          <pre className="crash__msg">{this.state.error?.message || 'Erreur inconnue'}</pre>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>Recharger l'application</button>
        </div>
      </div>
    );
  }
}
