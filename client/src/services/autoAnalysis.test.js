import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useDraftStore from '../stores/draftStore';
import { draftSignature, startAutoAnalysis, AUTO_ANALYSIS_DELAY } from './autoAnalysis';

const ahri = { id: 103, key: 'Ahri', name: 'Ahri' };
const jarvan = { id: 59, key: 'JarvanIV', name: 'Jarvan IV' };
const zed = { id: 238, key: 'Zed', name: 'Zed' };

describe('draftSignature', () => {
  const base = () => ({ ...useDraftStore.getState() });
  beforeEach(() => useDraftStore.getState().resetDraft('manual'));

  it('changes with a pick, a ban, the team, the role or the pick order', () => {
    const before = draftSignature(base());
    for (const patch of [
      { allyPicks: { ...base().allyPicks, mid: ahri } },
      { enemyPicks: [jarvan, null, null, null, null] },
      { blueBans: [zed, null, null, null, null] },
      { myTeam: 'red' }, { myRole: 'top' }, { myPickOrder: 3 },
    ]) expect(draftSignature({ ...base(), ...patch })).not.toBe(before);
  });

  it('ignores hovers and the current action', () => {
    const before = draftSignature(base());
    expect(draftSignature({ ...base(), allyPrepicks: { ...base().allyPrepicks, top: jarvan }, currentAction: 7 })).toBe(before);
  });
});

describe('startAutoAnalysis', () => {
  let analyse, stop;
  beforeEach(() => {
    vi.useFakeTimers();
    useDraftStore.getState().resetDraft('manual');
    analyse = vi.fn();
    useDraftStore.setState({ getRecommendations: analyse });
    stop = startAutoAnalysis();
  });
  afterEach(() => { stop(); vi.useRealTimers(); });

  it('analyses the draft on its own after a pick', () => {
    useDraftStore.getState().setEnemyPick(0, jarvan);
    expect(analyse).not.toHaveBeenCalled();
    vi.advanceTimersByTime(AUTO_ANALYSIS_DELAY);
    expect(analyse).toHaveBeenCalledTimes(1);
  });

  it('runs once for a burst of changes', () => {
    useDraftStore.getState().setEnemyPick(0, jarvan);
    useDraftStore.getState().setBan('blue', 0, zed);
    useDraftStore.getState().setAllyPick('mid', ahri);
    vi.advanceTimersByTime(AUTO_ANALYSIS_DELAY);
    expect(analyse).toHaveBeenCalledTimes(1);
  });

  it('does not analyse again for a hover from the League client', () => {
    useDraftStore.getState().change({ allyPrepicks: { ...useDraftStore.getState().allyPrepicks, top: jarvan } });
    vi.advanceTimersByTime(AUTO_ANALYSIS_DELAY * 2);
    expect(analyse).not.toHaveBeenCalled();
  });

  it('does not analyse when a new draft starts empty', () => {
    useDraftStore.getState().resetDraft('manual');
    vi.advanceTimersByTime(AUTO_ANALYSIS_DELAY * 2);
    expect(analyse).not.toHaveBeenCalled();
  });

  it('analyses each step of a replay', () => {
    const draft = useDraftStore.getState();
    draft.setEnemyPick(0, jarvan); draft.setAllyPick('mid', ahri);
    vi.advanceTimersByTime(AUTO_ANALYSIS_DELAY);
    analyse.mockClear();
    const steps = useDraftStore.getState().exportSession().steps;
    useDraftStore.getState().loadReplay(steps, 1, true);
    vi.advanceTimersByTime(AUTO_ANALYSIS_DELAY);
    expect(analyse).toHaveBeenCalledTimes(1);
  });

  it('stops listening once the session ends', () => {
    stop();
    useDraftStore.getState().setEnemyPick(0, jarvan);
    vi.advanceTimersByTime(AUTO_ANALYSIS_DELAY * 2);
    expect(analyse).not.toHaveBeenCalled();
  });
});
