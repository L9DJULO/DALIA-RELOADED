// ─────────────────────────────────────────────
// App.jsx — shell + topbar + state
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import { DRAFT } from './data/mock';
import HeroPanel  from './components/HeroPanel';
import DraftPanel from './components/DraftPanel';
import { TimerChip, LCUBadge } from './components/Primitives';

// ── DaliaMoon logo ──────────────────────────────
function DaliaMoon({ size = 32 }) {
  return (
    <svg width={size} height={Math.round(size * 1.05)} viewBox="0 0 200 210" fill="none"
      style={{ filter: 'drop-shadow(0 0 6px var(--accent))' }}>
      <path d="M128 10 C100 2,60 8,34 24 C6 42,-2 76,3 108 C8 140,26 165,52 178 C74 190,108 196,130 186 L136 180 C144 165,146 142,140 118 C134 92,124 68,130 44 C133 28,132 14,128 10 Z"
        fill="#f0ebe0" stroke="#050508" strokeWidth="5" strokeLinejoin="round"/>
      <circle cx="76" cy="78" r="24" fill="#050508"/>
      {[0,45,90,135,180,225,270,315].map((deg, i) => {
        const r = (deg * Math.PI) / 180;
        return <line key={i}
          x1={76 + Math.cos(r)*25} y1={78 + Math.sin(r)*25}
          x2={76 + Math.cos(r)*32} y2={78 + Math.sin(r)*32}
          stroke="#050508" strokeWidth="3"/>;
      })}
      <circle cx="76" cy="78" r="15" fill="#f0ebe0"/>
      <circle cx="76" cy="78" r="7"  fill="#050508"/>
      <circle cx="71" cy="73" r="3.5" fill="#f0ebe0"/>
      <path d="M94 52 C108 46,124 56,130 65" stroke="#050508" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <path d="M38 130 Q56 118,80 120 Q108 118,138 130" stroke="#050508" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
      <rect x="42"  y="119" width="18" height="24" rx="2" fill="#f0ebe0" stroke="#050508" strokeWidth="2.5"/>
      <rect x="63"  y="117" width="18" height="26" rx="2" fill="#f0ebe0" stroke="#050508" strokeWidth="2.5"/>
      <rect x="84"  y="116" width="18" height="27" rx="2" fill="#f0ebe0" stroke="#050508" strokeWidth="2.5"/>
      <rect x="105" y="117" width="17" height="26" rx="2" fill="#f0ebe0" stroke="#050508" strokeWidth="2.5"/>
      <rect x="125" y="119" width="14" height="23" rx="2" fill="#f0ebe0" stroke="#050508" strokeWidth="2.5"/>
      <path d="M38 143 Q56 148,80 147 Q108 148,139 143" stroke="#050508" strokeWidth="3.5" fill="none"/>
      <path d="M48 143 C46 152,44 162,44 170 C44 180,56 180,56 170 C56 162,54 152,52 143 Z" fill="var(--accent)"/>
      <path d="M90 143 C88 150,86 158,86 165 C86 174,96 174,96 165 C96 158,94 150,92 143 Z" fill="var(--accent)"/>
      <ellipse cx="46" cy="185" rx="5" ry="6" fill="var(--accent)"/>
    </svg>
  );
}

// ── Accent palette ──────────────────────────────
const ACCENTS = [
  { id:'red',     hex:'#d91e2b', label:'ROUGE'   },
  { id:'violet',  hex:'#7b2cff', label:'VIOLET'  },
  { id:'acid',    hex:'#e5ff00', label:'ACIDE'   },
  { id:'cyan',    hex:'#00e7ff', label:'CYAN'    },
  { id:'magenta', hex:'#ff1ec0', label:'MAGENTA' },
  { id:'toxic',   hex:'#26ff6e', label:'TOXIC'   },
];

// ── Topbar ──────────────────────────────────────
function Topbar({ accent, onAccent, lcuOn, onLcu }) {
  const [accentOpen, setAccentOpen] = useState(false);

  return (
    <header style={{
      height: 48, display:'flex', alignItems:'center', gap:20,
      padding:'0 20px', flexShrink:0,
      background:'var(--ink-1)',
      borderBottom:'var(--edge-weight) solid var(--bone-0)',
      position:'relative', zIndex:20,
    }}>
      {/* Brand */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <DaliaMoon size={28}/>
        <span style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:16, letterSpacing:'0.3em', color:'var(--bone-0)' }}>DALIA</span>
        <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--bone-2)', letterSpacing:'0.15em' }}>/ DRAFT</span>
      </div>

      {/* Action label */}
      <div style={{ display:'flex', alignItems:'baseline', gap:10, fontFamily:'var(--f-display)', letterSpacing:'0.15em' }}>
        <span style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--accent)', padding:'2px 8px', border:'1.5px solid var(--accent)' }}>
          {String(DRAFT.currentAction).padStart(2,'0')}
        </span>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>
          BLUE ADC · À TOI DE PICK
        </span>
      </div>

      {/* Right controls */}
      <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
        {/* LCU toggle */}
        <button
          onClick={onLcu}
          style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}
          title="Toggle LCU (prototype)"
        >
          <LCUBadge connected={lcuOn}/>
        </button>

        <div style={{ width:1, height:22, background:'var(--ink-5)' }}/>

        {/* Accent picker */}
        <div style={{ position:'relative' }}>
          <button
            onClick={() => setAccentOpen(v => !v)}
            style={{
              display:'flex', alignItems:'center', gap:8,
              fontFamily:'var(--f-mono)', fontSize:10, letterSpacing:'0.12em',
              color:'var(--bone-2)', background:'none', border:'none', cursor:'pointer',
            }}
          >
            <span style={{ width:14, height:14, background:'var(--accent)', display:'inline-block', border:'1.5px solid var(--bone-0)' }}/>
            ACCENT ▾
          </button>
          {accentOpen && (
            <>
              <div style={{ position:'fixed', inset:0, zIndex:30 }} onClick={() => setAccentOpen(false)}/>
              <div style={{
                position:'absolute', right:0, top:'calc(100% + 6px)',
                background:'var(--ink-2)', border:'var(--edge-weight) solid var(--bone-0)',
                boxShadow:'4px 4px 0 var(--ink-0)',
                padding:8, zIndex:40, display:'flex', flexDirection:'column', gap:3, width:140,
              }}>
                {ACCENTS.map(a => (
                  <button key={a.id} onClick={() => { onAccent(a.id); setAccentOpen(false); }} style={{
                    display:'flex', alignItems:'center', gap:8,
                    padding:'6px 8px',
                    fontFamily:'var(--f-display)', fontSize:11, letterSpacing:'0.1em',
                    background: accent === a.id ? 'var(--accent-muted)' : 'transparent',
                    border: accent === a.id ? '1px solid var(--accent)' : '1px solid transparent',
                    color: accent === a.id ? 'var(--accent)' : 'var(--bone-1)',
                    cursor:'pointer', textAlign:'left',
                  }}>
                    <span style={{ width:12, height:12, background:a.hex, display:'inline-block', flexShrink:0 }}/>
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <TimerChip initial={28}/>
      </div>
    </header>
  );
}

// ── App ─────────────────────────────────────────
export default function App() {
  const [selected, setSelected] = useState(0);
  const [accent, setAccent]     = useState('red');
  const [lcuOn, setLcuOn]       = useState(true);

  const handleAccent = (id) => {
    setAccent(id);
    document.documentElement.dataset.accent = id;
  };

  return (
    <div style={{ height:'100vh', display:'grid', gridTemplateRows:'48px 1fr', background:'var(--ink-0)' }}>
      <Topbar accent={accent} onAccent={handleAccent} lcuOn={lcuOn} onLcu={() => setLcuOn(v => !v)}/>
      <div style={{ display:'grid', gridTemplateColumns:'40% 60%', overflow:'hidden' }}>
        <HeroPanel  selected={selected} onSelect={setSelected}/>
        <DraftPanel selected={selected}/>
      </div>
    </div>
  );
}
