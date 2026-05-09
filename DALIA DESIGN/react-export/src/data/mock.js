// ─────────────────────────────────────────────
// DALIA — all mock data, hardcoded, no backend
// Draft moment: Blue side ADC, action 07, 28s
// ─────────────────────────────────────────────

const DD_ICON    = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion';
const DD_LOADING = 'https://ddragon.leagueoflegends.com/cdn/img/champion/loading';

export const champIcon    = (key) => `${DD_ICON}/${key}.png`;
export const champLoading = (key) => `${DD_LOADING}/${key}_0.jpg`;

// ── Draft state ───────────────────────────────
export const DRAFT = {
  myTeam: 'blue',
  myRole: 'bot',
  currentAction: 7,   // 1-indexed, displayed in topbar
  timerLeft: 28,

  blueBans: [
    { key: 'Yone',    name: 'Yone' },
    { key: 'Leblanc', name: 'LeBlanc' },
    { key: 'Viego',   name: 'Viego' },
    { key: 'Kalista', name: 'Kalista' },
    { key: 'Senna',   name: 'Senna' },
  ],
  redBans: [
    { key: 'Zeri',     name: 'Zeri' },
    { key: 'Jhin',     name: 'Jhin' },
    { key: 'Ashe',     name: 'Ashe' },
    { key: 'Nautilus', name: 'Nautilus' },
    { key: 'Rakan',    name: 'Rakan' },
  ],

  // Role-keyed — null = not picked yet
  bluePicks: {
    top:     { key: 'KSante',   name: "K'Sante" },
    jungle:  { key: 'Sejuani',  name: 'Sejuani' },
    mid:     { key: 'Orianna',  name: 'Orianna' },
    bot:     null,        // ← my slot, live pick
    support: null,
  },

  // Ordered array — roles unknown
  redPicks: [
    { key: 'Malphite', name: 'Malphite' },
    { key: 'Lillia',   name: 'Lillia' },
    { key: 'Syndra',   name: 'Syndra' },
    null,
    null,
  ],

  // Pick-order timeline (10 picks total in LoL draft)
  pickOrder: [
    { team: 'blue', role: 'top',     key: 'KSante',   done: true  },
    { team: 'red',  role: null,      key: 'Malphite', done: true  },
    { team: 'red',  role: null,      key: 'Lillia',   done: true  },
    { team: 'blue', role: 'jungle',  key: 'Sejuani',  done: true  },
    { team: 'blue', role: 'mid',     key: 'Orianna',  done: true  },
    { team: 'red',  role: null,      key: 'Syndra',   done: true  },
    { team: 'red',  role: null,      key: null,       done: false },
    { team: 'blue', role: 'bot',     key: null,       done: false, current: true },
    { team: 'blue', role: 'support', key: null,       done: false },
    { team: 'red',  role: null,      key: null,       done: false },
  ],
};

// ── Shortlist (my pool + 1 secret) ────────────
export const SHORTLIST = [
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
      { text: 'Sécurité maximale contre lanes inconnues',     kind: 'info'    },
      { text: 'Arcane Shift dribble le Malphite R en teamfight', kind: 'counter' },
      { text: 'Flex pick si le support change',               kind: 'info'    },
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
      { text: 'Poke range neutralise le roam Syndra',          kind: 'counter' },
      { text: "Ulti lock-down pour l'engage Sejuani",          kind: 'synergy' },
      { text: "Tu n'as pas joué Varus depuis 18 parties",      kind: 'warn'    },
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

export const ROLE_LABEL = {
  top: 'TOP', jungle: 'JGL', mid: 'MID', bot: 'ADC', support: 'SUP',
};

export const TAG_CFG = {
  'counter':       { label: 'COUNTER',   cls: 'tag-accent'  },
  'safe-blind':    { label: 'SAFE',      cls: 'tag-ok'      },
  'meta-forte':    { label: 'META S',    cls: 'tag-accent'  },
  'flex':          { label: 'FLEX',      cls: 'tag-neutral' },
  'last-pick-counter': { label: 'LAST PICK', cls: 'tag-accent' },
};

export const KIND_CFG = {
  synergy: { bullet: '⟳', color: 'var(--ok)',   bg: 'rgba(156,211,107,0.08)', border: 'rgba(156,211,107,0.28)' },
  counter: { bullet: '⚔', color: 'var(--accent)', bg: 'var(--accent-subtle)', border: 'var(--accent-muted)' },
  warn:    { bullet: '!', color: 'var(--warn)',  bg: 'rgba(245,176,39,0.08)',  border: 'rgba(245,176,39,0.3)'  },
  info:    { bullet: '▸', color: 'var(--accent)', bg: 'transparent',           border: 'rgba(217,30,43,0.18)'  },
};
