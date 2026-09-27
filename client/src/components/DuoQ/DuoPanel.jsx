import React, { useEffect, useId, useState } from 'react';
import { Copy, CheckCircle2, RefreshCw } from 'lucide-react';
import useDuoStore from '../../stores/duoStore';
import { ROLES } from '../../lib/constants';
import { ROLE_LABEL } from '../../data/mock';
import { SectionLbl } from '../Primitives';

export default function DuoPanel() {
  const {
    duoActive, myCode, linked, partner, partnerRole,
    loading, linking, error,
    loadDuoState, linkWithCode, unlink, toggleDuoActive,
    setPartnerRole, regenerateCode, clearError,
  } = useDuoStore();

  const [linkCode, setLinkCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const codeId = useId();

  useEffect(() => { loadDuoState(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = () => {
    if (!myCode) return;
    navigator.clipboard.writeText(myCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleLink = async () => {
    const ok = await linkWithCode(linkCode);
    if (ok) setLinkCode('');
  };

  return (
    <div className="duo">
      <header className="page-head">
        <div>
          <h1 className="page-head__title">Duo Q</h1>
          <p className="page-head__sub">Lie ton compte à celui de ton duo : l'analyse tient compte de son rôle et de son pool.</p>
        </div>
        {linked && (
          <div className="page-head__aside">
            <button className={`btn ${duoActive ? 'btn--primary' : ''}`} aria-pressed={duoActive} onClick={toggleDuoActive}>
              {duoActive ? 'Duo actif' : 'Activer le duo'}
            </button>
          </div>
        )}
      </header>

      <div className="duo__body">
        {error && (
          <div className="notice notice--bad duo__error" role="alert">
            <span>{typeof error === 'string' ? error : error.message}</span>
            <button className="btn btn--sm btn--ghost" onClick={clearError}>Fermer</button>
          </div>
        )}

        <section className="panel">
          <SectionLbl n={1}>Mon code duo</SectionLbl>
          {loading && !myCode ? (
            <p className="muted" role="status">Chargement…</p>
          ) : myCode ? (
            <div className="duo__code-row">
              <output className="duo__code" aria-label="Mon code duo">{myCode}</output>
              <button className="btn btn--icon" aria-label={copied ? 'Code copié' : 'Copier le code'} title={copied ? 'Code copié' : 'Copier le code'} onClick={handleCopy}>
                {copied ? <CheckCircle2 size={16} aria-hidden="true"/> : <Copy size={16} aria-hidden="true"/>}
              </button>
              <button className="btn btn--icon" aria-label="Régénérer le code" title="Régénérer le code" aria-expanded={confirmRegen} onClick={() => setConfirmRegen(v => !v)}>
                <RefreshCw size={16} aria-hidden="true"/>
              </button>
            </div>
          ) : (
            <button className="btn" onClick={loadDuoState}>Charger mon code</button>
          )}
          {confirmRegen && (
            <div className="notice notice--warn duo__confirm">
              <span>Un nouveau code remplace l'actuel : ton duo devra entrer le nouveau.</span>
              <span className="duo__confirm-actions">
                <button className="btn btn--sm btn--danger" onClick={() => { regenerateCode(); setConfirmRegen(false); }}>Régénérer</button>
                <button className="btn btn--sm btn--ghost" onClick={() => setConfirmRegen(false)}>Annuler</button>
              </span>
            </div>
          )}
        </section>

        {!linked ? (
          <section className="panel">
            <SectionLbl n={2}>Code du partenaire</SectionLbl>
            <div className="duo__link">
              <label htmlFor={codeId} className="visually-hidden">Code duo du partenaire</label>
              <input
                id={codeId}
                className="field field--big"
                value={linkCode}
                onChange={e => setLinkCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleLink(); }}
                placeholder="Code à 6 caractères"
                maxLength={8}
                autoComplete="off"
                spellCheck={false}
              />
              <button className="btn btn--primary" onClick={handleLink} disabled={linking || !linkCode.trim()}>
                {linking ? 'Liaison…' : 'Lier'}
              </button>
            </div>
            {!loading && <p className="muted duo__help">Partage ton code à ton duo ou entre le sien. Une fois liés, active le duo pour que l'analyse compte vos synergies.</p>}
          </section>
        ) : (
          <section className="panel panel--lift duo__partner">
            <div className="duo__partner-head">
              <div>
                <p className="duo__partner-name">{partner?.username || '—'}</p>
                <p className="duo__linked"><span className="dot dot--on" aria-hidden="true"/>Lié</p>
              </div>
              {confirmUnlink ? (
                <span className="duo__confirm-actions" role="group" aria-label="Confirmer">
                  <button className="btn btn--sm btn--danger" onClick={() => { unlink(); setConfirmUnlink(false); }} disabled={linking}>Délier {partner?.username || ''}</button>
                  <button className="btn btn--sm btn--ghost" onClick={() => setConfirmUnlink(false)}>Annuler</button>
                </span>
              ) : (
                <button className="btn btn--sm btn--danger" onClick={() => setConfirmUnlink(true)} disabled={linking}>Délier</button>
              )}
            </div>
            <p className="field-label">Rôle du partenaire</p>
            <div className="seg seg--fill" role="group" aria-label="Rôle du partenaire">
              {ROLES.map(r => (
                <button key={r} aria-pressed={partnerRole === r} onClick={() => setPartnerRole(r)}>{ROLE_LABEL[r]}</button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
