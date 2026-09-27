// ─────────────────────────────────────────────
// Settings page — compte, client League, préférences d'analyse
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import useLCUStore from '../../stores/lcuStore';
import useAuthStore from '../../stores/authStore';
import useUserStore from '../../stores/userStore';
import { SectionLbl } from '../Primitives';
import DraftPreferences from './DraftPreferences';

export default function SettingsPage() {
  const [connecting, setConnecting] = useState(false);
  const lcuConnected = useLCUStore(s => s.connected);
  const summoner = useLCUStore(s => s.summoner);
  const lcuConnect = useLCUStore(s => s.connect);
  const user = useAuthStore(s => s.user);
  const userLogout = useUserStore(s => s.logout);

  const handleLCUConnect = async () => {
    setConnecting(true);
    await lcuConnect();
    setConnecting(false);
  };

  return (
    <div className="page settings">
      <header className="page-head">
        <div>
          <h1 className="page-head__title">Paramètres</h1>
          <p className="page-head__sub">Compte, client League et préférences d'analyse.</p>
        </div>
      </header>

      <div className="settings__body">
        {user && (
          <section className="panel">
            <SectionLbl n={1}>Compte</SectionLbl>
            <p className="settings__user">{user.username}</p>
            <p className="muted">{user.email}</p>
          </section>
        )}

        <section className="panel">
          <SectionLbl n={2}>Client League</SectionLbl>
          <div className="settings__lcu">
            <span className={`dot ${lcuConnected ? 'dot--on' : ''}`} aria-hidden="true"/>
            <span className={lcuConnected ? 'settings__lcu-on' : 'muted'}>{lcuConnected ? 'Connecté' : 'Non connecté'}</span>
            {!lcuConnected && (
              <button className="btn btn--sm" onClick={handleLCUConnect} disabled={connecting}>
                {connecting ? 'Connexion…' : 'Connecter'}
              </button>
            )}
          </div>
          {summoner && (
            <div className="settings__summoner">
              <p>{summoner.gameName}<span className="muted"> #{summoner.tagLine}</span></p>
              <p className="lbl">Niveau {summoner.summonerLevel} · {summoner.region || 'EUW'}</p>
            </div>
          )}
          <p className="muted settings__note">DALIA lit la sélection des champions dans le client League pour remplir la draft. Disponible uniquement dans l'application de bureau.</p>
        </section>

        <DraftPreferences n={3}/>

        {user && (
          <section className="settings__logout">
            <button className="btn btn--danger btn--block" onClick={userLogout}>Se déconnecter</button>
            <p className="muted">Vide le jeton, le profil et le pool de cet appareil, puis revient à la connexion.</p>
          </section>
        )}
      </div>
    </div>
  );
}
