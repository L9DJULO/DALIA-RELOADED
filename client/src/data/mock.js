// ─────────────────────────────────────────────
// DALIA — data wired to real Zustand stores
// Static helpers (champIcon, champLoading, labels, tag/kind configs) are unchanged.
// DRAFT properties are live getters over draftStore / lcuStore.
// SHORTLIST is a Proxy over draftStore.recommendations (falls back to mock while empty).
// ─────────────────────────────────────────────
import useDraftStore      from '../stores/draftStore';
import useLCUStore        from '../stores/lcuStore';
import useChampionsStore  from '../stores/championsStore';
import useUserStore       from '../stores/userStore';

const DD_ICON    = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion';
const DD_LOADING = 'https://ddragon.leagueoflegends.com/cdn/img/champion/loading';

export const champIcon    = (key) => `${DD_ICON}/${key}.png`;
export const champLoading = (key) => `${DD_LOADING}/${key}_0.jpg`;

// Normalize a store champion {id, key, name} (or null) for component consumption.
function norm(c) {
  if (!c) return null;
  return { key: c.key, name: c.name };
}

// Convert an ordered enemyPicks array to role-keyed format (best-effort, pick order ≠ role order).
const ROLE_ORDER = ['top', 'jungle', 'mid', 'bot', 'support'];
function orderedToRoleKeyed(arr) {
  const out = { top: null, jungle: null, mid: null, bot: null, support: null };
  (arr || []).forEach((c, i) => {
    if (i < ROLE_ORDER.length) out[ROLE_ORDER[i]] = norm(c);
  });
  return out;
}

// ── Draft state ───────────────────────────────
export const DRAFT = {
  // Branché — useDraftStore
  get myTeam()        { return useDraftStore.getState().myTeam; },
  get myRole()        { return useDraftStore.getState().myRole; },
  get currentAction() { return useDraftStore.getState().currentAction; },

  // Branché — useLCUStore
  get timerLeft()     { return useLCUStore.getState().timerRemaining; },

  // Branché — bans (store: array of {id,key,name}|null, 5 slots)
  get blueBans() {
    const s = useDraftStore.getState();
    return (s.myTeam === 'blue' ? s.blueBans : s.redBans).map(norm);
  },
  get redBans() {
    const s = useDraftStore.getState();
    return (s.myTeam === 'blue' ? s.redBans : s.blueBans).map(norm);
  },

  // Branché — bluePicks: role-keyed object (DraftPanel uses bluePicks[role])
  get bluePicks() {
    const s = useDraftStore.getState();
    if (s.myTeam === 'blue') {
      const ap = s.allyPicks;
      return {
        top:     norm(ap.top),
        jungle:  norm(ap.jungle),
        mid:     norm(ap.mid),
        bot:     norm(ap.bot),
        support: norm(ap.support),
      };
    }
    // myTeam='red' — blue is the enemy; store only has an ordered array, no roles
    return orderedToRoleKeyed(s.enemyPicks);
  },

  // Branché — redPicks: ordered array (DraftPanel uses redPicks.map(...))
  get redPicks() {
    const s = useDraftStore.getState();
    if (s.myTeam === 'blue') {
      return (s.enemyPicks || []).map(norm);
    }
    // myTeam='red' — red is ally, role-keyed → flatten to ordered array
    const ap = s.allyPicks;
    return ROLE_ORDER.map((r) => norm(ap[r]));
  },

  // Branché — pickOrder depuis lcuStore.pickSequence (accumulé au polling LCU)
  // buildPickOrderTimeline() reconstruit les 10 slots dans l'ordre LoL standard.
  get pickOrder() {
    const champById = useChampionsStore.getState().byId;
    return useLCUStore.getState().buildPickOrderTimeline(champById);
  },
};

// ═════════════════════════════════════════════════════════════════════════
//  SHORTLIST → draftStore.recommendations (avec mapping de noms de champs)
// ═════════════════════════════════════════════════════════════════════════
//
// Mapping API Recommendation → format attendu par HeroPanel / DraftPanel :
//   champion_key          → key
//   champion_name         → name
//   total_score           → score          (arrondi)
//   score_range           → scoreRange     ([lo, hi] flottants → entiers ; null → [score-5, score+5])
//   is_pool_champion      → inPool
//   confidence            → confidence     (arrondi)
//   winProb               ABSENT — calculé : moyenne des win_rate matchups, ou 40 + score×0.18
//   tags                  → tags           (même valeurs ; 'safe-blind' et 'counter-pick' utilisés par TAG_CFG)
//   verdict               → verdict
//   reasons[]{text,kind}  → reasons[]{text,kind}   (champions[] ignoré, non consommé)
//   breakdown.composition → breakdown.comp          (nom différent)
//   breakdown.draft_risk  → breakdown.risk          (nom différent)
//   breakdown.meta/matchup/synergy/mastery → idem
//   matchup_details[]{opponent_name, opponent_role, win_rate, delta, is_lane_opponent}
//                         → matchups[]{name, role, wr, delta, isLane}
//   synergy_details[]{ally_name, ally_role, delta}
//                         → synergies[]{name, role, delta}
//   tier                  ABSENT — dérivé de breakdown.mastery via TIER_TO_MASTERY inversé :
//                           mastery ≥ 81 → S, ≥ 63 → A, ≥ 46 → B, ≥ 24 → C, sinon D
//                           is_pool_champion=false → '—'
//
function mapRec(rec) {
  const score = Math.round(rec.total_score);
  const bd = rec.breakdown || {};

  // Derive tier from total_score: ≥80→S, 70-79→A, 60-69→B, 50-59→C, <50→D
  let tier;
  if      (score >= 80) tier = 'S';
  else if (score >= 70) tier = 'A';
  else if (score >= 60) tier = 'B';
  else if (score >= 50) tier = 'C';
  else                  tier = 'D';

  // winProb: average match win_rate when data available, else score-based estimate
  let winProb;
  const muList = rec.matchup_details || [];
  if (muList.length > 0) {
    const avg = muList.reduce((acc, m) => acc + (m.win_rate || 50), 0) / muList.length;
    winProb = parseFloat(avg.toFixed(1));
  } else {
    winProb = parseFloat((40 + score * 0.18).toFixed(1));
  }

  // scoreRange: use API interval or ±5 fallback
  const scoreRange = rec.score_range
    ? [Math.round(rec.score_range[0]), Math.round(rec.score_range[1])]
    : [Math.max(0, score - 5), Math.min(100, score + 5)];

  return {
    key:        rec.champion_key,
    name:       rec.champion_name,
    score,
    scoreRange,
    tier,
    inPool:     rec.is_pool_champion,
    confidence: Math.round(rec.confidence || 0),
    winProb,
    tags:       rec.tags || [],
    verdict:    rec.verdict || '',
    reasons:    (rec.reasons || []).map((r) => ({ text: r.text, kind: r.kind || 'info' })),
    breakdown: {
      meta:    Math.round(bd.meta      || 0),
      matchup: Math.round(bd.matchup   || 0),
      synergy: Math.round(bd.synergy   || 0),
      comp:    Math.round(bd.composition || 0),  // API: 'composition'
      mastery: Math.round(bd.mastery   || 0),
      risk:    Math.round(bd.draft_risk || 0),   // API: 'draft_risk'
    },
    matchups: muList.map((m) => ({
      name:   m.opponent_name,
      role:   m.opponent_role,
      delta:  m.delta,
      wr:     m.win_rate,
      isLane: m.is_lane_opponent,
    })),
    synergies: (rec.synergy_details || []).map((s) => ({
      name:  s.ally_name,
      role:  s.ally_role,
      delta: s.delta,
    })),
  };
}

// Placeholder vide — évite les crashes dans DraftPanel/Reasoning avant le premier ANALYSER.
// Pas de vrais champions : name vide, score 0, listes vides.
const _emptyPlaceholder = {
  key: '', name: '—',
  score: 0, scoreRange: [0, 0],
  tier: '—', inPool: false, confidence: 0, winProb: 0,
  tags: [], verdict: '', reasons: [],
  breakdown: { meta: 0, matchup: 0, synergy: 0, comp: 0, mastery: 0, risk: 0 },
  matchups: [], synergies: [],
};
const _mockShortlist = [_emptyPlaceholder];

const _unusedMock = [
  {
    key: 'Caitlyn', name: 'Caitlyn',
    score: 87, scoreRange: [83, 91],
    tier: 'S', inPool: true, confidence: 72, winProb: 56.8,
    tags: ['counter', 'safe-blind'],
    verdict: 'Counter direct Syndra + range sur Malphite engage',
    reasons: [
      { text: "Range 650 > roam Syndra — tu pokes avant qu'elle engage", kind: 'counter' },
      { text: 'Yordle Trap bloque le gank path Lillia niveau 3',         kind: 'counter' },
      { text: 'Orianna + Sejuani setup tes crits à distance',            kind: 'synergy' },
      { text: 'Hard carry tardif — ta comp manque de dégâts',            kind: 'info'    },
    ],
    breakdown: { meta: 82, matchup: 91, synergy: 74, comp: 80, mastery: 95, risk: 70 },
    matchups: [
      { name: 'Syndra',   role: 'mid',    delta: +4.2, wr: 54.1, isLane: false },
      { name: 'Lillia',   role: 'jungle', delta: +2.1, wr: 52.3, isLane: false },
      { name: 'Malphite', role: 'top',    delta: -0.6, wr: 49.4, isLane: false },
    ],
    synergies: [
      { name: 'Sejuani', role: 'jungle', delta: +4.9 },
      { name: 'Orianna', role: 'mid',    delta: +3.8 },
      { name: "K'Sante", role: 'top',    delta: +1.2 },
    ],
  },
  {
    key: 'Ezreal', name: 'Ezreal',
    score: 82, scoreRange: [78, 86],
    tier: 'S', inPool: true, confidence: 68, winProb: 54.1,
    tags: ['safe-blind', 'flex'],
    verdict: 'Safe blind. Arcane Shift évite Malphite R.',
    reasons: [
      { text: 'Sécurité maximale contre lanes inconnues',        kind: 'info'    },
      { text: 'Arcane Shift dribble le Malphite R en teamfight', kind: 'counter' },
      { text: 'Flex pick si le support change',                  kind: 'info'    },
    ],
    breakdown: { meta: 76, matchup: 78, synergy: 80, comp: 85, mastery: 92, risk: 85 },
    matchups: [
      { name: 'Syndra',   role: 'mid',    delta: +1.1, wr: 51.0, isLane: false },
      { name: 'Lillia',   role: 'jungle', delta: +0.5, wr: 50.3, isLane: false },
      { name: 'Malphite', role: 'top',    delta: +1.8, wr: 51.9, isLane: false },
    ],
    synergies: [
      { name: 'Sejuani', role: 'jungle', delta: +5.2 },
      { name: 'Orianna', role: 'mid',    delta: +2.1 },
      { name: "K'Sante", role: 'top',    delta: +0.8 },
    ],
  },
  {
    key: 'Jinx', name: 'Jinx',
    score: 78, scoreRange: [74, 82],
    tier: 'A', inPool: true, confidence: 65, winProb: 53.2,
    tags: ['meta-forte'],
    verdict: 'Hyper-carry — Sejuani donne des fast resets.',
    reasons: [
      { text: 'Sejuani R + Orianna R = reset instantané sur Jinx',   kind: 'synergy' },
      { text: 'Malphite engage = cible idéale pour Rocket en groupe', kind: 'counter' },
      { text: 'Lane difficile avant 2 items — Lillia peut te dive',   kind: 'warn'    },
    ],
    breakdown: { meta: 88, matchup: 72, synergy: 82, comp: 78, mastery: 80, risk: 65 },
    matchups: [
      { name: 'Syndra',   role: 'mid',    delta: -1.2, wr: 48.8, isLane: false },
      { name: 'Lillia',   role: 'jungle', delta: -2.0, wr: 48.0, isLane: false },
      { name: 'Malphite', role: 'top',    delta: +0.9, wr: 50.9, isLane: false },
    ],
    synergies: [
      { name: 'Sejuani', role: 'jungle', delta: +6.1 },
      { name: 'Orianna', role: 'mid',    delta: +2.9 },
    ],
  },
  {
    key: 'Varus', name: 'Varus',
    score: 71, scoreRange: [67, 75],
    tier: 'B', inPool: true, confidence: 58, winProb: 51.4,
    tags: ['flex'],
    verdict: 'Poke + ulti anti-dive.',
    reasons: [
      { text: 'Poke range neutralise le roam Syndra',     kind: 'counter' },
      { text: "Ulti lock-down pour l'engage Sejuani",     kind: 'synergy' },
      { text: "Tu n'as pas joué Varus depuis 18 parties", kind: 'warn'    },
    ],
    breakdown: { meta: 70, matchup: 68, synergy: 72, comp: 82, mastery: 70, risk: 72 },
    matchups: [
      { name: 'Syndra',   role: 'mid',    delta: +0.8, wr: 50.8, isLane: false },
      { name: 'Lillia',   role: 'jungle', delta: -0.3, wr: 49.7, isLane: false },
      { name: 'Malphite', role: 'top',    delta: +1.1, wr: 51.1, isLane: false },
    ],
    synergies: [
      { name: 'Sejuani', role: 'jungle', delta: +3.3 },
      { name: 'Orianna', role: 'mid',    delta: +1.6 },
    ],
  },
  {
    key: 'Draven', name: 'Draven',
    score: 69, scoreRange: [62, 76],
    tier: '—', inPool: false, confidence: 48, winProb: 51.0,
    tags: ['counter'],
    verdict: 'Secret pick — snowball early, punit le tempo Malphite.',
    reasons: [
      { text: 'Malphite monte lentement — kill au niveau 2 coupe son tempo', kind: 'counter' },
      { text: "Ta comp n'a pas de pression early — Draven comble ça",         kind: 'info'    },
      { text: 'Hors pool : 4 games lifetime — risque exécution élevé',        kind: 'warn'    },
    ],
    breakdown: { meta: 84, matchup: 80, synergy: 70, comp: 75, mastery: 30, risk: 45 },
    matchups: [
      { name: 'Syndra',   role: 'mid',    delta: +3.1, wr: 53.2, isLane: false },
      { name: 'Lillia',   role: 'jungle', delta: +1.8, wr: 51.8, isLane: false },
      { name: 'Malphite', role: 'top',    delta: +2.2, wr: 52.2, isLane: false },
    ],
    synergies: [
      { name: 'Sejuani', role: 'jungle', delta: +4.7 },
      { name: 'Orianna', role: 'mid',    delta: +2.5 },
    ],
  },
];

// Sort recommendations: pool champions first (by score desc),
// non-pool ("HORS POOL") at the bottom. When the user's role pool is empty,
// disable the partition so all recommendations stay in their score order.
function sortByPool(mapped) {
  const role = useDraftStore.getState().myRole;
  const pool = useUserStore.getState().championPool || {};
  const poolForRole = pool[role] || [];
  if (poolForRole.length === 0) return mapped;

  const poolIds = new Set(poolForRole.map(e => e.champion_id));
  const poolKeys = new Set(poolForRole.map(e => e.champion_key).filter(Boolean));
  const inPool = (rec) => {
    // mapRec preserves rec.champion_key as `key`. Backend already sets
    // is_pool_champion, but trust the client pool too — it's authoritative.
    if (rec.key && poolKeys.has(rec.key)) return true;
    if (rec.inPool) return true;
    return false;
  };

  const inside = [];
  const outside = [];
  for (const r of mapped) {
    const flagged = { ...r, inPool: inPool(r) };
    if (flagged.inPool) inside.push(flagged);
    else outside.push(flagged);
  }
  // Each side already comes sorted by score from the backend.
  return [...inside, ...outside];
}

// SHORTLIST: Proxy qui lit draftStore.recommendations en temps réel.
// Quand recommendations est vide (avant le premier appel /draft/recommend), renvoie _mockShortlist.
// Supporte les accès [n], .map(), .length, .forEach(), .find(), etc.
export const SHORTLIST = new Proxy([], {
  get(_target, prop) {
    const recs = useDraftStore.getState().recommendations;
    const live = recs.length > 0 ? sortByPool(recs.map(mapRec)) : _mockShortlist;
    const val = live[prop];
    return typeof val === 'function' ? val.bind(live) : val;
  },
});

// True when the user has at least one champion configured in their
// pool for the currently selected role. UI uses this to show the
// "Aucun pool défini" warning.
export function hasPoolForCurrentRole() {
  const role = useDraftStore.getState().myRole;
  const pool = useUserStore.getState().championPool || {};
  return (pool[role] || []).length > 0;
}

export const ROLE_LABEL = {
  top: 'TOP', jungle: 'JGL', mid: 'MID', bot: 'ADC', support: 'SUP',
};

export const TAG_CFG = {
  'counter':       { label: 'COUNTER',   cls: 'tag-accent'  },
  'safe-blind':    { label: 'SAFE',      cls: 'tag-ok'      },
  'meta-forte':    { label: 'META S',    cls: 'tag-accent'  },
  'flex':          { label: 'FLEX',      cls: 'tag-neutral' },
  'last-pick-counter': { label: 'LAST PICK', cls: 'tag-accent' },
  // API tags supplémentaires (non affichés mais présents pour éviter les erreurs TAG_CFG lookup)
  'counter-pick':      { label: 'COUNTER',   cls: 'tag-accent'  },
  'first-pick-safe':   { label: 'SAFE',      cls: 'tag-ok'      },
  'niche-counter':     { label: 'NICHE',     cls: 'tag-neutral' },
  'off-meta':          { label: 'OFF META',  cls: 'tag-neutral' },
  'low-data':          { label: 'LOW DATA',  cls: 'tag-neutral' },
};

export const KIND_CFG = {
  synergy: { bullet: '⟳', color: 'var(--ok)',     bg: 'rgba(156,211,107,0.08)', border: 'rgba(156,211,107,0.28)' },
  counter: { bullet: '⚔', color: 'var(--accent)', bg: 'var(--accent-subtle)',   border: 'var(--accent-muted)'    },
  // API uses 'warning' while mock uses 'warn' — KIND_CFG handles both
  warn:    { bullet: '!', color: 'var(--warn)',    bg: 'rgba(245,176,39,0.08)',  border: 'rgba(245,176,39,0.3)'   },
  warning: { bullet: '!', color: 'var(--warn)',    bg: 'rgba(245,176,39,0.08)',  border: 'rgba(245,176,39,0.3)'   },
  info:    { bullet: '▸', color: 'var(--accent)',  bg: 'transparent',            border: 'rgba(217,30,43,0.18)'   },
};
