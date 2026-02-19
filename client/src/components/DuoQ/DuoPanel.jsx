/**
 * DuoQ Panel — Link with a friend, toggle duo mode, see partner info.
 *
 * Shown in the sidebar/settings area. Features:
 * - Show/copy your duo code
 * - Enter a friend's code to link
 * - When linked: show partner, their pool preview, toggle DuoQ mode
 * - Select partner's role
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Link2,
  Unlink,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Zap,
  Shield,
} from 'lucide-react';
import useDuoStore from '../../stores/duoStore';

const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
const ROLE_LABELS = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };
const ROLE_EMOJI = { top: '🛡️', jungle: '🌿', mid: '⚔️', bot: '🏹', support: '💛' };

export default function DuoPanel() {
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

  return (
    <div className="bg-surface rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/30">
        <Users size={18} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-200">DuoQ</h3>
        {linked && (
          <button
            onClick={toggleDuoActive}
            className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all
              ${duoActive
                ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40'
                : 'bg-slate-700/50 text-slate-400 hover:text-slate-300'
              }`}
          >
            <Zap size={12} />
            {duoActive ? 'Actif' : 'Inactif'}
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* My Code */}
        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
            Mon code duo
          </label>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 bg-slate-800/60 rounded-lg px-3 py-2 font-mono text-lg tracking-[0.3em] text-amber-400 text-center select-all">
              {myCode || '------'}
            </div>
            <button
              onClick={handleCopy}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
              title="Copier"
            >
              {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </button>
            <button
              onClick={regenerateCode}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
              title="Régénérer"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Partage ce code à ton ami pour vous lier en duo.
          </p>
        </div>

        {/* Link Section */}
        {!linked ? (
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
              Code d'un ami
            </label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={friendCode}
                onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={8}
                className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono tracking-widest text-center placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                onKeyDown={(e) => e.key === 'Enter' && handleLink()}
              />
              <button
                onClick={handleLink}
                disabled={!friendCode.trim() || loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                <Link2 size={14} />
                Lier
              </button>
            </div>
            {(linkError || error) && (
              <p className="text-xs text-red-400 mt-1">{linkError || error}</p>
            )}
          </div>
        ) : (
          <>
            {/* Partner Info */}
            <div className="bg-slate-800/40 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Shield size={16} className="text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{partner?.username}</p>
                    <p className="text-[10px] text-slate-500">
                      Lié depuis {partner?.linked_since
                        ? new Date(partner.linked_since).toLocaleDateString('fr-FR')
                        : '...'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleUnlink}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Se délier"
                >
                  <Unlink size={12} />
                  Délier
                </button>
              </div>

              {/* Partner Role Selector */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                  Rôle du partenaire
                </label>
                <div className="flex gap-1 mt-1">
                  {ROLES.map((role) => (
                    <button
                      key={role}
                      onClick={() => setPartnerRole(role)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all
                        ${partnerRole === role
                          ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
                          : 'bg-slate-700/30 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
                        }`}
                    >
                      <span className="block text-sm">{ROLE_EMOJI[role]}</span>
                      <span className="block text-[9px] mt-0.5">{ROLE_LABELS[role]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Partner Pool Preview */}
              {partnerPool && (
                <div>
                  <button
                    onClick={() => setShowPool(!showPool)}
                    className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-400 transition-colors"
                  >
                    Pool du partenaire
                    {showPool ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showPool && partnerRole && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(partnerPool[partnerRole] || []).length === 0 ? (
                        <p className="text-[10px] text-slate-600 italic">
                          Aucun champion pour ce rôle
                        </p>
                      ) : (
                        (partnerPool[partnerRole] || []).map((entry) => (
                          <div
                            key={entry.champion_id}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-700/40 text-xs"
                          >
                            <img
                              src={`https://ddragon.leagueoflegends.com/cdn/14.10.1/img/champion/${entry.champion_key}.png`}
                              alt={entry.champion_key}
                              className="w-5 h-5 rounded-sm"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <span className="text-slate-300">{entry.champion_key}</span>
                            <span className={`text-[9px] font-bold ${
                              entry.tier === 'S' ? 'text-amber-400' :
                              entry.tier === 'A' ? 'text-emerald-400' :
                              entry.tier === 'B' ? 'text-blue-400' :
                              'text-slate-500'
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
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5">
                <p className="text-[11px] text-amber-400/80 leading-relaxed">
                  <Zap size={11} className="inline mr-1" />
                  Mode DuoQ actif — la synergie avec <strong>{partner?.username}</strong> ({ROLE_LABELS[partnerRole] || '?'}) est fortement priorisée dans les recommandations.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
