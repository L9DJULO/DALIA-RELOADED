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
import { getDDragonChampUrl } from '../lib/constants';

const DD_LOADING = 'https://ddragon.leagueoflegends.com/cdn/img/champion/loading';

export const champIcon = getDDragonChampUrl;
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
// Adapt API fields without inventing probabilities or uncertainty intervals.
export function mapRec(rec) {
  const score = Math.round(rec.total_score);
  const bd = rec.breakdown || {};

  // Derive tier from total_score: ≥80→S, 70-79→A, 60-69→B, 50-59→C, <50→D
  let tier;
  if      (score >= 80) tier = 'S';
  else if (score >= 70) tier = 'A';
  else if (score >= 60) tier = 'B';
  else if (score >= 50) tier = 'C';
  else                  tier = 'D';

  const muList = rec.matchup_details || [];
  const probability = bd.ml_explanation?.win_probability;
  const winProb = Number.isFinite(probability) ? probability * 100 : null;

  return {
    key:        rec.champion_key,
    name:       rec.champion_name,
    score,
    tier,
    inPool:     rec.is_pool_champion,
    confidence: Math.round(rec.confidence || 0),
    winProb,
    mechanics: rec.mechanics || [],
    wpa: rec.wpa || null,
    // "hors-pool" is rendered from `inPool` as a dedicated badge, not as a tag chip.
    tags:       (rec.tags || []).filter(t => t !== 'hors-pool'),
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
      games: m.games || 0,
      laneProbability: m.lane_probability || 0,
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
  score: 0,
  tier: '—', inPool: false, confidence: 0, winProb: null,
  tags: [], verdict: '', reasons: [], mechanics: [], wpa: null,
  breakdown: { meta: 0, matchup: 0, synergy: 0, comp: 0, mastery: 0, risk: 0 },
  matchups: [], synergies: [],
};
const _mockShortlist = [_emptyPlaceholder];

export const SHORTLIST = new Proxy([], {
  get(_target, prop) {
    const recs = useDraftStore.getState().recommendations;
    const live = recs.length > 0 ? recs.map(mapRec) : _mockShortlist;
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
