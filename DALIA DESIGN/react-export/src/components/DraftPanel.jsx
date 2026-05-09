// ─────────────────────────────────────────────
// DraftPanel.jsx — RIGHT column
// · Board (blue / red picks + bans)
// · Pick-order timeline
// · Reasoning (analysis of selected pick)
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import { DRAFT, SHORTLIST, ROLE_LABEL, champIcon } from '../data/mock';
import { Portrait, SectionLbl, Bar, Delta, RoleChip, ReasonBullet } from './Primitives';

// ── Board slot ──────────────────────────────────
function BoardSlot({ role, champ, isMe, current, side }) {
  const isRight = side === 'red';
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isRight ? '1fr 52px 44px' : '44px 52px 1fr',
      alignItems: 'center', gap: 8,
      padding: '5px 0',
      borderBottom: '1px solid var(--ink-5)',
      position: 'relative',
    }}>
      {/* role label */}
      <span style={{
        fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bone-2)',
        letterSpacing: '0.1em',
        order: isRight ? 3 : 1,
        textAlign: isRight ? 'right' : 'left',
      }}>
        {role ? (ROLE_LABEL[role] ?? role) : ''}
      </span>

      {/* portrait */}
      <div style={{ position: 'relative', order: 2 }}>
        {current ? (
          <>
            <Portrait champ={null} size={52}/>
            <div className="pick-ring"/>
          </>
        ) : (
          <Portrait champ={champ} size={52}/>
        )}
      </div>

      {/* name */}
      <span style={{
        fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 13,
        letterSpacing: '0.04em',
        color: current ? 'var(--accent)' : champ ? 'var(--bone-0)' : 'var(--bone-3)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        order: isRight ? 1 : 3,
        textAlign: isRight ? 'right' : 'left',
      }}>
        {current ? '→ MON PICK' : champ ? champ.name.toUpperCase() : '——'}
      </span>
    </div>
  );
}

// ── Board ───────────────────────────────────────
function Board() {
  const { bluePicks, redPicks, blueBans, redBans, myTeam } = DRAFT;
  const roles = ['top', 'jungle', 'mid', 'bot', 'support'];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: 'var(--edge-weight) solid var(--bone-0)', flexShrink: 0 }}>
      {/* Blue */}
      <div style={{ padding: '10px 16px', background: 'var(--ink-2)', borderRight: 'var(--edge-weight) solid var(--bone-0)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8, paddingBottom:6, borderBottom:'1px solid var(--ink-5)' }}>
          <span style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:18, letterSpacing:'0.2em', color:'#6eaaff' }}>BLUE</span>
          <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--bone-2)', letterSpacing:'0.12em' }}>
            {myTeam === 'blue' ? 'ALLIÉ' : 'ENNEMI'}
          </span>
        </div>
        <div style={{ display:'flex', gap:3, marginBottom:8 }}>
          {blueBans.map((b, i) => <Portrait key={i} champ={b} size={22} banned/>)}
        </div>
        {roles.map(role => (
          <BoardSlot
            key={role}
            role={role}
            champ={bluePicks[role]}
            isMe={myTeam === 'blue' && role === DRAFT.myRole}
            current={myTeam === 'blue' && role === DRAFT.myRole}
            side="blue"
          />
        ))}
      </div>

      {/* Red */}
      <div style={{ padding: '10px 16px', background: 'var(--ink-3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8, paddingBottom:6, borderBottom:'1px solid var(--ink-5)' }}>
          <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--bone-2)', letterSpacing:'0.12em' }}>
            {myTeam === 'red' ? 'ALLIÉ' : 'ENNEMI'}
          </span>
          <span style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:18, letterSpacing:'0.2em', color:'var(--accent)' }}>RED</span>
        </div>
        <div style={{ display:'flex', gap:3, marginBottom:8, justifyContent:'flex-end' }}>
          {redBans.map((b, i) => <Portrait key={i} champ={b} size={22} banned/>)}
        </div>
        {redPicks.map((champ, i) => (
          <BoardSlot
            key={i}
            role={null}
            champ={champ}
            isMe={false}
            current={false}
            side="red"
          />
        ))}
      </div>
    </div>
  );
}

// ── Pick-order timeline ─────────────────────────
function Timeline({ currentKey }) {
  return (
    <div style={{ padding:'8px 16px', borderBottom:'var(--edge-weight) solid var(--bone-0)', flexShrink:0, background:'var(--ink-0)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'64px 1fr', alignItems:'center', gap:10 }}>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:9, color:'var(--accent)', letterSpacing:'0.2em', textAlign:'right', paddingRight:8, borderRight:'2px solid var(--accent)' }}>ORDRE</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(10, 1fr)', gap:3 }}>
          {DRAFT.pickOrder.map((slot, i) => (
            <div key={i} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:2,
              padding:'4px 2px',
              background: slot.current ? 'var(--ink-0)' : 'var(--ink-2)',
              borderTop: `3px solid ${slot.team === 'blue' ? '#4a8bff' : 'var(--accent)'}`,
              border: slot.current
                ? 'var(--edge-weight) solid var(--accent)'
                : '1px solid var(--ink-5)',
              boxShadow: slot.current ? '2px 2px 0 var(--accent)' : 'none',
              opacity: !slot.done && !slot.current ? 0.4 : 1,
              position: 'relative',
            }}>
              <span style={{ fontFamily:'var(--f-mono)', fontSize:8, color:'var(--bone-2)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {slot.key ? (
                <img
                  src={champIcon(slot.key)}
                  alt={slot.key}
                  style={{ width:28, height:28, objectFit:'cover', display:'block' }}
                />
              ) : (
                <div style={{
                  width:28, height:28,
                  background: slot.current ? 'var(--accent-subtle)' : 'var(--ink-3)',
                  border: slot.current ? '1px solid var(--accent-muted)' : '1px dashed var(--ink-5)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {slot.current && (
                    <span style={{ color:'var(--accent)', fontFamily:'var(--f-display)', fontWeight:700, fontSize:14 }}>?</span>
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
    <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
      {/* Tab bar */}
      <div style={{ display:'flex', gap:0, marginBottom:14, border:'var(--edge-weight) solid var(--ink-5)', background:'var(--ink-2)' }}>
        {[
          { id:'reasons',   label:'RAISONS'    },
          { id:'matchups',  label:'MATCHUPS'   },
          { id:'synergies', label:'SYNERGIES'  },
          { id:'breakdown', label:'BREAKDOWN'  },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex:1, padding:'7px 0',
            fontFamily:'var(--f-display)', fontSize:10, letterSpacing:'0.14em',
            background: tab === id ? 'var(--accent)' : 'transparent',
            color: tab === id ? 'var(--accent-ink)' : 'var(--bone-2)',
            border:'none', borderRight:'1px solid var(--ink-5)',
            cursor:'pointer', transition:'all 0.1s',
          }}>{label}</button>
        ))}
      </div>

      {/* Analysis header */}
      <div style={{ marginBottom:12, paddingBottom:8, borderBottom:'var(--edge-weight) solid var(--accent)' }}>
        <SectionLbl n={3}>ANALYSE — {pick.name.toUpperCase()}</SectionLbl>
        <div style={{ fontFamily:'var(--f-body)', fontStyle:'italic', fontSize:13, color:'var(--bone-1)', borderLeft:'3px solid var(--accent)', paddingLeft:10, lineHeight:1.5 }}>
          {pick.verdict}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'reasons' && (
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {pick.reasons.map((r, i) => <ReasonBullet key={i} reason={r}/>)}
        </div>
      )}

      {tab === 'matchups' && (
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          {pick.matchups.map((m, i) => (
            <div key={i} style={{
              display:'grid', gridTemplateColumns:'1fr auto auto',
              gap:8, alignItems:'center',
              padding:'5px 8px',
              background: m.isLane ? 'var(--accent-subtle)' : 'var(--ink-3)',
              borderLeft:`2px solid ${m.isLane ? 'var(--accent)' : 'var(--ink-5)'}`,
              fontSize:12,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                {m.isLane && <span style={{ fontFamily:'var(--f-display)', fontSize:10, color:'var(--accent)', flexShrink:0 }}>⚔</span>}
                <span style={{ color:'var(--bone-0)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</span>
                <RoleChip role={m.role}/>
              </div>
              <Delta value={m.delta}/>
              <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--bone-2)', minWidth:38, textAlign:'right' }}>
                {m.wr.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'synergies' && (
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          {pick.synergies.map((s, i) => (
            <div key={i} style={{
              display:'grid', gridTemplateColumns:'1fr auto',
              gap:8, alignItems:'center',
              padding:'5px 8px',
              background:'var(--ink-3)',
              borderLeft:'2px solid rgba(156,211,107,0.28)',
              fontSize:12,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontFamily:'var(--f-display)', fontSize:10, color:'var(--ok)', flexShrink:0 }}>⟳</span>
                <span style={{ color:'var(--bone-0)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</span>
                <RoleChip role={s.role}/>
              </div>
              <Delta value={s.delta}/>
            </div>
          ))}
        </div>
      )}

      {tab === 'breakdown' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 18px' }}>
          {Object.entries({
            meta:'META', matchup:'MATCHUP', synergy:'SYNERGY',
            comp:'COMP', mastery:'MAÎTRISE', risk:'RISQUE',
          }).map(([k, lbl]) => {
            const v = pick.breakdown[k];
            if (v == null) return null;
            return <Bar key={k} label={lbl} value={v}/>;
          })}
        </div>
      )}
    </div>
  );
}

// ── DraftPanel ──────────────────────────────────
export default function DraftPanel({ selected }) {
  const pick = SHORTLIST[selected];
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <Board/>
      <Timeline currentKey={null}/>
      <Reasoning pick={pick}/>
    </div>
  );
}
