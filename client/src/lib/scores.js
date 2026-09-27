/**
 * Score display utilities: signed advantages in win-rate points and their uncertainty.
 */

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

/** CSS colour for a signed advantage in win-rate points: for you, against you, or neutral. */
export function advantageColor(value) {
  const v = Number(value) || 0;
  if (v >= 1) return 'var(--ok)';
  if (v <= -1) return 'var(--accent-text)';
  return 'var(--bone-2)';
}
