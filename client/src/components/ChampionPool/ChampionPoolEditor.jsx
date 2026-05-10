// ─────────────────────────────────────────────
// Champion Pool — Two-pane editor
// ─────────────────────────────────────────────
// LEFT  : ton pool, groupé par tier (S→D), promote/demote/remove inline
// RIGHT : picker des champs du rôle pas encore dans le pool (clic = ajout)
// Auto-save côté backend.
// ─────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import useUserStore from '../../stores/userStore';
import useChampionsStore from '../../stores/championsStore';
import { ROLES, TIERS, getDDragonChampUrl } from '../../lib/constants';
import { champIcon, ROLE_LABEL } from '../../data/mock';

const TIER_COLOR = {
  S: 'var(--accent)',
  A: 'var(--ok)',
  B: 'var(--bone-0)',
  C: 'var(--bone-2)',
  D: 'var(--bone-3)',
};

const TIER_HINT = {
  S: 'PRIORITAIRE',
  A: 'TRÈS BON',
  B: 'STANDARD',
  C: 'OCCASIONNEL',
  D: 'BACKUP',
};

function champImg(champ) {
  if (!champ) return null;
  return champ.image_url || (champ.key && getDDragonChampUrl(champ.key)) || (champ.key && champIcon(champ.key));
}

// ── Mini bouton inline (↑ ↓ ×) ──────────────────────────────────────
function MiniBtn({ label, color, disabled, title, onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
      disabled={disabled}
      title={title}
      style={{
        width: 20, height: 20,
        background: disabled ? 'var(--ink-3)' : 'var(--ink-0)',
        color: disabled ? 'var(--bone-3)' : (color || 'var(--bone-0)'),
        border: `1.5px solid ${disabled ? 'var(--ink-5)' : (color || 'var(--bone-0)')}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 12, lineHeight: 1,
        padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {label}
    </button>
  );
}

// ── Carte d'un champion DANS le pool (LEFT pane) ────────────────────
function PoolCard({ champ, tier, onPromote, onDemote, onRemove }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        width: 78, flexShrink: 0,
        background: 'var(--ink-2)',
        border: `2px solid var(--accent)`,
        boxShadow: '3px 3px 0 var(--ink-0)',
        textAlign: 'center',
      }}
    >
      <img
        src={champImg(champ)}
        alt={champ.name}
        style={{ width: '100%', height: 64, objectFit: 'cover', display: 'block' }}
      />
      <div style={{
        padding: '3px 4px',
        fontFamily: 'var(--f-display)', fontSize: 9, fontWeight: 700,
        letterSpacing: '0.04em', color: 'var(--bone-0)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        background: 'var(--ink-3)',
      }}>
        {champ.name.toUpperCase()}
      </div>

      {/* Hover overlay : ↑ ↓ × */}
      {hovered && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5,
          background: 'rgba(11,11,11,0.82)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 5,
        }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <MiniBtn label="↑" disabled={tier === 'S'} title="Monter d'un tier"
              color="var(--ok)" onClick={onPromote}/>
            <MiniBtn label="↓" disabled={tier === 'D'} title="Descendre d'un tier"
              color="var(--bone-2)" onClick={onDemote}/>
          </div>
          <MiniBtn label="×" title="Retirer du pool"
            color="var(--accent)" onClick={onRemove}/>
        </div>
      )}
    </div>
  );
}

// ── Carte d'un champion DISPONIBLE (RIGHT pane picker) ──────────────
function PickCard({ champ, onAdd }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onAdd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Ajouter ${champ.name} au pool (tier B)`}
      style={{
        position: 'relative',
        width: 64, flexShrink: 0,
        background: 'var(--ink-2)',
        border: `1.5px solid ${hovered ? 'var(--accent)' : 'var(--ink-5)'}`,
        boxShadow: hovered ? '2px 2px 0 var(--ink-0)' : 'none',
        cursor: 'pointer',
        padding: 0,
        textAlign: 'center',
        transform: hovered ? 'translate(-1px,-1px)' : 'none',
        transition: 'transform 0.08s, box-shadow 0.08s, border-color 0.08s',
      }}
    >
      <img
        src={champImg(champ)}
        alt={champ.name}
        style={{
          width: '100%', height: 52, objectFit: 'cover', display: 'block',
          opacity: hovered ? 1 : 0.85,
          filter: hovered ? 'none' : 'grayscale(40%)',
          transition: 'opacity 0.1s, filter 0.1s',
        }}
      />
      <div style={{
        padding: '2px 3px',
        fontFamily: 'var(--f-display)', fontSize: 8, fontWeight: 700,
        letterSpacing: '0.04em',
        color: hovered ? 'var(--accent)' : 'var(--bone-2)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {champ.name.toUpperCase()}
      </div>
      {hovered && (
        <div style={{
          position: 'absolute', top: 3, right: 3, zIndex: 2,
          width: 16, height: 16,
          background: 'var(--accent)', color: 'var(--accent-ink)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 12, lineHeight: 1,
        }}>+</div>
      )}
    </button>
  );
}

// ── Une rangée de tier dans le pool (S, A, B, C, D) ─────────────────
function TierRow({ tier, entries, champById, onPromote, onDemote, onRemove }) {
  const color = TIER_COLOR[tier];
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '10px 0',
      borderBottom: '1px solid var(--ink-5)',
    }}>
      {/* Tier badge column */}
      <div style={{ width: 60, flexShrink: 0, textAlign: 'center', paddingTop: 2 }}>
        <div style={{
          width: 38, height: 38, margin: '0 auto',
          background: color,
          color: 'var(--ink-0)',
          fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '2px 2px 0 var(--ink-0)',
        }}>{tier}</div>
        <div style={{
          fontFamily: 'var(--f-mono)', fontSize: 8, letterSpacing: '0.08em',
          color: 'var(--bone-3)', marginTop: 5,
        }}>{TIER_HINT[tier]}</div>
        <div style={{
          fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--bone-2)', marginTop: 2,
        }}>{entries.length}</div>
      </div>

      {/* Cards column */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 92 }}>
        {entries.length === 0 ? (
          <div style={{
            height: 84, display: 'flex', alignItems: 'center',
            paddingLeft: 4,
            fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.08em',
            color: 'var(--bone-3)', fontStyle: 'italic',
          }}>
            (aucun champion en {tier})
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {entries.map(e => {
              const champ = champById[e.champion_id];
              if (!champ) return null;
              return (
                <PoolCard key={e.champion_id}
                  champ={champ} tier={tier}
                  onPromote={() => onPromote(e.champion_id, tier)}
                  onDemote={() => onDemote(e.champion_id, tier)}
                  onRemove={() => onRemove(e.champion_id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────
export default function ChampionPoolEditor() {
  const { championPool, addToPool, removeFromPool, changeTier, loadProfile } = useUserStore();
  const { champions, loaded, loading, load } = useChampionsStore();

  const [activeRole, setActiveRole] = useState('mid');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAllChamps, setShowAllChamps] = useState(false);

  useEffect(() => { load(); loadProfile(); }, [load, loadProfile]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const poolForRole = championPool[activeRole] || [];

  // Lookup : champion id → champion
  const champById = useMemo(() => {
    const m = {};
    for (const c of champions) m[c.id] = c;
    return m;
  }, [champions]);

  // Lookup : champion id → entry (for current role)
  const poolByChampId = useMemo(() => {
    const m = {};
    for (const e of poolForRole) m[e.champion_id] = e;
    return m;
  }, [poolForRole]);

  // Pool entries grouped by tier (S → D), sorted alpha within each tier
  const entriesByTier = useMemo(() => {
    const groups = { S: [], A: [], B: [], C: [], D: [] };
    for (const e of poolForRole) {
      const t = TIERS.includes(e.tier) ? e.tier : 'B';
      groups[t].push(e);
    }
    for (const t of TIERS) {
      groups[t].sort((a, b) => {
        const an = champById[a.champion_id]?.name || '';
        const bn = champById[b.champion_id]?.name || '';
        return an.localeCompare(bn);
      });
    }
    return groups;
  }, [poolForRole, champById]);

  // Picker = champs du rôle pas encore dans le pool, filtrés par recherche
  const availableChamps = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    let list = champions.filter(c =>
      (showAllChamps || (Array.isArray(c.roles) ? c.roles.includes(activeRole) : true))
      && !poolByChampId[c.id]
    );
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q));
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [champions, activeRole, debouncedSearch, poolByChampId, showAllChamps]);

  const totalCount = ROLES.reduce((sum, r) => sum + (championPool[r]?.length || 0), 0);
  const roleCount = poolForRole.length;

  const handlePromote = (champId, currentTier) => {
    const idx = TIERS.indexOf(currentTier);
    if (idx > 0) changeTier(activeRole, champId, TIERS[idx - 1]);
  };
  const handleDemote = (champId, currentTier) => {
    const idx = TIERS.indexOf(currentTier);
    if (idx >= 0 && idx < TIERS.length - 1) changeTier(activeRole, champId, TIERS[idx + 1]);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ink-0)' }}>

      {/* Header */}
      <div style={{
        padding: '12px 20px', flexShrink: 0,
        background: 'var(--ink-1)',
        borderBottom: 'var(--edge-weight) solid var(--bone-0)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 20, letterSpacing: '0.18em', color: 'var(--bone-0)' }}>
            CHAMPION POOL
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--bone-2)', letterSpacing: '0.08em', marginTop: 1 }}>
            GAUCHE = TON POOL (S→D) · DROITE = AJOUTER · HOVER = ↑ ↓ × · SAUVEGARDE AUTO
          </div>
        </div>
        <div style={{
          fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.18em',
          color: 'var(--accent)', padding: '6px 12px',
          border: '1.5px solid var(--accent)', flexShrink: 0,
        }}>
          {String(totalCount).padStart(2, '0')} CHAMPIONS DANS TON POOL
        </div>
      </div>

      {/* Role tabs */}
      <div style={{ display: 'flex', flexShrink: 0, background: 'var(--ink-1)', borderBottom: '1px solid var(--ink-5)' }}>
        {ROLES.map(r => {
          const count = championPool[r]?.length || 0;
          const isActive = activeRole === r;
          return (
            <button key={r} onClick={() => { setActiveRole(r); setSearch(''); }}
              style={{
                flex: 1, padding: '9px 0',
                fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.18em',
                background: isActive ? 'var(--ink-2)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--bone-2)',
                border: 'none',
                borderBottom: isActive ? 'var(--edge-weight) solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.1s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}
            >
              {ROLE_LABEL[r]}
              {count > 0 && (
                <span style={{
                  fontFamily: 'var(--f-mono)', fontSize: 9,
                  padding: '1px 5px',
                  color: isActive ? 'var(--accent)' : 'var(--bone-3)',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--ink-5)'}`,
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body — two-pane */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT — POOL by tier */}
        <div style={{
          flex: '1 1 60%', minWidth: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--ink-5)',
          background: 'var(--ink-0)',
        }}>
          <div style={{
            padding: '10px 16px', flexShrink: 0,
            background: 'var(--ink-1)',
            borderBottom: '1px solid var(--ink-5)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{
              fontFamily: 'var(--f-display)', fontSize: 12, fontWeight: 700,
              letterSpacing: '0.18em', color: 'var(--bone-0)',
            }}>
              TON POOL — {ROLE_LABEL[activeRole]}
            </div>
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.12em',
              color: 'var(--bone-2)',
            }}>
              {roleCount} {roleCount > 1 ? 'CHAMPIONS' : 'CHAMPION'}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px' }}>
            {(!loaded && loading) && (
              <div style={{ textAlign: 'center', padding: 40, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bone-2)', letterSpacing: '0.08em' }}>
                CHARGEMENT…
              </div>
            )}
            {loaded && roleCount === 0 && (
              <div style={{
                textAlign: 'center', padding: '40px 20px',
                fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bone-3)', letterSpacing: '0.08em',
                lineHeight: 1.6,
              }}>
                Pool vide pour {ROLE_LABEL[activeRole]}.<br/>
                Ajoute des champions depuis le panneau de droite →
              </div>
            )}
            {loaded && roleCount > 0 && TIERS.map(t => (
              <TierRow key={t}
                tier={t}
                entries={entriesByTier[t]}
                champById={champById}
                onPromote={handlePromote}
                onDemote={handleDemote}
                onRemove={(id) => removeFromPool(activeRole, id)}
              />
            ))}
          </div>
        </div>

        {/* RIGHT — picker */}
        <div style={{
          flex: '1 1 40%', minWidth: 320,
          display: 'flex', flexDirection: 'column',
          background: 'var(--ink-1)',
        }}>
          <div style={{
            padding: '10px 16px', flexShrink: 0,
            borderBottom: '1px solid var(--ink-5)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{
              fontFamily: 'var(--f-display)', fontSize: 12, fontWeight: 700,
              letterSpacing: '0.18em', color: 'var(--bone-0)',
            }}>
              AJOUTER — {ROLE_LABEL[activeRole]}
            </div>
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.12em',
              color: 'var(--bone-2)',
            }}>
              {availableChamps.length} DISPO
            </div>
          </div>

          <div style={{
            padding: '10px 16px', flexShrink: 0,
            borderBottom: '1px solid var(--ink-5)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={showAllChamps ? 'Rechercher tous les champions...' : `Rechercher ${ROLE_LABEL[activeRole]}...`}
              style={{
                flex: 1, padding: '7px 12px',
                background: 'var(--ink-3)',
                border: '1.5px solid var(--ink-5)',
                color: 'var(--bone-0)',
                fontFamily: 'var(--f-mono)', fontSize: 11, outline: 'none',
                transition: 'border-color 0.1s',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--ink-5)'; }}
            />
            <button
              onClick={() => setShowAllChamps(v => !v)}
              title={showAllChamps ? 'Afficher seulement les champions du role' : 'Afficher tous les champions'}
              style={{
                flexShrink: 0,
                minWidth: 58,
                padding: '7px 10px',
                background: showAllChamps ? 'var(--accent)' : 'var(--ink-3)',
                color: showAllChamps ? 'var(--accent-ink)' : 'var(--bone-2)',
                border: `1.5px solid ${showAllChamps ? 'var(--accent)' : 'var(--ink-5)'}`,
                cursor: 'pointer',
                fontFamily: 'var(--f-display)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
              }}
            >
              {showAllChamps ? 'TOUS' : 'ROLE'}
            </button>
            {search && (
              <button onClick={() => setSearch('')}
                style={{
                  background: 'none', border: 'none', color: 'var(--bone-2)',
                  cursor: 'pointer', fontFamily: 'var(--f-mono)', fontSize: 14,
                  padding: '4px 8px',
                }}>×</button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
            {(!loaded && loading) && (
              <div style={{ textAlign: 'center', padding: 40, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bone-2)', letterSpacing: '0.08em' }}>
                CHARGEMENT…
              </div>
            )}
            {loaded && availableChamps.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '40px 20px',
                fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bone-3)', letterSpacing: '0.08em',
                lineHeight: 1.6,
              }}>
                {search
                  ? `Aucun résultat pour « ${search} »`
                  : 'Tous les champions de ce rôle sont déjà dans ton pool ✓'}
              </div>
            )}
            {availableChamps.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableChamps.map(c => (
                  <PickCard key={c.id} champ={c} onAdd={() => addToPool(activeRole, c, 'B')}/>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
