// ─────────────────────────────────────────────
// HeroPanel.jsx — LEFT column
// · Hero splash (top 42%)
// · Shortlist rows (bottom 58%)
// ─────────────────────────────────────────────
import React from 'react';
import { champLoading, champIcon, SHORTLIST, TAG_CFG, ROLE_LABEL } from '../data/mock';
import { Portrait, Tag, TierBadge, SectionLbl, ReasonBullet, Bar, Delta, RoleChip } from './Primitives';

// ── Score box ──────────────────────────────────
function ScoreBox({ value, range, accent }) {
  const half = range ? Math.round((range[1] - range[0]) / 2) : null;
  return (
    <div style={{
      background: accent ? 'var(--accent)' : 'var(--ink-2)',
      color: accent ? 'var(--accent-ink)' : 'var(--bone-0)',
      padding: '8px 18px 10px',
      fontFamily: 'var(--f-display)',
      textAlign: 'center',
      border: `var(--edge-weight) solid var(--bone-0)`,
      boxShadow: '4px 4px 0 var(--ink-0)',
      minWidth: 118, flexShrink: 0,
    }}>
      <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 0.85, letterSpacing: '-0.04em' }}>{value}</div>
      {half != null && (
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.05em', marginTop: 2 }}>±{half}</div>
      )}
      <div style={{ fontSize: 9, letterSpacing: '0.3em', marginTop: 3, fontWeight: 500, opacity: 0.75 }}>SCORE</div>
    </div>
  );
}

// ── Hero splash ────────────────────────────────
function HeroSplash({ pick, idx }) {
  return (
    <div
      key={idx}
      className="anim-hero-enter"
      style={{
        position: 'relative', height: 355, flexShrink: 0,
        backgroundImage: `url(${champLoading(pick.key)})`,
        backgroundSize: 'cover', backgroundPosition: 'center 18%',
        borderBottom: 'var(--edge-weight) solid var(--bone-0)',
        overflow: 'hidden',
      }}
    >
      {/* shade */}
      <div style={{ position:'absolute',inset:0, background:'linear-gradient(180deg,rgba(0,0,0,.46) 0%,rgba(0,0,0,.08) 28%,rgba(0,0,0,.92) 86%), linear-gradient(95deg,rgba(0,0,0,.68) 0%,transparent 55%)', pointerEvents:'none' }}/>
      {/* stripes */}
      <div style={{ position:'absolute',inset:0, backgroundImage:'repeating-linear-gradient(-35deg,transparent 0 18px,rgba(0,0,0,.28) 18px 20px)', pointerEvents:'none' }}/>

      {/* top row */}
      <div style={{ position:'relative',zIndex:1, padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--accent)', letterSpacing:'0.18em', padding:'2px 8px', border:'1.5px solid var(--accent)' }}>
          01 · RECO #{idx + 1}
        </div>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap', justifyContent:'flex-end' }}>
          {pick.tags.map(t => <Tag key={t} tag={t}/>)}
          {!pick.inPool && (
            <span style={{ padding:'2px 7px', fontFamily:'var(--f-display)', fontSize:9, letterSpacing:'0.12em', background:'var(--warn-bg,rgba(245,176,39,0.08))', color:'var(--warn)', border:'1px solid rgba(245,176,39,0.3)' }}>SECRET</span>
          )}
        </div>
      </div>

      {/* name + verdict */}
      <div className="anim-name-enter" style={{ position:'absolute', bottom:120, left:0, right:0, padding:'0 18px', zIndex:1 }}>
        <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize: pick.name.length > 8 ? 52 : 68, letterSpacing:'0.02em', lineHeight:0.88, color:'var(--bone-0)', textShadow:'3px 3px 0 var(--ink-0)' }}>
          {pick.name.toUpperCase()}
        </div>
        {pick.reasons[0] && (
          <div style={{ fontFamily:'var(--f-body)', fontStyle:'italic', fontSize:13, color:'var(--bone-0)', marginTop:8, borderLeft:'3px solid var(--accent)', paddingLeft:10, maxWidth:'90%' }}>
            {pick.verdict}
          </div>
        )}
      </div>

      {/* foot */}
      <div className="anim-score-enter" style={{ position:'absolute', bottom:0, left:0, right:0, padding:'12px 18px 16px', zIndex:1, display:'flex', alignItems:'flex-end', gap:20, borderTop:'1px solid rgba(244,239,230,0.12)' }}>
        <ScoreBox value={pick.score} range={pick.scoreRange} accent/>
        <div style={{ display:'flex', flexDirection:'column', gap:5, fontFamily:'var(--f-mono)', fontSize:11 }}>
          {[
            ['TIER',   <TierBadge key="t" tier={pick.tier}/>],
            ['P(WIN)', <b key="w" style={{ fontFamily:'var(--f-display)', fontSize:14, color:'var(--ok)' }}>{pick.winProb.toFixed(1)}%</b>],
            ['FIABLE', <b key="f" style={{ fontFamily:'var(--f-display)', fontSize:14, color:'var(--bone-0)' }}>{pick.confidence}%</b>],
          ].map(([lbl, val]) => (
            <div key={lbl} style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'center' }}>
              <span style={{ color:'var(--bone-2)', letterSpacing:'0.12em', fontSize:10 }}>{lbl}</span>
              {val}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Shortlist row ──────────────────────────────
function ShortRow({ pick, idx, selected, onSelect }) {
  const isSel = idx === selected;
  return (
    <button
      onClick={() => onSelect(idx)}
      style={{
        position: 'relative',
        display: 'grid', gridTemplateColumns: '26px 52px 1fr auto',
        alignItems: 'center', gap: 10,
        padding: '8px 12px',
        background: isSel ? 'linear-gradient(90deg,var(--accent-muted) 0%,var(--ink-2) 80%)' : 'var(--ink-2)',
        border: `var(--edge-weight) solid ${isSel ? 'var(--accent)' : 'var(--ink-5)'}`,
        boxShadow: isSel ? '6px 6px 0 var(--accent)' : 'none',
        transform: isSel ? 'rotate(var(--skew)) translateX(-3px) scale(1.02)' : 'none',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
        cursor: 'pointer',
        zIndex: isSel ? 2 : 1,
        textAlign: 'left',
        width: '100%',
        animationDelay: `${idx * 0.04}s`,
      }}
      className="anim-fade-up"
    >
      {isSel && (
        <div style={{ position:'absolute', top:-9, left:-3, background:'var(--accent)', color:'var(--accent-ink)', padding:'2px 10px', fontFamily:'var(--f-display)', fontWeight:700, fontSize:10, letterSpacing:'0.25em', zIndex:3 }}>▸ CHOIX</div>
      )}
      <div style={{ fontFamily:'var(--f-mono)', fontWeight:700, fontSize:13, color: isSel ? 'var(--accent)' : 'var(--bone-2)' }}>
        {String(idx + 1).padStart(2, '0')}
      </div>
      <Portrait champ={pick} size={isSel ? 52 : 42}/>
      <div>
        <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:15, letterSpacing:'0.03em' }}>{pick.name}</div>
        <div style={{ display:'flex', gap:5, marginTop:3, flexWrap:'wrap', alignItems:'center' }}>
          <TierBadge tier={pick.tier}/>
          {!pick.inPool && (
            <span style={{ padding:'1px 5px', background:'rgba(245,176,39,0.1)', color:'var(--warn)', fontFamily:'var(--f-display)', fontSize:9, letterSpacing:'0.15em' }}>SECRET</span>
          )}
          {pick.tags.slice(0, 2).map(t => <Tag key={t} tag={t}/>)}
        </div>
      </div>
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize: isSel ? 36 : 28, lineHeight:0.88, color: isSel ? 'var(--accent)' : 'var(--bone-0)' }}>
          {pick.score}
        </div>
        <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--bone-2)' }}>
          ±{Math.round((pick.scoreRange[1] - pick.scoreRange[0]) / 2)}
        </div>
      </div>
    </button>
  );
}

// ── HeroPanel ──────────────────────────────────
export default function HeroPanel({ selected, onSelect }) {
  const pick = SHORTLIST[selected];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', borderRight:'var(--edge-weight) solid var(--bone-0)', overflow:'hidden' }}>
      <HeroSplash pick={pick} idx={selected}/>

      {/* Shortlist */}
      <div style={{ flex:1, padding:'12px 16px', overflow:'hidden', display:'flex', flexDirection:'column', gap:8, minHeight:0 }}>
        <SectionLbl n={2}>SHORTLIST · {SHORTLIST.length} PICKS</SectionLbl>
        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:6 }}>
          {SHORTLIST.map((c, i) => (
            <ShortRow key={c.key} pick={c} idx={i} selected={selected} onSelect={onSelect}/>
          ))}
        </div>
      </div>
    </div>
  );
}
