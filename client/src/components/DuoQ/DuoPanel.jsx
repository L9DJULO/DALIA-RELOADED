/**
 * DuoQ Panel -- Link with a friend, toggle duo mode, see partner info.
 * Premium glass UI with violet accent.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Users, Link2, Unlink, Copy, Check, RefreshCw,
  ChevronDown, ChevronUp, Sparkles, Shield,
} from 'lucide-react';
import useDuoStore from '../../stores/duoStore';
import RoleIcon from '../RoleIcon';
import { ROLES, ROLE_LABELS, getDDragonChampUrl } from '../../lib/constants';

export default function DuoPanel({ embedded = false }) {
  const {
    duoActive, myCode, linked, partner, partnerPool, partnerRole,
    loading, error,
    loadDuoState, regenerateCode, linkWithCode, unlink,
    toggleDuoActive, setPartnerRole,
  } = useDuoStore();

  const [friendCode, setFriendCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPool, setShowPool] = useState(false);
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    loadDuoState();
  }, [loadDuoState]);

  const handleCopy = useCallback(() => {
    if (!myCode) return;
    navigator.clipboard.writeText(myCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [myCode]);

  const handleLink = useCallback(async () => {
    if (!friendCode.trim()) return;
    setLinkError('');
    const ok = await linkWithCode(friendCode.trim());
    if (ok) {
      setFriendCode('');
    } else {
      setLinkError(useDuoStore.getState().error || 'Erreur');
    }
  }, [friendCode, linkWithCode]);

  const handleUnlink = useCallback(async () => {
    await unlink();
  }, [unlink]);

  const content = (
    <div className={embedded ? 'space-y-5' : 'max-w-2xl mx-auto p-6 space-y-5'}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-muted border border-accent/20 flex items-center justify-center">
            <Users size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-txt-primary">DuoQ</h1>
            <p className="text-xs text-txt-muted">
              Lie-toi avec un partenaire pour booster vos recommandations de synergie
            </p>
          </div>
          {linked && (
            <button
              onClick={toggleDuoActive}
              className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                duoActive
                  ? 'bg-accent text-white shadow-glow'
                  : 'bg-surface-elevated text-txt-secondary border border-border-subtle hover:border-accent/30'
              }`}
            >
              <Sparkles size={13} />
              {duoActive ? 'Duo Actif' : 'Duo Inactif'}
            </button>
          )}
        </div>

        {/* My Code */}
        <div className="glass-card p-5 space-y-4">
          <div className="section-label">Mon code duo</div>
          <div className="flex items-center gap-2.5">
            <div className="flex-1 bg-surface-elevated rounded-xl px-4 py-3 font-mono text-xl tracking-[0.35em] text-accent text-center select-all border border-border-subtle">
              {myCode || '------'}
            </div>
            <button
              onClick={handleCopy}
              className="btn-secondary w-10 h-10 !p-0"
              title="Copier"
            >
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            </button>
            <button
              onClick={regenerateCode}
              className="btn-secondary w-10 h-10 !p-0"
              title="Regenerer"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <p className="text-[11px] text-txt-muted leading-relaxed">
            Partage ce code a ton ami pour vous lier en duo. Les recommandations prendront en compte vos champion pools respectifs.
          </p>
        </div>

        {/* Link Section */}
        {!linked ? (
          <div className="glass-card p-5 space-y-3">
            <div className="section-label">{"Code d'un ami"}</div>
            <div className="flex items-center gap-2.5">
              <input
                type="text"
                value={friendCode}
                onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={8}
                className="input-field flex-1 font-mono tracking-[0.25em] text-center text-lg"
                onKeyDown={(e) => e.key === 'Enter' && handleLink()}
              />
              <button
                onClick={handleLink}
                disabled={!friendCode.trim() || loading}
                className="btn-primary flex items-center gap-2"
              >
                <Link2 size={15} />
                Lier
              </button>
            </div>
            {(linkError || error) && (
              <p className="text-xs text-red-400">{linkError || error}</p>
            )}
          </div>
        ) : (
          <>
            {/* Partner Info */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center">
                    <Shield size={18} className="text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-txt-primary">{partner?.username}</p>
                    <p className="text-[11px] text-txt-muted">
                      Lie depuis {partner?.linked_since
                        ? new Date(partner.linked_since).toLocaleDateString('fr-FR')
                        : '...'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleUnlink}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors"
                  title="Se delier"
                >
                  <Unlink size={13} />
                  Delier
                </button>
              </div>

              {/* Partner Role Selector */}
              <div>
                <div className="section-label mb-2">Role du partenaire</div>
                <div className="flex gap-1.5">
                  {ROLES.map((role) => (
                    <button
                      key={role}
                      onClick={() => setPartnerRole(role)}
                      className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                        partnerRole === role
                          ? 'bg-accent text-white shadow-glow'
                          : 'bg-surface-elevated text-txt-muted hover:text-txt-secondary border border-border-subtle hover:border-accent/30'
                      }`}
                    >
                      <RoleIcon role={role} size={16} className={partnerRole === role ? 'text-white' : ''} />
                      <span className="text-[10px]">{ROLE_LABELS[role]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Partner Pool Preview */}
              {partnerPool && (
                <div>
                  <button
                    onClick={() => setShowPool(!showPool)}
                    className="flex items-center gap-1.5 section-label hover:text-txt-secondary transition-colors cursor-pointer"
                  >
                    Pool du partenaire
                    {showPool ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showPool && partnerRole && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5 animate-fade-in-up">
                      {(partnerPool[partnerRole] || []).length === 0 ? (
                        <p className="text-[11px] text-txt-muted italic">
                          Aucun champion pour ce role
                        </p>
                      ) : (
                        (partnerPool[partnerRole] || []).map((entry) => (
                          <div
                            key={entry.champion_id}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-elevated border border-border-subtle text-xs"
                          >
                            <img
                              src={getDDragonChampUrl(entry.champion_key)}
                              alt={entry.champion_key}
                              className="w-6 h-6 rounded-lg"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <span className="text-txt-secondary font-medium">{entry.champion_key}</span>
                            <span className={`text-[10px] font-bold ${
                              entry.tier === 'S' ? 'text-red-400' :
                              entry.tier === 'A' ? 'text-orange-400' :
                              entry.tier === 'B' ? 'text-amber-400' :
                              entry.tier === 'C' ? 'text-blue-400' :
                              'text-txt-muted'
                            }`}>
                              {entry.tier}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* DuoQ Mode Info */}
            {duoActive && (
              <div className="glass-card p-4 border-accent/15 bg-accent/[0.03] animate-fade-in-up">
                <p className="text-[12px] text-accent/80 leading-relaxed">
                  <Sparkles size={12} className="inline mr-1.5 text-accent" />
                  Mode DuoQ actif -- la synergie avec <strong className="text-accent">{partner?.username}</strong> ({ROLE_LABELS[partnerRole] || '?'}) est fortement priorisee dans les recommandations.
                </p>
              </div>
            )}
          </>
        )}

        {/* How it works */}
        <div className="glass-card p-5">
          <div className="section-label mb-3">Comment ca marche</div>
          <div className="space-y-2.5 text-[12px] text-txt-secondary leading-relaxed">
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-lg bg-accent-muted flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] text-accent font-bold">1</span>
              </div>
              <span>Partage ton code duo avec ton partenaire, ou entre le sien.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-lg bg-accent-muted flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] text-accent font-bold">2</span>
              </div>
              <span>Une fois lies, selectionnez vos roles respectifs.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-lg bg-accent-muted flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] text-accent font-bold">3</span>
              </div>
              <span>Activez le mode DuoQ pour que DALIA priorise la synergie entre vos champion pools dans les recommandations.</span>
            </div>
          </div>
        </div>
      </div>
  );

  if (embedded) {
    return <div className="p-5 overflow-y-auto">{content}</div>;
  }

  return (
    <div className="h-[calc(100vh-3rem)] overflow-y-auto">
      {content}
    </div>
  );
}
