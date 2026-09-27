/**
 * Automatic analysis, so the player never has to press ANALYSER during a draft.
 *
 * - A real change of the draft (a pick or a ban on either side, the team, the role, the
 *   pick order) launches a new analysis after a short pause, so a burst of changes gives
 *   one request. It supersedes the analysis in flight (draftStore aborts it).
 * - Anything else that makes the advice on screen stale (a League client hover, the pool,
 *   the rank, the criteria weights, the duo) refreshes it after a longer pause, and never
 *   cancels the analysis in flight: it runs once that one has landed. Teammates hover
 *   champions every few seconds, and cancelling each time could keep any answer from landing.
 * - Nothing is refreshed before the first advice exists (e.g. while the profile loads),
 *   and a failed analysis is not retried in a loop: ANALYSER relaunches it.
 */
import useDraftStore from '../stores/draftStore';
import { ROLES } from '../lib/constants';

export const AUTO_ANALYSIS_DELAY = 350;
export const AUTO_REFRESH_DELAY = 800;

const ids = slots => (slots || []).map(c => c?.id ?? null);

/** What the recommendations depend on in the draft itself. */
export function draftSignature(state) {
  return JSON.stringify([
    state.myTeam, state.myRole, Number(state.myPickOrder),
    ids(state.blueBans), ids(state.redBans),
    ROLES.map(role => state.allyPicks?.[role]?.id ?? null), ids(state.enemyPicks),
  ]);
}

/** Start listening to the draft and the preferences; returns the function that stops it. */
export function startAutoAnalysis({ delay = AUTO_ANALYSIS_DELAY, refreshDelay = AUTO_REFRESH_DELAY } = {}) {
  let last = draftSignature(useDraftStore.getState());
  let timer = null;
  let pending = null; // 'draft' | 'refresh'

  const schedule = (kind, wait, run) => {
    clearTimeout(timer);
    pending = kind;
    timer = setTimeout(() => { timer = null; pending = null; run(); }, wait);
  };
  const analyse = () => useDraftStore.getState().getRecommendations();
  const refresh = () => {
    const s = useDraftStore.getState();
    if (!s.loading && s.stale && !s.error) analyse();
  };

  const off = useDraftStore.subscribe((state, prev) => {
    const next = draftSignature(state);
    if (next !== last) {
      last = next;
      schedule('draft', delay, analyse);
      return;
    }
    if (pending === 'draft') return; // the coming analysis already covers this change
    const invalidated = state.revision !== prev.revision && state.recommendations.length > 0;
    const landedStale = prev.loading && !state.loading && state.stale && !state.error;
    if (invalidated || landedStale) schedule('refresh', refreshDelay, refresh);
  });
  return () => { off(); clearTimeout(timer); };
}
