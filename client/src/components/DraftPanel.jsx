// ─────────────────────────────────────────────
// DraftPanel.jsx — RIGHT column
// · Board (blue / red picks + bans) — slots cliquables
// · Pick-order timeline
// · Reasoning (analysis of selected pick)
// ─────────────────────────────────────────────
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { DRAFT, SHORTLIST, ROLE_LABEL, champIcon } from '../data/mock';
import { Portrait, SectionLbl, Bar, Delta, RoleChip, ReasonBullet } from './Primitives';
import useDraftStore from '../stores/draftStore';
import useChampionsStore from '../stores/championsStore';

const DD = 'https://ddragon.leagueoflegends.com/cdn/14.8.1/img/champion';
const ddIcon = (key) => `${DD}/${key}.png`;
const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];

// ── Champion search overlay ─────────────────────
function ChampionSearch({ onSelect, onClose, unavailable }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef(null);
  const { champions, loaded, load } = useChampionsStore();

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  const suggestions = useMemo(() => {
    if (debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    return champions
      .filter(c => !unavailable.has(c.id) && c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [debouncedQuery, champions, unavailable]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--ink-1)',
          border: 'var(--edge-weight) solid var(--bone-0)',
          padding: 16, width: 320,
          boxShadow: '4px 4px 0 var(--bone-0)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()}
          placeholder="Rechercher un champion..."
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--ink-3)', border: '1px solid var(--ink-5)',
            color: 'var(--bone-0)', outline: 'none',
            fontFamily: 'var(--f-mono)', fontSize: 13,
            padding: '8px 10px',
          }}
        />
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {suggestions.map(c => (
            <div
              key={c.id}
              onClick={() => onSelect(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 8px', cursor: 'pointer',
                borderBottom: '1px solid var(--ink-5)',
                transition: 'background 0.08s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--ink-3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <img src={ddIcon(c.key)} alt={c.name} style={{ width: 32, height: 32, objectFit: 'cover' }} />
              <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 12, color: 'var(--bone-0)' }}>
                {c.name.toUpperCase()}
              </span>
            </div>
          ))}
          {query.length >= 2 && suggestions.length === 0 && (
            <div style={{ padding: '8px 10px', color: 'var(--bone-3)', fontFamily: 'var(--f-mono)', fontSize: 11 }}>
              Aucun résultat
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Board slot (pick) ───────────────────────────
function PickSlot({ role, champ, side, onClick }) {
  const isRight = side === 'red';
  const isEmpty = !champ;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: isRight ? '1fr 52px 44px' : '44px 52px 1fr',
        alignItems: 'center', gap: 8,
        padding: '5px 0',
        borderBottom: '1px solid var(--ink-5)',
        cursor: isEmpty ? 'pointer' : 'default',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (isEmpty) e.currentTarget.style.background = 'var(--ink-4)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bone-2)',
        letterSpacing: '0.1em',
        order: isRight ? 3 : 1,
        textAlign: isRight ? 'right' : 'left',
      }}>
        {role ? (ROLE_LABEL[role] ?? role) : ''}
      </span>

      <div style={{ position: 'relative', order: 2 }}>
        <Portrait champ={champ} size={52} />
      </div>

      <span style={{
        fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 13,
        letterSpacing: '0.04em',
        color: champ ? 'var(--bone-0)' : isEmpty ? 'var(--bone-4)' : 'var(--bone-3)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        order: isRight ? 1 : 3,
        textAlign: isRight ? 'right' : 'left',
      }}>
        {champ ? champ.name.toUpperCase() : isEmpty ? '+ AJOUTER' : '——'}
      </span>
    </div>
  );
}

// ── Ban slot ────────────────────────────────────
function BanSlot({ champ, onClick }) {
  return (
    <div
      onClick={onClick}
      title={champ ? champ.name : 'Cliquer pour bannir'}
      style={{
        width: 22, height: 22, cursor: champ ? 'default' : 'pointer',
        border: champ ? 'none' : '1px dashed var(--ink-5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: champ ? 'transparent' : 'var(--ink-4)',
        transition: 'background 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!champ) e.currentTarget.style.background = 'var(--ink-3)'; }}
      onMouseLeave={e => { if (!champ) e.currentTarget.style.background = 'var(--ink-4)'; }}
    >
      {champ
        ? <Portrait champ={champ} size={22} banned />
        : <span style={{ color: 'var(--bone-4)', fontSize: 10, fontFamily: 'var(--f-mono)' }}>+</span>
      }
    </div>
  );
}

// ── Ban suggestions banner ──────────────────────
function BanSuggestionsBanner() {
  const banSuggestions = useDraftStore(s => s.banSuggestions);
  if (!banSuggestions || banSuggestions.length === 0) return null;

  return (
    <div style={{
      padding: '8px 16px',
      background: 'var(--ink-2)',
      borderBottom: 'var(--edge-weight) solid var(--bone-0)',
      display: 'flex', alignItems: 'center', gap: 10,
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: 'var(--f-mono)', fontSize: 9,
        color: 'var(--accent)', letterSpacing: '0.18em',
        padding: '3px 8px', border: '1.5px solid var(--accent)',
        flexShrink: 0,
      }}>
        ⚔ BAN
      </span>
      <div style={{ display: 'flex', gap: 8, flex: 1, overflowX: 'auto' }}>
        {banSuggestions.slice(0, 3).map((b, i) => (
          <div key={b.champion_id} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '4px 9px',
            background: 'var(--ink-3)',
            border: '1.5px solid var(--ink-5)',
            borderLeft: '3px solid var(--accent)',
            minWidth: 0, flexShrink: 0,
          }}>
            <img
              src={ddIcon(b.champion_key)}
              alt={b.champion_name}
              style={{ width: 26, height: 26, objectFit: 'cover', flexShrink: 0 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{
                fontFamily: 'var(--f-display)', fontWeight: 700,
                fontSize: 11, letterSpacing: '0.06em',
                color: 'var(--bone-0)',
                whiteSpace: 'nowrap',
              }}>
                {b.champion_name.toUpperCase()}
              </span>
              <span style={{
                fontFamily: 'var(--f-mono)', fontSize: 9,
                color: 'var(--bone-2)', letterSpacing: '0.04em',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                maxWidth: 200,
              }} title={b.reason}>
                {b.reason}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Board ───────────────────────────────────────
function Board() {
  const {
    myTeam, allyPicks, enemyPicks, blueBans, redBans,
    setBan, setAllyPick, setEnemyPick, getAllUnavailableIds,
  } = useDraftStore();

  const [activeSlot, setActiveSlot] = useState(null);

  const blueIsAlly = myTeam === 'blue';

  // Build role-keyed display picks for each side
  const bluePicks = useMemo(() => {
    if (blueIsAlly) return allyPicks;
    return ROLES.reduce((acc, r, i) => { acc[r] = enemyPicks[i] ?? null; return acc; }, {});
  }, [blueIsAlly, allyPicks, enemyPicks]);

  const redPicks = useMemo(() => {
    if (!blueIsAlly) return allyPicks;
    return ROLES.reduce((acc, r, i) => { acc[r] = enemyPicks[i] ?? null; return acc; }, {});
  }, [blueIsAlly, allyPicks, enemyPicks]);

  const unavailable = useMemo(() => getAllUnavailableIds(), [allyPicks, enemyPicks, blueBans, redBans]);

  function handleSelect(champ) {
    if (!activeSlot) return;
    const { type, team, role, index } = activeSlot;

    if (type === 'ban') {
      setBan(team, index, champ);
    } else if (type === 'pick') {
      if ((team === 'blue' && blueIsAlly) || (team === 'red' && !blueIsAlly)) {
        setAllyPick(role, champ);
      } else {
        setEnemyPick(index, champ);
      }
    }
    setActiveSlot(null);
  }

  function openBan(team, index, champ) {
    if (champ) return;
    setActiveSlot({ type: 'ban', team, index });
  }

  function openPick(team, role, index, champ) {
    if (champ) return;
    setActiveSlot({ type: 'pick', team, role, index });
  }

  return (
    <>
      {activeSlot && (
        <ChampionSearch
          unavailable={unavailable}
          onSelect={handleSelect}
          onClose={() => setActiveSlot(null)}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: 'var(--edge-weight) solid var(--bone-0)', flexShrink: 0 }}>
        {/* Blue */}
        <div style={{ padding: '10px 16px', background: 'var(--ink-2)', borderRight: 'var(--edge-weight) solid var(--bone-0)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--ink-5)' }}>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.2em', color: '#6eaaff' }}>BLUE</span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--bone-2)', letterSpacing: '0.12em' }}>
              {blueIsAlly ? 'ALLIÉ' : 'ENNEMI'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
            {blueBans.map((b, i) => (
              <BanSlot key={i} champ={b ? { name: b.name, key: b.key } : null} onClick={() => openBan('blue', i, b)} />
            ))}
          </div>
          {ROLES.map((role, i) => (
            <PickSlot
              key={role}
              role={role}
              champ={bluePicks[role] ? { name: bluePicks[role].name, key: bluePicks[role].key } : null}
              side="blue"
              onClick={() => openPick('blue', role, i, bluePicks[role])}
            />
          ))}
        </div>

        {/* Red */}
        <div style={{ padding: '10px 16px', background: 'var(--ink-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--ink-5)' }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--bone-2)', letterSpacing: '0.12em' }}>
              {!blueIsAlly ? 'ALLIÉ' : 'ENNEMI'}
            </span>
            <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.2em', color: 'var(--accent)' }}>RED</span>
          </div>
          <div style={{ display: 'flex', gap: 3, marginBottom: 8, justifyContent: 'flex-end' }}>
            {redBans.map((b, i) => (
              <BanSlot key={i} champ={b ? { name: b.name, key: b.key } : null} onClick={() => openBan('red', i, b)} />
            ))}
          </div>
          {ROLES.map((role, i) => (
            <PickSlot
              key={role}
              role={role}
              champ={redPicks[role] ? { name: redPicks[role].name, key: redPicks[role].key } : null}
              side="red"
              onClick={() => openPick('red', role, i, redPicks[role])}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Analyser button ─────────────────────────────
function AnalyserButton() {
  const { getRecommendations, loading } = useDraftStore();
  return (
    <div style={{ padding: '8px 16px', borderBottom: 'var(--edge-weight) solid var(--bone-0)', flexShrink: 0, background: 'var(--ink-0)' }}>
      <button
        onClick={() => getRecommendations([], {})}
        disabled={loading}
        style={{
          width: '100%',
          padding: '9px 0',
          fontFamily: 'var(--f-display)', fontWeight: 700,
          fontSize: 12, letterSpacing: '0.2em',
          background: loading ? 'var(--ink-3)' : 'var(--accent)',
          color: loading ? 'var(--bone-2)' : 'var(--accent-ink)',
          border: 'var(--edge-weight) solid var(--bone-0)',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.1s',
          boxShadow: loading ? 'none' : '2px 2px 0 var(--bone-0)',
        }}
      >
        {loading ? 'ANALYSE EN COURS…' : 'ANALYSER'}
      </button>
    </div>
  );
}

// ── Pick-order timeline ─────────────────────────
function Timeline() {
  return (
    <div style={{ padding: '8px 16px', borderBottom: 'var(--edge-weight) solid var(--bone-0)', flexShrink: 0, background: 'var(--ink-0)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', alignItems: 'center', gap: 10 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.2em', textAlign: 'right', paddingRight: 8, borderRight: '2px solid var(--accent)' }}>ORDRE</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
          {DRAFT.pickOrder.map((slot, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '4px 2px',
              background: slot.current ? 'var(--ink-0)' : 'var(--ink-2)',
              borderTop: `3px solid ${slot.team === 'blue' ? '#4a8bff' : 'var(--accent)'}`,
              border: slot.current
                ? 'var(--edge-weight) solid var(--accent)'
                : '1px solid var(--ink-5)',
              boxShadow: slot.current ? '2px 2px 0 var(--accent)' : 'none',
              opacity: !slot.done && !slot.current ? 0.4 : 1,
              position: 'relative',
            }}>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--bone-2)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {slot.key ? (
                <img
                  src={champIcon(slot.key)}
                  alt={slot.key}
                  style={{ width: 28, height: 28, objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{
                  width: 28, height: 28,
                  background: slot.current ? 'var(--accent-subtle)' : 'var(--ink-3)',
                  border: slot.current ? '1px solid var(--accent-muted)' : '1px dashed var(--ink-5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {slot.current && (
                    <span style={{ color: 'var(--accent)', fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 14 }}>?</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Reasoning ───────────────────────────────────
function Reasoning({ pick }) {
  const [tab, setTab] = useState('reasons');

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, border: 'var(--edge-weight) solid var(--ink-5)', background: 'var(--ink-2)' }}>
        {[
          { id: 'reasons', label: 'RAISONS' },
          { id: 'matchups', label: 'MATCHUPS' },
          { id: 'synergies', label: 'SYNERGIES' },
          { id: 'breakdown', label: 'BREAKDOWN' },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '7px 0',
            fontFamily: 'var(--f-display)', fontSize: 10, letterSpacing: '0.14em',
            background: tab === id ? 'var(--accent)' : 'transparent',
            color: tab === id ? 'var(--accent-ink)' : 'var(--bone-2)',
            border: 'none', borderRight: '1px solid var(--ink-5)',
            cursor: 'pointer', transition: 'all 0.1s',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: 'var(--edge-weight) solid var(--accent)' }}>
        <SectionLbl n={3}>ANALYSE — {pick.name.toUpperCase()}</SectionLbl>
        <div style={{ fontFamily: 'var(--f-body)', fontStyle: 'italic', fontSize: 13, color: 'var(--bone-1)', borderLeft: '3px solid var(--accent)', paddingLeft: 10, lineHeight: 1.5 }}>
          {pick.verdict}
        </div>
      </div>

      {tab === 'reasons' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {pick.reasons.map((r, i) => <ReasonBullet key={i} reason={r} />)}
        </div>
      )}

      {tab === 'matchups' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {pick.matchups.map((m, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto',
              gap: 8, alignItems: 'center',
              padding: '5px 8px',
              background: m.isLane ? 'var(--accent-subtle)' : 'var(--ink-3)',
              borderLeft: `2px solid ${m.isLane ? 'var(--accent)' : 'var(--ink-5)'}`,
              fontSize: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {m.isLane && <span style={{ fontFamily: 'var(--f-display)', fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>⚔</span>}
                <span style={{ color: 'var(--bone-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                <RoleChip role={m.role} />
              </div>
              <Delta value={m.delta} />
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--bone-2)', minWidth: 38, textAlign: 'right' }}>
                {m.wr.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'synergies' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {pick.synergies.map((s, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr auto',
              gap: 8, alignItems: 'center',
              padding: '5px 8px',
              background: 'var(--ink-3)',
              borderLeft: '2px solid rgba(156,211,107,0.28)',
              fontSize: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--f-display)', fontSize: 10, color: 'var(--ok)', flexShrink: 0 }}>⟳</span>
                <span style={{ color: 'var(--bone-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <RoleChip role={s.role} />
              </div>
              <Delta value={s.delta} />
            </div>
          ))}
        </div>
      )}

      {tab === 'breakdown' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 18px' }}>
          {Object.entries({
            meta: 'META', matchup: 'MATCHUP', synergy: 'SYNERGY',
            comp: 'COMP', mastery: 'MAÎTRISE', risk: 'RISQUE',
          }).map(([k, lbl]) => {
            const v = pick.breakdown[k];
            if (v == null) return null;
            return <Bar key={k} label={lbl} value={v} />;
          })}
        </div>
      )}
    </div>
  );
}

// ── DraftPanel ──────────────────────────────────
function DraftPanel({ selected }) {
  // Subscribe to recommendations so the analysis panel re-renders
  // whenever the backend returns new picks (otherwise React.memo would
  // skip the render since `selected` is unchanged, leaving "ANALYSE — —").
  useDraftStore(s => s.recommendations);
  const pick = SHORTLIST[selected] || SHORTLIST[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <BanSuggestionsBanner />
      <Board />
      <AnalyserButton />
      <Timeline />
      <Reasoning pick={pick} />
    </div>
  );
}

export default DraftPanel;
