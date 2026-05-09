import React, { useState, useCallback } from 'react';
import { RotateCcw, Sparkles, Shield, Users } from 'lucide-react';
import useDraftStore from '../../stores/draftStore';
import useUserStore from '../../stores/userStore';
import useHistoryStore from '../../stores/historyStore';
import useDuoStore from '../../stores/duoStore';
import useLCUStore from '../../stores/lcuStore';
import { ROLES, ROLE_LABELS, getDDragonChampUrl } from '../../lib/constants';
import DraftSlot from './DraftSlot';
import BanSlot from './BanSlot';
import ChampionSelector from './ChampionSelector';
import RecommendationPanel from '../Recommendations/RecommendationPanel';
import BanPanel from './BanPanel';
import LCUStatus from './LCUStatus';
import QuickInput from './QuickInput';
import DuoPanel from '../DuoQ/DuoPanel';

const DD = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/loading';
const loadingUrl = (key) => key ? `${DD}/${key}_0.jpg` : null;

const ROLE_SHORT = { top: 'TOP', jungle: 'JGL', mid: 'MID', bot: 'ADC', support: 'SUP' };

const TAG_META = {
  'safe-blind':        { label: 'SAFE',      bg: 'rgba(156,211,107,0.12)', color: '#9cd36b', border: 'rgba(156,211,107,0.3)' },
  'counter-pick':      { label: 'COUNTER',   bg: 'var(--accent-muted)',    color: 'var(--accent)', border: 'var(--border-accent)' },
  'last-pick-counter': { label: 'LAST PICK', bg: 'var(--accent-muted)',    color: 'var(--accent)', border: 'var(--border-accent)' },
  'meta-forte':        { label: 'META S',    bg: 'var(--accent-muted)',    color: 'var(--accent)', border: 'var(--border-accent)' },
  'flex':              { label: 'FLEX',       bg: 'rgba(74,200,232,0.10)', color: '#4ac8e8',        border: 'rgba(74,200,232,0.3)' },
  'low-data':          { label: 'PEU DATA',  bg: 'var(--loss-bg)',         color: 'var(--loss)',    border: 'var(--loss-border)' },
};

function SETag({ tag }) {
  const m = TAG_META[tag];
  if (!m) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px',
      fontFamily: 'var(--f-display)', fontSize: 9, letterSpacing: '0.12em',
      background: m.bg, color: m.color,
      border: `1px solid ${m.border}`,
    }}>{m.label}</span>
  );
}

// META S sanity gate — never let a B/C/D pick render META S even if
// the backend tagging is inconsistent. The backend should only emit
// `meta-forte` when meta_score ≥ 75; this is a defensive filter.
const META_S_MIN_SCORE = 60;
function tagAllowed(tag, rec) {
  if (tag === 'off-meta') return false;
  if (tag === 'meta-forte') {
    const meta = rec?.breakdown?.meta ?? 0;
    return meta >= META_S_MIN_SCORE;
  }
  return true;
}

export default function DraftBoard({ champions }) {
  const {
    myTeam, myRole,
    blueBans, redBans,
    allyPicks, enemyPicks,
    setMyTeam, setMyRole,
    setBan,
    setAllyPick, clearAllyPick,
    setEnemyPick, clearEnemyPick,
    resetDraft, loading,
    getRecommendations,
    recommendations, winProbability,
  } = useDraftStore();

  const { championPool, weightOverrides } = useUserStore();
  const { saveEntry } = useHistoryStore();

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState(null);
  const [rightTab, setRightTab] = useState('reco');

  const [heroIdx, setHeroIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  const duoActive  = useDuoStore(s => s.duoActive);
  const duoLinked  = useDuoStore(s => s.linked);
  const duoPartner = useDuoStore(s => s.partner);
  const getDuoOptions = useDuoStore(s => s.getDuoOptions);

  const unavailableIds = useDraftStore(s => s.getAllUnavailableIds());

  const lcuConnected   = useLCUStore(s => s.connected);
  const lcuChampSelect = useLCUStore(s => s.inChampSelect);

  const openSelector = (target) => { setSelectorTarget(target); setSelectorOpen(true); };

  const handleSelectChampion = (champion) => {
    if (!selectorTarget) return;
    const { type } = selectorTarget;
    const c = { id: champion.id, key: champion.key, name: champion.name };
    if (type === 'ban') setBan(selectorTarget.team, selectorTarget.index, c);
    else if (type === 'ally') setAllyPick(selectorTarget.role, c);
    else if (type === 'enemy') setEnemyPick(selectorTarget.index, c);
    setSelectorOpen(false);
    setSelectorTarget(null);
  };

  const handleAnalyze = useCallback(async () => {
    const duoOptions = getDuoOptions();
    await getRecommendations(championPool, weightOverrides, duoOptions);
    setHeroIdx(0);
    setAnimKey(k => k + 1);

    const state = useDraftStore.getState();
    const allyP = Object.entries(state.allyPicks).filter(([_,c])=>c).map(([role,c])=>({ champion_id:c.id, champion_key:c.key, champion_name:c.name, role }));
    const enemyP = state.enemyPicks.filter(Boolean).map(c=>({ champion_id:c.id, champion_key:c.key, champion_name:c.name, role:null }));
    const myPick = state.allyPicks[myRole];
    const topRec = state.recommendations?.[0];
    const myTeamBans = (myTeam==='blue' ? state.blueBans : state.redBans).filter(Boolean).map(b=>({ champion_id:b.id, champion_key:b.key, champion_name:b.name }));
    const enemyTeamBans = (myTeam==='blue' ? state.redBans : state.blueBans).filter(Boolean).map(b=>({ champion_id:b.id, champion_key:b.key, champion_name:b.name }));
    saveEntry({ my_team:myTeam, my_role:myRole, my_champion_id:myPick?.id||null, my_champion_key:myPick?.key||'', my_champion_name:myPick?.name||'', ally_bans:myTeamBans, enemy_bans:enemyTeamBans, ally_picks:allyP, enemy_picks:enemyP, recommended_champion:topRec?.champion_key||'', recommendation_score:topRec?.total_score||null, win_probability:state.winProbability||null });
  }, [championPool, weightOverrides, getRecommendations, getDuoOptions, myTeam, myRole, saveEntry]);

  const handleHeroSelect = (i) => { setHeroIdx(i); setAnimKey(k => k + 1); };

  const champMap = React.useMemo(() => { const m={}; for(const c of champions) m[c.id]=c; return m; }, [champions]);
  const allRecs  = React.useMemo(() => recommendations.filter(r => !unavailableIds.has(r.champion_id)), [recommendations, unavailableIds]);
  const topRec   = allRecs[heroIdx] || null;
  const topChamp = topRec ? champMap[topRec.champion_id] : null;

  const isAllyBlue = myTeam === 'blue';

  const lcuBadge = lcuConnected
    ? { color: lcuChampSelect ? '#9cd36b' : 'var(--text-muted)', label: lcuChampSelect ? 'CHAMP SELECT' : 'LCU', pulse: lcuChampSelect }
    : { color: 'var(--text-muted)', label: 'LCU OFF', pulse: false };

  const S = {
    root: { display: 'grid', gridTemplateRows: '48px 1fr', height: 'calc(100vh - 48px)', fontFamily: 'var(--f-body)', color: 'var(--text-primary)' },
    topbar: { display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px', borderBottom: '2.5px solid #f0ebe0', background: 'var(--surface-default)' },
    grid: { display: 'grid', gridTemplateColumns: '40% 60%', height: '100%', overflow: 'hidden' },
    left: { display: 'flex', flexDirection: 'column', borderRight: '2.5px solid #f0ebe0', overflow: 'hidden' },
    right: { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  };

  return (
    <div style={S.root}>
      {/* Topbar */}
      <div style={S.topbar}>
        <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 16, letterSpacing: '0.25em', color: '#f0ebe0', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ color: 'var(--accent)', fontSize: 20 }}>▰</span>DRAFT
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 16 }}>
          <div style={{ display: 'flex', gap: 0 }}>
            {['blue','red'].map(t => (
              <button key={t} onClick={() => setMyTeam(t)} style={{
                padding: '5px 14px',
                fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.12em',
                background: myTeam===t ? (t==='blue' ? '#4a8bff' : 'var(--accent)') : 'var(--surface-elevated)',
                color: myTeam===t ? '#000' : 'var(--text-muted)',
                border: '2px solid ' + (myTeam===t ? '#f0ebe0' : 'var(--border-subtle)'),
                borderRight: t==='blue' ? 0 : undefined,
                cursor: 'pointer', transition: 'all 0.1s',
              }}>{t.toUpperCase()}</button>
            ))}
          </div>
          <select
            value={myRole} onChange={e => setMyRole(e.target.value)}
            style={{ padding: '5px 10px', background: 'var(--surface-elevated)', border: '2px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.12em', cursor: 'pointer', outline: 'none' }}
          >
            {ROLES.map(r => <option key={r} value={r}>{ROLE_SHORT[r]}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.12em', color: lcuBadge.color, marginLeft: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: lcuBadge.color, boxShadow: lcuBadge.pulse ? `0 0 6px ${lcuBadge.color}` : 'none', animation: lcuBadge.pulse ? 'pulse-soft 1.8s infinite' : 'none' }}/>
          {lcuBadge.label}
        </div>

        {duoActive && duoLinked && duoPartner && (
          <div className="pill" style={{ background: 'var(--accent-muted)', borderColor: 'var(--border-accent)', color: 'var(--accent)', gap: 5 }}>
            <Users size={10}/> DUO: {duoPartner.username}
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={handleAnalyze} disabled={loading} className="btn-primary" style={{ padding: '7px 18px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={13}/>{loading ? 'ANALYSE...' : 'ANALYSER'}
          </button>
          <button onClick={resetDraft} className="btn-secondary" style={{ padding: '7px 12px' }} title="Réinitialiser">
            <RotateCcw size={14}/>
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={S.grid}>
        {/* LEFT — HERO + SHORTLIST */}
        <div style={S.left}>
          {topRec && topChamp ? (
            <div
              key={animKey}
              className="se-hero-enter"
              style={{
                position: 'relative', height: 340, flexShrink: 0,
                backgroundImage: `url(${loadingUrl(topChamp.key)})`,
                backgroundSize: 'cover', backgroundPosition: 'center 18%',
                borderBottom: '2.5px solid #f0ebe0',
                overflow: 'hidden',
              }}
            >
              <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg,rgba(0,0,0,0.45) 0%,rgba(0,0,0,0.1) 30%,rgba(0,0,0,0.92) 88%), linear-gradient(95deg,rgba(0,0,0,0.65) 0%,transparent 55%)', pointerEvents:'none' }}/>
              <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(-35deg, transparent 0 18px, rgba(0,0,0,0.28) 18px 20px)', pointerEvents:'none' }}/>

              <div style={{ position:'relative', zIndex:1, padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--accent)', letterSpacing:'0.18em', padding:'2px 8px', border:'1.5px solid var(--accent)' }}>
                  01 · RECO #{heroIdx+1}
                </div>
                <div style={{ display:'flex', gap:5 }}>
                  {(topRec.tags||[]).filter(t => tagAllowed(t, topRec)).slice(0,2).map(t => <SETag key={t} tag={t}/>)}
                  {!topRec.is_pool_champion && (
                    <span style={{ padding:'2px 7px', fontFamily:'var(--f-display)', fontSize:9, letterSpacing:'0.12em', background:'var(--warn-bg)', color:'var(--warn)', border:'1px solid var(--warn-border)' }}>SECRET</span>
                  )}
                </div>
              </div>

              <div
                className="se-name-enter"
                style={{ position:'absolute', bottom: 120, left:0, right:0, padding:'0 18px', zIndex:1 }}
              >
                <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize: topChamp.name.length > 8 ? 52 : 68, letterSpacing:'0.02em', lineHeight:0.88, color:'#f0ebe0', textShadow:'3px 3px 0 #000' }}>
                  {topChamp.name.toUpperCase()}
                </div>
                {topRec.matchup_details?.length > 0 && (
                  <div style={{ fontFamily:'var(--f-body)', fontStyle:'italic', fontSize:13, color:'#f0ebe0', marginTop:8, borderLeft:'3px solid var(--accent)', paddingLeft:10, maxWidth:'90%' }}>
                    {topRec.matchup_details[0]?.is_lane_opponent
                      ? `Counter direct ${topRec.matchup_details[0].opponent_name} · ${topRec.matchup_details[0].delta > 0 ? '+' : ''}${topRec.matchup_details[0].delta.toFixed(1)}%`
                      : `Synergies avec ta comp · P(win) ${topRec.win_probability ? (topRec.win_probability * 100).toFixed(1) : '—'}%`
                    }
                  </div>
                )}
              </div>

              <div
                className="se-score-enter"
                style={{ position:'absolute', bottom:0, left:0, right:0, padding:'12px 18px 16px', zIndex:1, display:'flex', alignItems:'flex-end', gap:20, borderTop:'1.5px solid rgba(244,239,230,0.15)' }}
              >
                <div style={{ background:'var(--accent)', color:'#000', padding:'8px 18px 10px', fontFamily:'var(--f-display)', textAlign:'center', border:'2px solid #f0ebe0', boxShadow:'4px 4px 0 #000', minWidth:120 }}>
                  <div style={{ fontSize:56, fontWeight:700, lineHeight:0.85, letterSpacing:'-0.04em' }}>{Math.round(topRec.total_score)}</div>
                  <div style={{ fontFamily:'var(--f-mono)', fontSize:10, letterSpacing:'0.2em' }}>SCORE</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5, fontFamily:'var(--f-mono)', fontSize:11 }}>
                  <div style={{ display:'flex', gap:12, color:'var(--text-muted)' }}>
                    <span>TIER <span style={{ fontFamily:'var(--f-display)', fontSize:13, color:'var(--text-primary)' }}>{topRec.mastery_tier || '—'}</span></span>
                    {topRec.confidence != null && <span>FIABLE <span style={{ fontFamily:'var(--f-display)', fontSize:13, color:'var(--text-primary)' }}>{topRec.confidence.toFixed(0)}%</span></span>}
                    {winProbability != null && <span>P(WIN) <span style={{ fontFamily:'var(--f-display)', fontSize:13, color:'var(--win)' }}>{winProbability.toFixed(1)}%</span></span>}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              height:340, flexShrink:0, borderBottom:'2.5px solid #f0ebe0',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              background:'var(--surface-card)', gap:12,
              backgroundImage: 'repeating-linear-gradient(-38deg, transparent 0 22px, rgba(244,239,230,0.03) 22px 23px)',
            }}>
              <div style={{ fontFamily:'var(--f-display)', fontSize:18, letterSpacing:'0.15em', color:'var(--text-muted)' }}>AUCUNE ANALYSE</div>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:11, color:'var(--text-muted)', letterSpacing:'0.08em' }}>Remplis le draft → Analyser</div>
              <button onClick={handleAnalyze} disabled={loading} className="btn-primary" style={{ marginTop:8, padding:'10px 22px', display:'flex', alignItems:'center', gap:8 }}>
                <Sparkles size={14}/>{loading ? 'ANALYSE...' : '▸ ANALYSER'}
              </button>
            </div>
          )}

          {/* Shortlist */}
          <div style={{ flex:1, padding:'12px 16px', overflow:'hidden', display:'flex', flexDirection:'column', gap:8, minHeight:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:2 }}>
              <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--accent)', letterSpacing:'0.18em', padding:'2px 8px', border:'1.5px solid var(--accent)' }}>02 · SHORTLIST</div>
              <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--text-muted)', letterSpacing:'0.05em' }}>{allRecs.length} picks</span>
            </div>
            <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:6 }}>
              {allRecs.length === 0 && (
                <div style={{ padding:'20px 0', textAlign:'center', fontFamily:'var(--f-mono)', fontSize:10, color:'var(--text-muted)', letterSpacing:'0.1em' }}>
                  Lance l'analyse pour voir les recommandations
                </div>
              )}
              {allRecs.slice(0, 6).map((rec, i) => {
                const cd = champMap[rec.champion_id];
                const isSel = i === heroIdx;
                return (
                  <button
                    key={rec.champion_id}
                    onClick={() => handleHeroSelect(i)}
                    style={{
                      position:'relative',
                      display:'grid', gridTemplateColumns:'28px 48px 1fr auto',
                      alignItems:'center', gap:10,
                      padding:'8px 12px',
                      background: isSel ? 'linear-gradient(90deg, var(--accent-muted) 0%, var(--surface-card) 80%)' : 'var(--surface-card)',
                      border: `2px solid ${isSel ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      boxShadow: isSel ? '6px 6px 0 var(--accent)' : 'none',
                      transform: isSel ? 'rotate(var(--skew,-1deg)) translateX(-3px) scale(1.02)' : 'none',
                      transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
                      cursor: 'pointer',
                      zIndex: isSel ? 2 : 1,
                    }}
                  >
                    {isSel && (
                      <div style={{ position:'absolute', top:-9, left:-4, background:'var(--accent)', color:'#000', padding:'2px 10px', fontFamily:'var(--f-display)', fontWeight:700, fontSize:10, letterSpacing:'0.25em' }}>▸ CHOIX</div>
                    )}
                    <div style={{ fontFamily:'var(--f-mono)', fontWeight:700, fontSize:13, color: isSel ? 'var(--accent)' : 'var(--text-muted)' }}>{String(i+1).padStart(2,'0')}</div>
                    {cd && <img src={getDDragonChampUrl(cd.key)} alt={cd.name} style={{ width: isSel ? 48 : 40, height: isSel ? 48 : 40, objectFit:'cover', border:`1.5px solid ${isSel ? 'var(--accent)' : 'var(--border-subtle)'}` }}/>}
                    <div>
                      <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:14, letterSpacing:'0.03em' }}>{cd?.name || rec.champion_name}</div>
                      <div style={{ display:'flex', gap:5, marginTop:3, flexWrap:'wrap', alignItems:'center' }}>
                        {(rec.tags||[]).filter(t => tagAllowed(t, rec)).slice(0,2).map(t => <SETag key={t} tag={t}/>)}
                        {!rec.is_pool_champion && <span style={{ padding:'1px 5px', background:'var(--warn-bg)', color:'var(--warn)', fontFamily:'var(--f-display)', fontSize:9, letterSpacing:'0.15em' }}>SECRET</span>}
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize: isSel ? 36 : 28, lineHeight:0.9, color: isSel ? 'var(--accent)' : 'var(--text-primary)' }}>{Math.round(rec.total_score)}</div>
                      {rec.score_range && <div style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--text-muted)' }}>±{Math.round((rec.score_range[1]-rec.score_range[0])/2)}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT — DRAFT BOARD + TABS */}
        <div style={S.right}>
          {/* Draft board */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:'2.5px solid #f0ebe0', flexShrink:0 }}>
            {/* Blue side */}
            <div style={{ padding:'10px 16px', background:'var(--surface-card)', borderRight:'2.5px solid #f0ebe0' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8, paddingBottom:6, borderBottom:'1px solid var(--border-subtle)' }}>
                <span style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:18, letterSpacing:'0.2em', color:'#4a8bff' }}>BLUE</span>
                <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--text-muted)', letterSpacing:'0.12em' }}>{isAllyBlue ? 'ALLIÉ' : 'ENNEMI'}</span>
              </div>
              <div style={{ display:'flex', gap:3, marginBottom:8 }}>
                {blueBans.map((ban,i) => (
                  <BanSlot key={`bb${i}`} champion={ban} onClick={() => openSelector({type:'ban',team:'blue',index:i})} onClear={() => setBan('blue',i,null)}/>
                ))}
              </div>
              {isAllyBlue
                ? ROLES.map(role => (
                    <DraftSlot key={`ally-${role}`} role={role} champion={allyPicks[role]} isMySlot={myRole===role} team="blue"
                      onClick={() => openSelector({type:'ally',role})} onClear={() => clearAllyPick(role)} champions={champions}/>
                  ))
                : enemyPicks.map((pick,i) => (
                    <DraftSlot key={`enemy-blue-${i}`} role={null} label={`Pick ${i+1}`} champion={pick} isMySlot={false} team="blue"
                      onClick={() => openSelector({type:'enemy',index:i})} onClear={() => clearEnemyPick(i)} champions={champions}/>
                  ))
              }
            </div>

            {/* Red side */}
            <div style={{ padding:'10px 16px', background:'var(--surface-elevated)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8, paddingBottom:6, borderBottom:'1px solid var(--border-subtle)' }}>
                <span style={{ fontFamily:'var(--f-mono)', fontSize:10, color:'var(--text-muted)', letterSpacing:'0.12em' }}>{!isAllyBlue ? 'ALLIÉ' : 'ENNEMI'}</span>
                <span style={{ fontFamily:'var(--f-display)', fontWeight:700, fontSize:18, letterSpacing:'0.2em', color:'var(--accent)' }}>RED</span>
              </div>
              <div style={{ display:'flex', gap:3, marginBottom:8, justifyContent:'flex-end' }}>
                {redBans.map((ban,i) => (
                  <BanSlot key={`rb${i}`} champion={ban} onClick={() => openSelector({type:'ban',team:'red',index:i})} onClear={() => setBan('red',i,null)}/>
                ))}
              </div>
              {!isAllyBlue
                ? ROLES.map(role => (
                    <DraftSlot key={`ally-${role}`} role={role} champion={allyPicks[role]} isMySlot={myRole===role} team="red"
                      onClick={() => openSelector({type:'ally',role})} onClear={() => clearAllyPick(role)} champions={champions}/>
                  ))
                : enemyPicks.map((pick,i) => (
                    <DraftSlot key={`enemy-red-${i}`} role={null} label={`Pick ${i+1}`} champion={pick} isMySlot={false} team="red"
                      onClick={() => openSelector({type:'enemy',index:i})} onClear={() => clearEnemyPick(i)} champions={champions}/>
                  ))
              }
            </div>
          </div>

          {/* Quick input */}
          <div style={{ padding:'8px 16px', borderBottom:'1px solid var(--border-subtle)', flexShrink:0 }}>
            <QuickInput champions={champions}/>
          </div>

          {/* Tabs */}
          <div style={{ padding:'10px 16px 0', flexShrink:0 }}>
            <div style={{ display:'flex', gap:0, background:'var(--surface-card)', border:'2px solid var(--border-subtle)', padding:'3px 3px' }}>
              {[
                { id:'reco', label:'RECOMMANDATIONS', Icon: Sparkles },
                { id:'bans', label:'BANS',             Icon: Shield },
                { id:'duo',  label:'DUO Q',            Icon: Users, badge: duoActive && duoLinked },
              ].map(({ id, label, Icon, badge }) => (
                <button
                  key={id}
                  onClick={() => setRightTab(id)}
                  style={{
                    flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    padding:'7px 0',
                    fontFamily:'var(--f-display)', fontSize:10, letterSpacing:'0.12em',
                    background: rightTab===id ? (id==='bans' ? 'var(--loss)' : 'var(--accent)') : 'transparent',
                    color: rightTab===id ? '#000' : 'var(--text-muted)',
                    border:'none', cursor:'pointer', transition:'all 0.1s',
                    position:'relative',
                  }}
                >
                  <Icon size={12}/>{label}
                  {badge && rightTab!==id && <span style={{ position:'absolute', top:4, right:8, width:6, height:6, borderRadius:'50%', background:'var(--accent)' }}/>}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div style={{ flex:1, overflowY:'auto' }} key={rightTab}>
            {rightTab === 'reco' && <RecommendationPanel champions={champions}/>}
            {rightTab === 'bans' && <div style={{ padding:16 }}><BanPanel/></div>}
            {rightTab === 'duo'  && <DuoPanel embedded/>}
          </div>
        </div>
      </div>

      {selectorOpen && (
        <ChampionSelector
          champions={champions}
          unavailableIds={unavailableIds}
          onSelect={handleSelectChampion}
          onClose={() => setSelectorOpen(false)}
          target={selectorTarget}
        />
      )}
    </div>
  );
}
