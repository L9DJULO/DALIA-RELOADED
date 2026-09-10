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

/**
 * Format an advantage in win-rate points: "+3.1", "−1.8", "0.0".
 * The value is already a signed delta vs the pool mean — never a 0-100 score.
 */
export function formatAdvantage(value) {
  const v = Number(value) || 0;
  // Rounding is symmetric around zero: −1.75 → −1.8, like +1.75 → +1.8.
  const magnitude = Math.round(Math.abs(v) * 10) / 10;
  if (magnitude < 0.05) return '0.0';
  return `${v > 0 ? '+' : '−'}${magnitude.toFixed(1)}`;
}

/** Format an uncertainty: "±1.4", or "" when unknown. */
export function formatSd(sd) {
  return sd == null || !Number.isFinite(Number(sd)) ? '' : `±${Number(sd).toFixed(1)}`;
}

/** CSS colour for a signed advantage in win-rate points. */
export function advantageColor(value) {
  const v = Number(value) || 0;
  if (v >= 1) return 'var(--win)';
  if (v <= -1) return 'var(--loss)';
  return 'var(--text-muted)';
}

/**
 * Format a win rate as WPA (Win Rate Added = WR − 50%).
 * Shows a +/− prefix for immediate readability.
 * @param {number} winRate  0–100 scale (e.g. 53.2)
 * @returns {string} e.g. "+3.2%", "−1.8%", "0.0%"
 */
export function formatWPA(winRate) {
  const wpa = winRate - 50;
  const sign = wpa > 0 ? '+' : '';
  return `${sign}${wpa.toFixed(1)}%`;
}

/**
 * Tailwind text color class for a WPA value (accepts raw 0–100 WR).
 * ≥ +5 WPA (55% WR) → emerald, ≥ 0 (50%) → amber, < 0 → red
 */
export function getWPAColor(winRate) {
  const wpa = winRate - 50;
  if (wpa >= 5) return 'text-emerald-400';
  if (wpa >= 0) return 'text-amber-400';
  return 'text-red-400';
}
