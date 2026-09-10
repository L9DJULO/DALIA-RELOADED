import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', async importOriginal => ({ ...await importOriginal(), fetchRecommendations: vi.fn(),
  fetchProfile: vi.fn(), updatePool: vi.fn(), fetchChampions: vi.fn(), fetchPatch: vi.fn(), updateMe: vi.fn(),
  fetchDuoCode: vi.fn(), fetchDuoStatus: vi.fn(), fetchDuoPartnerPool: vi.fn(), fetchHistory: vi.fn() }));
vi.mock('../services/lcu', () => ({ lcuStatus: vi.fn(async () => ({ connected: false })), lcuConnect: vi.fn(), lcuDisconnect: vi.fn(), lcuSummonerInfo: vi.fn() }));
import * as api from '../services/api';
import useUserStore from './userStore';
import useDraftStore from './draftStore';
import useLCUStore from './lcuStore';
import useChampionsStore from './championsStore';
import useDuoStore from './duoStore';
import useHistoryStore from './historyStore';
import { startDraftSession } from '../services/draftSession';
import { mapRec } from '../data/mock';
import { validateReplay } from '../lib/replay';

const ahri = { id: 103, key: 'Ahri', name: 'Ahri' };
const orianna = { id: 61, key: 'Orianna', name: 'Orianna' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); window.dispatchEvent(new Event('dalia:logout'));
  vi.clearAllMocks(); api.updatePool.mockResolvedValue({}); api.updateMe.mockResolvedValue({});
});
afterEach(() => { window.dispatchEvent(new Event('dalia:logout')); vi.useRealTimers(); });

it('does not upload the previous account pool after an expired session', async () => {
  api.fetchProfile.mockResolvedValueOnce({ champion_pool: { mid: [{ champion_id: 103, champion_key: 'Ahri', tier: 'A' }] } });
  await useUserStore.getState().loadProfile('A');
  useUserStore.getState().addToPool('mid', orianna);
  window.dispatchEvent(new Event('dalia:logout'));
  api.fetchProfile.mockResolvedValueOnce({ champion_pool: {} });
  await useUserStore.getState().loadProfile('B');
  await vi.runAllTimersAsync();
  expect(useUserStore.getState().championPool.mid).toEqual([]);
  expect(api.updatePool).not.toHaveBeenCalled();
});

it('discards an old profile response when another account loads', async () => {
  const a = deferred(); api.fetchProfile.mockReturnValueOnce(a.promise).mockResolvedValueOnce({ champion_pool: {} });
  const first = useUserStore.getState().loadProfile('A');
  await useUserStore.getState().loadProfile('B');
  a.resolve({ champion_pool: { mid: [{ champion_id: 103 }] } }); await first;
  expect(useUserStore.getState().ownerId).toBe('B');
  expect(useUserStore.getState().championPool.mid).toEqual([]);
});

it('does not restore duo or history after logout from late responses', async () => {
  const pendingDuo = deferred(), pendingHistory = deferred();
  api.fetchDuoCode.mockResolvedValue({ duo_code: 'OLD' });
  api.fetchDuoStatus.mockReturnValue(pendingDuo.promise);
  api.fetchHistory.mockReturnValue(pendingHistory.promise);
  const duoWork = useDuoStore.getState().loadDuoState();
  const historyWork = useHistoryStore.getState().loadHistory();
  window.dispatchEvent(new Event('dalia:logout'));
  pendingDuo.resolve({ linked: true, partner: { id: 'old-partner' } });
  pendingHistory.resolve([{ id: 'old-history' }]);
  await Promise.all([duoWork, historyWork]);
  expect(useDuoStore.getState().partner).toBeNull();
  expect(api.fetchDuoPartnerPool).not.toHaveBeenCalled();
  expect(useHistoryStore.getState().entries).toEqual([]);
});

it('makes a failed profile read-only and preserves errors', async () => {
  api.fetchProfile.mockRejectedValueOnce(new Error('offline'));
  await useUserStore.getState().loadProfile('A');
  useUserStore.getState().addToPool('mid', ahri);
  expect(useUserStore.getState().championPool.mid).toEqual([]);
  expect(useUserStore.getState().error).toBeTruthy();
});

it('serializes pool saves, including empty roles', async () => {
  api.fetchProfile.mockResolvedValueOnce({ champion_pool: {} });
  await useUserStore.getState().loadProfile('A');
  const pending = deferred(); api.updatePool.mockReturnValueOnce(pending.promise);
  useUserStore.getState().addToPool('mid', ahri);
  await vi.advanceTimersByTimeAsync(500);
  useUserStore.getState().removeFromPool('mid', 103);
  await vi.advanceTimersByTimeAsync(500);
  expect(api.updatePool).toHaveBeenCalledTimes(1);
  pending.resolve({}); await vi.advanceTimersByTimeAsync(1);
  expect(api.updatePool).toHaveBeenCalledTimes(2);
  expect(api.updatePool.mock.calls[1][1]).toEqual([]);
});

it('ignores analysis that finishes after reset', async () => {
  const pending = deferred(); api.fetchRecommendations.mockReturnValueOnce(pending.promise);
  const work = useDraftStore.getState().getRecommendations();
  useDraftStore.getState().resetDraft('manual');
  pending.resolve({ recommendations: [{ champion_id: 103 }] }); await work;
  expect(useDraftStore.getState().recommendations).toEqual([]);
  expect(useDraftStore.getState().loading).toBe(false);
});

it('passes pick order, preferences and duo options to analysis', async () => {
  useDraftStore.getState().setMyPickOrder(4);
  useUserStore.setState({ championPool: { mid: [{ champion_id: 103, tier: 'A' }] }, weightOverrides: { meta: .2 }, enableWildcard: false });
  useDuoStore.setState({ duoActive: true, linked: true, partner: { id: 'partner' }, partnerRole: 'jungle' });
  api.fetchRecommendations.mockResolvedValueOnce({ recommendations: [] });
  await useDraftStore.getState().getRecommendations();
  const args = api.fetchRecommendations.mock.calls[0];
  expect(args[0].my_pick_order).toBe(4); expect(args[2]).toEqual({ meta: .2 });
  expect(args[3]?.active).toBe(true); expect(args[5].enableWildcard).toBe(false);
});

it('marks recommendations stale on an edit', () => {
  useDraftStore.setState({ recommendations: [{ champion_id: 61 }] });
  useDraftStore.getState().setAllyPick('mid', ahri);
  expect(useDraftStore.getState().stale).toBe(true);
});

it('applies but flags stale an analysis finished after a preference change', async () => {
  const pending = deferred(); api.fetchRecommendations.mockReturnValueOnce(pending.promise);
  const work = useDraftStore.getState().getRecommendations();
  useUserStore.setState({ weightOverrides: { meta: .1 } });
  pending.resolve({ recommendations: [{ champion_id: 103 }] }); await work;
  expect(useDraftStore.getState().recommendations).toEqual([{ champion_id: 103 }]);
  expect(useDraftStore.getState().stale).toBe(true);
  expect(useDraftStore.getState().loading).toBe(false);
});

it('keeps a running analysis alive when the League client reports a hover', async () => {
  useChampionsStore.setState({ loaded: true, byId: { 103: ahri, 61: orianna } });
  useDraftStore.getState().setMode('live');
  const stop = startDraftSession(); await Promise.resolve();
  useLCUStore.setState({ connected: true, inChampSelect: true, myTeam: 'blue', myRole: 'mid', myPickOrder: 1,
    allyPicks: {}, enemyPicksOrder: [], allyBans: [], enemyBans: [], allyPrepicks: {} });
  const pending = deferred(); api.fetchRecommendations.mockReturnValueOnce(pending.promise);
  const work = useDraftStore.getState().getRecommendations();
  useLCUStore.setState({ allyPrepicks: { top: 61 } });
  expect(useDraftStore.getState().loading).toBe(true);
  expect(api.fetchRecommendations.mock.calls[0][5].signal.aborted).toBe(false);
  pending.resolve({ recommendations: [{ champion_id: 103 }] }); await work;
  expect(useDraftStore.getState().recommendations).toEqual([{ champion_id: 103 }]);
  expect(useDraftStore.getState().stale).toBe(true);
  stop();
});

it('leaving replay mode keeps only the steps already seen', () => {
  const draft = useDraftStore.getState(); draft.resetDraft('manual'); draft.setAllyPick('mid', ahri); draft.setEnemyPick(0, orianna);
  const steps = validateReplay(draft.exportSession()).steps;
  draft.loadReplay(steps, 1, true);
  const replayId = useDraftStore.getState().sessionId;
  draft.setMode('manual');
  expect(useDraftStore.getState().timeline).toHaveLength(2);
  expect(useDraftStore.getState().sessionId).not.toBe(replayId);
  expect(useDraftStore.getState().enemyPicks[0]).toBeNull();
});

it('does not commit placeholder champions before the catalogue is available', async () => {
  useChampionsStore.setState({ loaded: false, error: null, byId: {} });
  useDraftStore.getState().setMode('live');
  const stop = startDraftSession(); await Promise.resolve();
  useLCUStore.setState({ connected: true, inChampSelect: true, myTeam: 'blue', myRole: 'mid', myPickOrder: 1,
    allyPicks: { mid: 103 }, enemyPicksOrder: [], allyBans: [], enemyBans: [], allyPrepicks: {} });
  expect(useDraftStore.getState().allyPicks.mid).toBeNull();
  useChampionsStore.setState({ loaded: true, byId: { 103: ahri } });
  expect(useDraftStore.getState().allyPicks.mid).toEqual(ahri);
  stop();
});

it('publishes League state only when it changes', async () => {
  const { lcuStatus } = await import('../services/lcu');
  lcuStatus.mockResolvedValue({ connected: true, in_champ_select: true, my_team: 'blue', ally_picks: { mid: 103 }, pick_sequence: [{ team: 'blue', champId: 103 }] });
  let notifications = 0; const off = useLCUStore.subscribe(() => { notifications++; });
  await useLCUStore.getState().fetchStatus();
  await useLCUStore.getState().fetchStatus();
  off();
  expect(notifications).toBe(1);
  expect(useLCUStore.getState().pickSequence).toEqual([{ team: 'blue', champId: 103 }]);
});

it('serves the cached catalogue immediately and keeps it when the server is unreachable', async () => {
  localStorage.setItem('dalia_champions_v1', JSON.stringify({ ts: Date.now() - 48 * 3600 * 1000, patch: '16.16.1', data: [ahri] }));
  const patch = deferred(); api.fetchPatch.mockReturnValueOnce(patch.promise);
  useChampionsStore.setState({ champions: [], byId: {}, loaded: false, loading: false, error: null });
  const work = useChampionsStore.getState().load();
  expect(useChampionsStore.getState().loaded).toBe(true);
  expect(useChampionsStore.getState().byId[103]).toEqual(ahri);
  patch.resolve(Promise.reject(new Error('offline'))); await work;
  expect(useChampionsStore.getState().champions).toEqual([ahri]);
  expect(useChampionsStore.getState().error).toBeNull();
  expect(api.fetchChampions).not.toHaveBeenCalled();
});

it('replaces a cached catalogue when the patch changed', async () => {
  localStorage.setItem('dalia_champions_v1', JSON.stringify({ ts: Date.now(), patch: '16.16.1', data: [ahri] }));
  api.fetchPatch.mockResolvedValueOnce({ version: '16.17.1' });
  api.fetchChampions.mockResolvedValueOnce([ahri, orianna]);
  useChampionsStore.setState({ champions: [], byId: {}, loaded: false, loading: false, error: null });
  await useChampionsStore.getState().load();
  expect(useChampionsStore.getState().champions).toHaveLength(2);
  expect(JSON.parse(localStorage.getItem('dalia_champions_v1')).patch).toBe('16.17.1');
});

it('opening an imported replay cannot overwrite an unrelated saved session', () => {
  const draft = useDraftStore.getState(); draft.resetDraft('manual'); draft.setAllyPick('mid', ahri);
  const original = draft.exportSession();
  draft.loadReplay(original.steps, 0, true);
  const importedId = useDraftStore.getState().sessionId;
  expect(importedId).not.toBe(original.session_id);
  draft.loadReplay(original.steps, 1);
  expect(useDraftStore.getState().sessionId).toBe(importedId);
});

it('synchronizes a live snapshot but respects manual mode', async () => {
  useChampionsStore.setState({ loaded: true, byId: { 103: ahri, 61: orianna } });
  useDraftStore.getState().setMode('live');
  const stop = startDraftSession(); await Promise.resolve();
  useLCUStore.setState({ connected: true, inChampSelect: true, myTeam: 'red', myRole: 'mid', myPickOrder: 3,
    allyPicks: { mid: 103 }, enemyPicksOrder: [61], allyBans: [], enemyBans: [], allyPrepicks: {} });
  expect(useDraftStore.getState().allyPicks.mid.id).toBe(103);
  expect(useDraftStore.getState().myPickOrder).toBe(3);
  useDraftStore.getState().setMode('manual');
  useLCUStore.setState({ allyPicks: {} });
  expect(useDraftStore.getState().allyPicks.mid.id).toBe(103);
  stop();
});

it('replays past steps without revealing future picks and forks a new session', () => {
  const draft = useDraftStore.getState(); draft.resetDraft('manual'); draft.setAllyPick('mid', ahri); draft.setEnemyPick(0, orianna);
  const exported = draft.exportSession(); const valid = validateReplay(exported);
  draft.loadReplay(valid.steps, 1);
  expect(useDraftStore.getState().allyPicks.mid.id).toBe(103);
  expect(useDraftStore.getState().enemyPicks[0]).toBeNull();
  const oldId = useDraftStore.getState().sessionId;
  draft.forkReplay(); expect(useDraftStore.getState().sessionId).not.toBe(oldId);
  expect(useDraftStore.getState().timeline).toHaveLength(2);
});

it('rejects malformed replays', () => {
  expect(() => validateReplay({ schema_version: 1, steps: [{ at: 'bad', state: {} }] })).toThrow();
});

it('never invents P(win), WPA or confidence intervals from scores', () => {
  const rec = mapRec({ total_score: 90, champion_key: 'Ahri', breakdown: {}, matchup_details: [{ win_rate: 58 }], tags: ['hors-pool', 'flex'] });
  expect(rec.winProb).toBeNull(); expect(rec).not.toHaveProperty('scoreRange'); expect(rec.wpa).toBeNull();
  expect(rec.tags).toEqual(['flex']);
  expect(mapRec({ total_score: 40, breakdown: { ml_explanation: { win_probability: .531 } } }).winProb).toBeCloseTo(53.1);
});

it('sends the League rank, then the profile rank, as rank_bucket', async () => {
  useUserStore.setState({ championPool: { mid: [{ champion_id: 103, tier: 'A' }] }, rankTier: 'gold' });
  api.fetchRecommendations.mockResolvedValue({ recommendations: [] });
  await useDraftStore.getState().getRecommendations();
  expect(api.fetchRecommendations.mock.calls[0][5].rankBucket).toBe('gold');
  useLCUStore.setState({ connected: true, summoner: { puuid: 'p', region: 'EUW', rankTier: 'DIAMOND' } });
  await useDraftStore.getState().getRecommendations();
  expect(api.fetchRecommendations.mock.calls[1][5].rankBucket).toBe('DIAMOND');
});

it('stores the profile rank and multiplier preferences', async () => {
  api.fetchProfile.mockResolvedValue({ username: 'u', champion_pool: {}, preferred_roles: ['mid'], enable_wildcard: true, enable_off_meta: true, weight_overrides: { meta: 1.2 }, rank_tier: 'silver' });
  await useUserStore.getState().loadProfile('u');
  expect(useUserStore.getState().rankTier).toBe('silver');
  expect(useUserStore.getState().weightOverrides).toEqual({ meta: 1.2 });
});
