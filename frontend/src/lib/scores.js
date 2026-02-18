/**
 * Centralized score color/display utilities.
 * Single source of truth — used by RecommendationCard, ScoreBreakdown, etc.
 */

const SCORE_THRESHOLDS = [
  { min: 70, key: 'emerald' },
  { min: 55, key: 'sky' },
  { min: 40, key: 'amber' },
  { min: -Infinity, key: 'red' },
];

export const SCORE_COLORS = {
  emerald: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/25',
    bar: 'bg-emerald-500',
  },
  sky: {
    text: 'text-sky-400',
    bg: 'bg-sky-500/15',
    border: 'border-sky-500/25',
    bar: 'bg-sky-500',
  },
  amber: {
    text: 'text-amber-400',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/25',
    bar: 'bg-amber-500',
  },
  red: {
    text: 'text-red-400',
    bg: 'bg-red-500/15',
    border: 'border-red-500/25',
    bar: 'bg-red-500',
  },
};

/** Get the color key for a 0–100 score value. */
export function getScoreColor(value) {
  for (const t of SCORE_THRESHOLDS) {
    if (value >= t.min) return t.key;
  }
  return 'red';
}

/** Get { text, bg, border, bar } Tailwind classes for a score value. */
export function getScoreClasses(value) {
  return SCORE_COLORS[getScoreColor(value)];
}

/** Format large game counts: 3400 → "3.4k", 125000 → "125k" */
export function formatGames(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

/** Win probability color: ≥52 green, ≥48 amber, else red */
export function getWinProbColor(wp) {
  if (wp >= 52) return 'text-emerald-400';
  if (wp >= 48) return 'text-amber-400';
  return 'text-red-400';
}
