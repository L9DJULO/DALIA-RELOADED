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
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--surface-base)', padding: 32,
      }}>
        <div style={{
          background: 'var(--surface-card)',
          border: '2.5px solid var(--loss-border)',
          padding: '32px 36px',
          maxWidth: 520, width: '100%',
          boxShadow: '6px 6px 0 var(--loss)',
        }}>
          {/* Corner accents */}
          <div style={{ position: 'absolute', top: -2, left: -2, width: 16, height: 16, borderTop: '2px solid var(--loss)', borderLeft: '2px solid var(--loss)' }}/>
          <div style={{ position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderBottom: '2px solid var(--loss)', borderRight: '2px solid var(--loss)' }}/>

          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 26, letterSpacing: '0.15em', color: 'var(--loss)', marginBottom: 4 }}>
            ERREUR CRITIQUE
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 20 }}>
            Une erreur inattendue a interrompu l'application
          </div>

          <div style={{
            padding: '12px 14px',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
            fontFamily: 'var(--f-mono)', fontSize: 11,
            color: 'var(--loss)',
            lineHeight: 1.7,
            marginBottom: 24,
            wordBreak: 'break-word',
          }}>
            {this.state.error?.message || 'Erreur inconnue'}
          </div>

          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              background: 'var(--accent)', color: '#000',
              border: '2px solid #f0ebe0', boxShadow: '3px 3px 0 #f0ebe0',
              fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.2em',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
              transition: 'transform 0.1s, box-shadow 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translate(-1px,-1px)'; e.currentTarget.style.boxShadow = '4px 4px 0 #f0ebe0'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '3px 3px 0 #f0ebe0'; }}
          >
            ↺ RECHARGER L'APPLICATION
          </button>
        </div>
      </div>
    );
  }
}
