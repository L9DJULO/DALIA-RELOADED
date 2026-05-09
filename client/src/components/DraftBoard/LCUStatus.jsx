import React from 'react';
import { Wifi, WifiOff, Gamepad2 } from 'lucide-react';
import useLCUStore from '../../stores/lcuStore';

export default function LCUStatus({ compact = false }) {
  const connected     = useLCUStore(s => s.connected);
  const inChampSelect = useLCUStore(s => s.inChampSelect);
  const summoner      = useLCUStore(s => s.summoner);
  const connect       = useLCUStore(s => s.connect);

  const color = connected
    ? (inChampSelect ? 'var(--win)' : 'var(--text-muted)')
    : 'var(--text-muted)';
  const label = connected
    ? (inChampSelect ? 'CHAMP SELECT' : 'CONNECTÉ')
    : 'DÉCONNECTÉ';
  const Icon = connected ? (inChampSelect ? Gamepad2 : Wifi) : WifiOff;

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--f-mono)', fontSize: 10, color, letterSpacing: '0.1em' }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: color,
          boxShadow: inChampSelect ? `0 0 6px ${color}` : 'none',
          animation: inChampSelect ? 'pulse-soft 1.8s ease-in-out infinite' : 'none',
        }}/>
        <Icon size={11}/>
        {label}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px',
      background: 'var(--surface-card)',
      border: `2px solid ${connected ? 'var(--border-default)' : 'var(--border-subtle)'}`,
    }}>
      <span style={{
        width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0,
        boxShadow: inChampSelect ? `0 0 6px ${color}` : 'none',
        animation: inChampSelect ? 'pulse-soft 1.8s ease-in-out infinite' : 'none',
      }}/>
      <Icon size={16} style={{ color }}/>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 12, letterSpacing: '0.12em', color }}>{label}</div>
        {summoner && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {summoner.gameName}#{summoner.tagLine}
          </div>
        )}
      </div>
      {!connected && (
        <button onClick={connect} className="btn-secondary btn-sm">CONNECTER</button>
      )}
    </div>
  );
}
