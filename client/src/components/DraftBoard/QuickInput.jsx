import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Zap, ChevronRight, SkipForward, Undo2 } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import RoleIcon from '../RoleIcon';
import { DRAFT_SEQUENCE, ROLES, ROLE_LABELS, draftStepLabel } from '../../lib/constants';

/**
 * QuickInput — "command-palette" style fast entry that follows LoL's real
 * draft sequence. For each sequence step it auto-targets the next empty slot
 * (ban index / enemy pick index / ally role chosen by the user) so the user
 * only needs to type the champion name and press Enter.
 *
 * Keyboard:
 *   - Type to filter • ↑/↓ to navigate • Enter to lock • Esc to clear
 *   - Tab cycles the role chip when an ally-pick step needs a role.
 */
export default function QuickInput({ champions }) {
  const {
    myTeam,
    myRole,
    blueBans, redBans,
    allyPicks, enemyPicks,
    setBan, setAllyPick, setEnemyPick,
    getAllUnavailableIds,
  } = useDraftStore();

  const unavailableIds = getAllUnavailableIds();

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [stepOverride, setStepOverride] = useState(null); // user jumped forward/back manually
  const [roleChoice, setRoleChoice] = useState(null);     // role selected for ally-pick step
  const inputRef = useRef(null);

  // ── Next target: walk DRAFT_SEQUENCE and find the first action whose slot isn't filled.
  const nextStepIndex = useMemo(() => {
    for (let i = 0; i < DRAFT_SEQUENCE.length; i++) {
      const s = DRAFT_SEQUENCE[i];
      if (s.type === 'ban') {
        const bans = s.team === 'blue' ? blueBans : redBans;
        if (!bans[s.slotIndex]) return i;
      } else {
        const isAlly = s.team === myTeam;
        if (isAlly) {
          // Ally pick: any unfilled ally role counts as "this ally pick slot"
          const filledCount = Object.values(allyPicks).filter(Boolean).length;
          if (filledCount <= s.slotIndex) return i;
        } else {
          if (!enemyPicks[s.slotIndex]) return i;
        }
      }
    }
    return DRAFT_SEQUENCE.length; // draft complete
  }, [blueBans, redBans, allyPicks, enemyPicks, myTeam]);

  const activeIndex = stepOverride ?? nextStepIndex;
  const activeStep = activeIndex < DRAFT_SEQUENCE.length ? DRAFT_SEQUENCE[activeIndex] : null;

  // Clear override once the user catches back up to organic progress
  useEffect(() => {
    if (stepOverride != null && nextStepIndex >= stepOverride) setStepOverride(null);
  }, [nextStepIndex, stepOverride]);

  // Default role choice for ally pick steps
  useEffect(() => {
    if (!activeStep) return;
    if (activeStep.type === 'pick' && activeStep.team === myTeam) {
      const emptyRoles = ROLES.filter((r) => !allyPicks[r]);
      if (emptyRoles.length === 0) { setRoleChoice(null); return; }
      if (!roleChoice || !emptyRoles.includes(roleChoice)) {
        setRoleChoice(emptyRoles.includes(myRole) ? myRole : emptyRoles[0]);
      }
    } else {
      setRoleChoice(null);
    }
  }, [activeStep, allyPicks, myRole, myTeam, roleChoice]);

  // ── Autocomplete: rank by prefix match, then substring, skip unavailable
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const list = [];
    for (const c of champions) {
      const name = c.name.toLowerCase();
      if (unavailableIds.has(c.id)) continue;
      let rank = -1;
      if (name.startsWith(q)) rank = 0;
      else if (name.includes(q)) rank = 1;
      else {
        // Initials / fuzzy: "ms" → "Miss Fortune"
        const parts = name.split(/\s|'/).filter(Boolean);
        if (parts.length > 1 && parts.every((p, i) => i >= q.length || p.startsWith(q[i]))) rank = 2;
      }
      if (rank >= 0) list.push({ champ: c, rank });
    }
    list.sort((a, b) => a.rank - b.rank || a.champ.name.localeCompare(b.champ.name));
    return list.slice(0, 8).map((x) => x.champ);
  }, [query, champions, unavailableIds]);

  useEffect(() => { setCursor(0); }, [query, activeIndex]);

  const commit = useCallback((champ) => {
    if (!champ || !activeStep) return;
    const payload = { id: champ.id, key: champ.key, name: champ.name };
    if (activeStep.type === 'ban') {
      setBan(activeStep.team, activeStep.slotIndex, payload);
    } else if (activeStep.team === myTeam) {
      const role = roleChoice || ROLES.find((r) => !allyPicks[r]) || myRole;
      setAllyPick(role, payload);
    } else {
      setEnemyPick(activeStep.slotIndex, payload);
    }
    setQuery('');
    setStepOverride(null);
    // keep focus for the next step
    inputRef.current?.focus();
  }, [activeStep, myTeam, myRole, roleChoice, allyPicks, setBan, setAllyPick, setEnemyPick]);

  const cycleRole = useCallback(() => {
    const empty = ROLES.filter((r) => !allyPicks[r]);
    if (empty.length < 2) return;
    const idx = empty.indexOf(roleChoice);
    setRoleChoice(empty[(idx + 1) % empty.length]);
  }, [allyPicks, roleChoice]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(matches.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (matches[cursor]) commit(matches[cursor]); }
    else if (e.key === 'Escape') { e.preventDefault(); setQuery(''); }
    else if (e.key === 'Tab' && activeStep?.type === 'pick' && activeStep.team === myTeam) {
      e.preventDefault(); cycleRole();
    }
  };

  const stepLabel = activeStep ? draftStepLabel(activeStep) : 'Draft complet';
  const isAllyPick = activeStep?.type === 'pick' && activeStep.team === myTeam;
  const emptyRoles = useMemo(() => ROLES.filter((r) => !allyPicks[r]), [allyPicks]);

  const prev = () => setStepOverride(Math.max(0, activeIndex - 1));
  const skip = () => setStepOverride(Math.min(DRAFT_SEQUENCE.length - 1, activeIndex + 1));

  return (
    <div className="card p-0 overflow-hidden">
      {/* Step strip */}
      <div className="flex items-stretch border-b border-border-subtle">
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-r border-border-subtle bg-surface-elevated/50">
          <Zap size={13} className="text-accent" />
          <span className="text-[10px] uppercase tracking-widest-2 font-semibold text-txt-muted">
            Saisie rapide
          </span>
        </div>

        <div className="flex-1 flex items-center gap-2 px-3 py-2 font-mono text-[11px] text-txt-secondary overflow-hidden">
          <span className="text-txt-muted tabular-nums">
            {String(Math.min(activeIndex + 1, DRAFT_SEQUENCE.length)).padStart(2, '0')}/20
          </span>
          <span className="text-border-strong">·</span>
          <span className={`font-semibold uppercase tracking-wider ${
            activeStep?.type === 'ban' ? 'text-loss' :
            activeStep?.team === myTeam ? 'text-accent' : 'text-txt-primary'
          }`}>
            {stepLabel}
          </span>
          {isAllyPick && emptyRoles.length > 0 && (
            <>
              <ChevronRight size={12} className="text-border-strong" />
              <div className="flex items-center gap-1">
                {emptyRoles.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRoleChoice(r)}
                    aria-pressed={roleChoice === r}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-xs border text-[10px] font-medium transition-all duration-150 ${
                      roleChoice === r
                        ? 'bg-accent-muted border-accent/40 text-accent'
                        : 'border-border-subtle text-txt-muted hover:text-txt-secondary hover:border-border-default'
                    }`}
                  >
                    <RoleIcon role={r} size={10} />
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 px-2 border-l border-border-subtle">
          <button
            onClick={prev}
            disabled={activeIndex === 0}
            title="Étape précédente"
            aria-label="Étape précédente"
            className="w-7 h-7 flex items-center justify-center rounded-sm text-txt-muted hover:text-txt-primary hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 size={13} />
          </button>
          <button
            onClick={skip}
            disabled={activeIndex >= DRAFT_SEQUENCE.length - 1}
            title="Passer l'étape"
            aria-label="Passer l'étape"
            className="w-7 h-7 flex items-center justify-center rounded-sm text-txt-muted hover:text-txt-primary hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <SkipForward size={13} />
          </button>
        </div>
      </div>

      {/* Search + autocomplete */}
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!activeStep}
          placeholder={activeStep ? `Tapez un champion pour ${stepLabel.toLowerCase()}…` : 'Draft complet'}
          autoFocus
          aria-label="Saisie rapide champion"
          className="w-full bg-transparent px-3.5 py-2.5 text-sm text-txt-primary placeholder:text-txt-muted
                     focus:outline-none focus:bg-surface-elevated/40 transition-colors tabular-nums"
        />

        {matches.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 z-30 bg-surface-card border border-border-default
                       rounded-sm shadow-lg mt-0.5 overflow-hidden"
            role="listbox"
          >
            {matches.map((c, i) => (
              <button
                key={c.id}
                onMouseEnter={() => setCursor(i)}
                onClick={() => commit(c)}
                role="option"
                aria-selected={cursor === i}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                  cursor === i ? 'bg-accent-muted text-txt-primary' : 'text-txt-secondary hover:bg-surface-hover'
                }`}
              >
                <img src={c.image_url} alt="" className="w-6 h-6 rounded-xs object-cover shrink-0" loading="lazy" />
                <span className="text-[13px] font-medium truncate flex-1">{c.name}</span>
                {c.roles?.slice(0, 2).map((r) => (
                  <RoleIcon key={r} role={r} size={11} className="text-txt-muted" />
                ))}
                {cursor === i && (
                  <span className="font-mono text-[9px] text-accent/70 uppercase tracking-widest-2">↵</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Help strip */}
      {query && matches.length === 0 && (
        <div className="px-3.5 py-2 text-[11px] text-txt-muted border-t border-border-subtle">
          Aucun champion — vérifiez qu'il n'est pas déjà ban/pick.
        </div>
      )}
      {!query && (
        <div className="px-3.5 py-1.5 text-[9px] font-mono uppercase tracking-widest-2 text-txt-muted
                        border-t border-border-subtle flex items-center gap-3">
          <span>↑↓ naviguer</span>
          <span>↵ valider</span>
          {isAllyPick && emptyRoles.length > 1 && <span>tab = rôle</span>}
          <span>esc effacer</span>
        </div>
      )}
    </div>
  );
}
