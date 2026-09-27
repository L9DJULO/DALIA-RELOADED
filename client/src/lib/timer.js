/** A champion-select phase lasts 30 s; the bar under the top bar drains over that span. */
export const PHASE_SECONDS = 30;
/** From this many seconds left, the timer turns red. */
export const URGENT_SECONDS = 10;

/** What the top-bar timer shows: seconds left, the drain ratio of the bar, and urgency. */
export function timerView({ active, remaining }) {
  if (!active) return { text: '--', ratio: 0, danger: false };
  const t = Math.max(0, Math.round(Number(remaining) || 0));
  return { text: String(t).padStart(2, '0'), ratio: Math.min(1, t / PHASE_SECONDS), danger: t <= URGENT_SECONDS };
}

/** "1ᵉʳ PICK", "4ᵉ PICK". */
export function pickOrderLabel(order) {
  return `${order}${Number(order) === 1 ? 'ᵉʳ' : 'ᵉ'} PICK`;
}
