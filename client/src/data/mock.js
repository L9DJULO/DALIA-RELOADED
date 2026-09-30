// ─────────────────────────────────────────────
// DALIA — data wired to real Zustand stores
// Static helpers (champIcon, champLoading, labels, tag/kind configs) are unchanged.
// shortlist() maps a draft's recommendations for display (placeholder while empty).
// ─────────────────────────────────────────────
import useUserStore       from '../stores/userStore';
import { getDDragonChampUrl } from '../lib/constants';

const DD_LOADING = 'https://ddragon.leagueoflegends.com/cdn/img/champion/loading';
const DD_SPLASH = 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash';

export const champIcon = getDDragonChampUrl;
export const champLoading = (key) => `${DD_LOADING}/${key}_0.jpg`;
/** Wide splash art, for the hero. */
export const champSplash = (key) => `${DD_SPLASH}/${key}_0.jpg`;

// ═════════════════════════════════════════════════════════════════════════
//  SHORTLIST → draftStore.recommendations (avec mapping de noms de champs)
// ═════════════════════════════════════════════════════════════════════════
//
// Adapt API fields without inventing probabilities or uncertainty intervals.
export function mapRec(rec) {
  // Avantage signé en points de win rate vs la moyenne du pool — pas une note sur 100.
  const score = Math.round((rec.total_score || 0) * 10) / 10;
  const bd = rec.breakdown || {};
  const round1 = v => Math.round((v || 0) * 10) / 10;

  const muList = rec.matchup_details || [];
  const probability = bd.ml_explanation?.win_probability;
  const winProb = Number.isFinite(probability) ? probability * 100 : null;

  return {
    id:         rec.champion_id,
    key:        rec.champion_key,
    name:       rec.champion_name,
    score,
    sd:         rec.score_sd ?? null,
    tie:        !!rec.tie_with_leader,
    terms:      (bd.terms || []).map(t => ({ name: t.name, value: t.value, sd: t.sd, source: t.source, sample: t.sample || 0, note: t.note || '' })),
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
      meta:    round1(bd.meta),
      matchup: round1(bd.matchup),
      synergy: round1(bd.synergy),
      comp:    round1(bd.composition),  // API: 'composition'
      mastery: round1(bd.mastery),
      risk:    round1(bd.draft_risk),   // API: 'draft_risk' = adversaire à venir
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
      name:   s.ally_name,
      role:   s.ally_role,
      delta:  s.delta,
      games:  s.games || 0,
      source: s.source,
    })),
  };
}

// Placeholder vide — évite les crashes dans DraftPanel/Reasoning avant le premier ANALYSER.
// Pas de vrais champions : name vide, score 0, listes vides.
const _emptyPlaceholder = {
  key: '', name: '—',
  score: 0,
  sd: null, tie: false, terms: [], inPool: false, confidence: 0, winProb: null,
  tags: [], verdict: '', reasons: [], mechanics: [], wpa: null,
  breakdown: { meta: 0, matchup: 0, synergy: 0, comp: 0, mastery: 0, risk: 0 },
  matchups: [], synergies: [],
};
const _mockShortlist = [_emptyPlaceholder];

/** The recommendations of a draft, mapped for display; one placeholder while there are none. */
export function shortlist(recommendations) {
  return recommendations?.length ? recommendations.map(mapRec) : _mockShortlist;
}

// True when the user has at least one champion configured in their pool for this role.
// UI uses this to show the "Aucun pool défini" warning.
export function hasPoolForRole(role) {
  const pool = useUserStore.getState().championPool || {};
  return (pool[role] || []).length > 0;
}

export const ROLE_LABEL = {
  top: 'TOP', jungle: 'JGL', mid: 'MID', bot: 'ADC', support: 'SUP',
};

export const TAG_CFG = {
  'counter':       { label: 'COUNTER',   cls: ''  },
  'safe-blind':    { label: 'SAFE',      cls: 'tag--ok'      },
  'meta-forte':    { label: 'META S',    cls: 'tag--hot'  },
  'flex':          { label: 'FLEX',      cls: '' },
  'last-pick-counter': { label: 'LAST PICK', cls: '' },
  // API tags supplémentaires (non affichés mais présents pour éviter les erreurs TAG_CFG lookup)
  'counter-pick':      { label: 'COUNTER',   cls: ''  },
  'first-pick-safe':   { label: 'SAFE',      cls: 'tag--ok'      },
  'niche-counter':     { label: 'NICHE',     cls: 'tag--muted' },
  'off-meta':          { label: 'OFF META',  cls: 'tag--muted' },
  'low-data':          { label: 'LOW DATA',  cls: 'tag--warn' },
  'risky-blind':       { label: 'BLIND RISQUÉ', cls: 'tag--warn' },
  'comfort':           { label: 'CONFORT',  cls: 'tag--ok'      },
};

export const KIND_CFG = {
  synergy: { bullet: '⟳', tone: 'synergy' },
  counter: { bullet: '⚔', tone: 'counter' },
  // API uses 'warning' while older payloads use 'warn' — both map to the same tone
  warn:    { bullet: '!', tone: 'warning' },
  warning: { bullet: '!', tone: 'warning' },
  info:    { bullet: '▸', tone: 'info' },
};
