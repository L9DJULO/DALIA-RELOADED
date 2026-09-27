import { describe, expect, it } from 'vitest';
import { normalizeName, searchChampions } from './championSearch';

const champions = [
  { id: 145, name: "Kai'Sa" }, { id: 61, name: 'Orianna' }, { id: 893, name: 'Aurora' },
  { id: 59, name: 'Jarvan IV' }, { id: 20, name: 'Nunu & Willump' }, { id: 136, name: 'Aurelion Sol' },
  { id: 3, name: 'Galio' }, { id: 34, name: 'Anivia' }, { id: 17, name: 'Teemo' },
];
const names = list => list.map(c => c.name);

describe('normalizeName', () => {
  it('ignores case, accents, spaces and punctuation', () => {
    expect(normalizeName("Kai'Sa")).toBe('kaisa');
    expect(normalizeName('Nunu & Willump')).toBe('nunuwillump');
    expect(normalizeName('Éclat')).toBe('eclat');
  });
});

describe('searchChampions', () => {
  it('finds a champion however the apostrophe is typed', () => {
    expect(names(searchChampions(champions, 'kaisa'))[0]).toBe("Kai'Sa");
    expect(names(searchChampions(champions, "kai'sa"))[0]).toBe("Kai'Sa");
    expect(names(searchChampions(champions, 'KAI SA'))[0]).toBe("Kai'Sa");
  });

  it('puts name prefixes first, then word starts, then other matches', () => {
    expect(names(searchChampions(champions, 'au'))).toEqual(['Aurelion Sol', 'Aurora']);
    expect(names(searchChampions(champions, 'sol'))).toEqual(['Aurelion Sol']);
    expect(names(searchChampions(champions, 'ia'))).toEqual(['Anivia', 'Orianna']);
    expect(names(searchChampions(champions, 'wil'))).toEqual(['Nunu & Willump']);
  });

  it('matches a champion from the first letter', () => {
    expect(names(searchChampions(champions, 'j'))).toEqual(['Jarvan IV']);
  });

  it('leaves out picked and banned champions', () => {
    expect(names(searchChampions(champions, 'ori', new Set([61])))).toEqual([]);
  });

  it('returns nothing for an empty or punctuation-only query', () => {
    expect(searchChampions(champions, '')).toEqual([]);
    expect(searchChampions(champions, " ' ")).toEqual([]);
  });

  it('caps the number of results', () => {
    expect(searchChampions(champions, 'a', new Set(), 3)).toHaveLength(3);
  });
});
