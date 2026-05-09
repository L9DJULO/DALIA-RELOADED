// ─────────────────────────────────────────────
// UI helpers + adapters from real stores → component shape
// ─────────────────────────────────────────────
import { getDDragonVersion } from '../lib/constants';

export const champIcon    = (key) => `https://ddragon.leagueoflegends.com/cdn/${getDDragonVersion()}/img/champion/${key}.png`;
export const champLoading = (key) => `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${key}_0.jpg`;

export const ROLE_LABEL = {
  top: 'TOP', jungle: 'JGL', mid: 'MID', bot: 'ADC', support: 'SUP',
};

export const TAG_CFG = {
  'counter':           { label: 'COUNTER',   cls: 'tag-accent'  },
  'counter-pick':      { label: 'COUNTER',   cls: 'tag-accent'  },
  'safe-blind':        { label: 'SAFE',      cls: 'tag-ok'      },
  'meta-forte':        { label: 'META S',    cls: 'tag-accent'  },
  'meta-strong':       { label: 'META S',    cls: 'tag-accent'  },
  'flex':              { label: 'FLEX',      cls: 'tag-neutral' },
  'last-pick-counter': { label: 'LAST PICK', cls: 'tag-accent'  },
  'off-meta':          { label: 'OFF META',  cls: 'tag-warn'    },
};

export const KIND_CFG = {
  synergy: { bullet: '⟳', color: 'var(--ok)',     bg: 'rgba(156,211,107,0.08)', border: 'rgba(156,211,107,0.28)' },
  counter: { bullet: '⚔', color: 'var(--accent)', bg: 'var(--accent-subtle)',   border: 'var(--accent-muted)'    },
  warn:    { bullet: '!', color: 'var(--warn)',   bg: 'rgba(245,176,39,0.08)',  border: 'rgba(245,176,39,0.3)'   },
  warning: { bullet: '!', color: 'var(--warn)',   bg: 'rgba(245,176,39,0.08)',  border: 'rgba(245,176,39,0.3)'   },
  info:    { bullet: '▸', color: 'var(--accent)', bg: 'transparent',            border: 'rgba(217,30,43,0.18)'   },
};

// ── Tier derivation from score ─────────────────
function deriveTier(score, inPool) {
  if (!inPool) return '—';
  if (score >= 85) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

// ── API recommendation → SHORTLIST entry ───────
export function recoToPick(r) {
  const score   = Math.round(r.total_score ?? 0);
  const range   = r.score_range ?? [Math.max(0, score - 4), Math.min(100, score + 4)];
  const inPool  = r.is_pool_champion !== false;
  const winProb = (r.breakdown?.ml_prediction ?? r.breakdown?.ml_explanation?.win_probability ?? r.total_score / 100) * 100;
  const bk      = r.breakdown ?? {};

  return {
    key:        r.champion_key,
    name:       r.champion_name,
    id:         r.champion_id,
    score,
    scoreRange: range,
    tier:       deriveTier(score, inPool),
    inPool,
    confidence: Math.round(r.confidence ?? 50),
    winProb,
    tags:       r.tags || [],
    verdict:    r.verdict || '',
    reasons:    (r.reasons || []).map((x) => ({
      text: x.text,
      kind: x.kind || 'info',
    })),
    breakdown: {
      meta:    bk.meta ?? 0,
      matchup: bk.matchup ?? 0,
      synergy: bk.synergy ?? 0,
      comp:    bk.composition ?? 0,
      mastery: bk.mastery ?? 0,
      risk:    bk.draft_risk ?? 0,
    },
    matchups: (r.matchup_details || []).map((m) => ({
      name:   m.opponent_name,
      role:   m.opponent_role,
      delta:  m.delta,
      wr:     m.win_rate,
      isLane: !!m.is_lane_opponent,
    })),
    synergies: (r.synergy_details || []).map((s) => ({
      name:  s.ally_name,
      role:  s.ally_role,
      delta: s.delta,
    })),
  };
}

// ── Live pickOrder builder ─────────────────────
// LoL pick sequence (10 picks): B R R B B R R B B R
const PICK_TEAM_SEQ = ['blue','red','red','blue','blue','red','red','blue','blue','red'];

export function buildPickOrder({ myTeam, allyPicks, enemyPicks, isPickPhase }) {
  const allyArr = ['top','jungle','mid','bot','support']
    .map((r) => allyPicks[r])
    .filter(Boolean);
  const enemyArr = (enemyPicks || []).filter(Boolean);

  const blueChamps = myTeam === 'blue' ? allyArr : enemyArr;
  const redChamps  = myTeam === 'red'  ? allyArr : enemyArr;

  let bI = 0, rI = 0;
  const slots = PICK_TEAM_SEQ.map((team) => {
    const champ = team === 'blue' ? blueChamps[bI] : redChamps[rI];
    if (team === 'blue') bI++; else rI++;
    return {
      team,
      key:  champ?.key ?? null,
      done: !!champ,
      current: false,
    };
  });

  if (isPickPhase) {
    const idx = slots.findIndex((s) => !s.done);
    if (idx >= 0) slots[idx].current = true;
  }
  return slots;
}
