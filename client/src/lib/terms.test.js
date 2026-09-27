import { describe, expect, it } from 'vitest';
import { groupTerms, termBar, intervalScale, intervalGeometry, heroNameSize, TERM_LABEL } from './terms';

const term = (name, value, source = 'observed', sd = 0.5) => ({ name, value, sd, source, sample: 0, note: '' });

describe('groupTerms', () => {
  it('orders families and terms the same way whatever the API order', () => {
    const groups = groupTerms([term('popularity', -0.6), term('mastery', 0.4, 'heuristic'), term('meta', 1.3), term('matchup', 0.9), term('future_opponent', -0.3, 'model')]);
    expect(groups.map(g => g.id)).toEqual(['opponents', 'you', 'patch']);
    expect(groups[0].terms.map(t => t.name)).toEqual(['matchup', 'future_opponent']);
    expect(groups[2].terms.map(t => t.name)).toEqual(['meta', 'popularity']);
  });

  it('labels terms in plain words and keeps the engine name', () => {
    const [group] = groupTerms([term('scaling', -0.4, 'heuristic')]);
    expect(group.terms[0]).toMatchObject({ label: TERM_LABEL.scaling, technical: 'Scaling adverse', estimated: true });
  });

  it('marks only observed terms as measured', () => {
    const [group] = groupTerms([term('matchup', 0.9, 'observed'), term('future_opponent', -0.3, 'model')]);
    expect(group.terms.map(t => t.estimated)).toEqual([false, true]);
  });

  it('shows a term the client does not know yet under its engine name', () => {
    const groups = groupTerms([term('meta', 1), term('lane_priority', 0.7, 'heuristic')]);
    expect(groups.at(-1)).toMatchObject({ id: 'other', label: 'Autres' });
    expect(groups.at(-1).terms[0]).toMatchObject({ name: 'lane_priority', label: 'lane_priority' });
  });

  it('returns nothing for a missing breakdown', () => {
    expect(groupTerms(undefined)).toEqual([]);
  });
});

describe('termBar', () => {
  it('draws a positive term to the right of the centre line', () => {
    expect(termBar(1, 0.5, 2)).toEqual({ side: 'pos', left: 50, width: 25, whiskerLeft: 62.5, whiskerWidth: 25 });
  });

  it('draws a negative term to the left of the centre line', () => {
    expect(termBar(-0.5, 0, 2)).toMatchObject({ side: 'neg', left: 37.5, width: 12.5, whiskerWidth: 0 });
  });

  it('keeps bars and whiskers inside the track for large values', () => {
    const bar = termBar(5, 3, 2);
    expect(bar.left + bar.width).toBeLessThanOrEqual(100);
    expect(bar.whiskerLeft).toBeGreaterThanOrEqual(0);
    expect(bar.whiskerLeft + bar.whiskerWidth).toBeLessThanOrEqual(100);
  });

  it('draws nothing for a zero term without uncertainty', () => {
    expect(termBar(0, null)).toMatchObject({ side: 'zero', width: 0, whiskerWidth: 0 });
  });
});

describe('interval scale and geometry', () => {
  it('uses a ±4 scale for ordinary advantages', () => {
    expect(intervalScale([{ score: 2.4, sd: 1.1 }, { score: -0.6, sd: 1.4 }])).toBe(4);
  });

  it('widens the scale for an extreme advantage, up to ±10', () => {
    expect(intervalScale([{ score: 6.3, sd: 2 }])).toBe(9);
    expect(intervalScale([{ score: -14, sd: 3 }])).toBe(10);
  });

  it('places the point and its uncertainty band on the scale', () => {
    expect(intervalGeometry(2, 1, 4)).toEqual({ point: 75, left: 62.5, width: 25 });
  });

  it('clips a band that runs past the scale', () => {
    const g = intervalGeometry(3.5, 2, 4);
    expect(g.left + g.width).toBeLessThanOrEqual(100);
    expect(g.point).toBeLessThanOrEqual(100);
  });

  it('draws a point only when the uncertainty is unknown', () => {
    expect(intervalGeometry(-2, null, 4)).toEqual({ point: 25, left: 25, width: 0 });
  });
});

describe('heroNameSize', () => {
  it('keeps short names at full size and shrinks long ones', () => {
    expect(heroNameSize('Ahri')).toBe(68);
    expect(heroNameSize('Aurelion Sol')).toBeLessThan(68);
    expect(heroNameSize('Nunu & Willump')).toBeLessThan(heroNameSize('Aurelion Sol'));
  });

  it('never goes below a readable size', () => {
    expect(heroNameSize('A very very long champion name')).toBe(40);
  });
});
