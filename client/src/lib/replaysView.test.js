import { describe, expect, it } from 'vitest';
import { RESULTS, resultView, statsSummary, formatWhen, stepCount } from './replaysView';

describe('results', () => {
  it('offers the three results the server accepts', () => {
    expect(RESULTS.map(r => r.value)).toEqual(['win', 'loss', 'remake']);
  });

  it('labels a result in French with its tone', () => {
    expect(resultView('win')).toEqual({ label: 'VICTOIRE', tone: 'ok' });
    expect(resultView('loss')).toEqual({ label: 'DÉFAITE', tone: 'bad' });
    expect(resultView('remake')).toEqual({ label: 'REMAKE', tone: '' });
    expect(resultView(null)).toEqual({ label: 'RÉSULTAT ?', tone: 'dashed' });
  });
});

describe('statsSummary', () => {
  it('summarises played drafts with a win rate', () => {
    expect(statsSummary({ total: 3, wins: 1, losses: 1, most_played_champion: 'Orianna', best_role: 'mid' })).toEqual([
      { label: 'Drafts', value: '3' },
      { label: 'Victoires', value: '1' },
      { label: 'Défaites', value: '1' },
      { label: 'Win rate', value: '50,0 %' },
      { label: 'Champion', value: 'Orianna' },
      { label: 'Rôle', value: 'MID' },
    ]);
  });

  it('shows no win rate before any known result', () => {
    expect(statsSummary({ total: 2, wins: 0, losses: 0 }).find(s => s.label === 'Win rate').value).toBe('—');
  });

  it('shows nothing without drafts', () => {
    expect(statsSummary(null)).toEqual([]);
    expect(statsSummary({ total: 0 })).toEqual([]);
  });
});

describe('formatWhen', () => {
  it('writes a short French date and time', () => {
    const text = formatWhen('2026-09-26T20:14:00Z');
    expect(text).toMatch(/26 sept\.? \d{2}:\d{2}/);
  });

  it('stays silent on a missing date', () => {
    expect(formatWhen(null)).toBe('');
  });
});

describe('stepCount', () => {
  it('reads the step count from the list or the full timeline', () => {
    expect(stepCount({ timeline_steps: 14 })).toBe(14);
    expect(stepCount({ timeline: [1, 2] })).toBe(2);
    expect(stepCount({})).toBe(0);
  });
});
