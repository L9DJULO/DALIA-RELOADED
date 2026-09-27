/**
 * Automatic analysis: each real change of the draft (a pick or a ban on either side,
 * the team, the role, the pick order) launches a new analysis after a short pause, so a
 * burst of changes gives one request. League client hovers do not count: teammates hover
 * champions every few seconds. A newer analysis supersedes the one in flight (draftStore).
 */
import useDraftStore from '../stores/draftStore';
import { ROLES } from '../lib/constants';

export const AUTO_ANALYSIS_DELAY = 350;

const ids = slots => (slots || []).map(c => c?.id ?? null);

/** What the recommendations depend on in the draft itself. */
export function draftSignature(state) {
  return JSON.stringify([
    state.myTeam, state.myRole, Number(state.myPickOrder),
    ids(state.blueBans), ids(state.redBans),
    ROLES.map(role => state.allyPicks?.[role]?.id ?? null), ids(state.enemyPicks),
  ]);
}

/** Start listening to the draft; returns the function that stops it. */
export function startAutoAnalysis({ delay = AUTO_ANALYSIS_DELAY } = {}) {
  let last = draftSignature(useDraftStore.getState());
  let timer = null;
  const off = useDraftStore.subscribe(state => {
    const next = draftSignature(state);
    if (next === last) return;
    last = next;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; useDraftStore.getState().getRecommendations(); }, delay);
  });
  return () => { off(); clearTimeout(timer); };
}
