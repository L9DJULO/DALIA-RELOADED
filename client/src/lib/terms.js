/**
 * Presentation of the engine's score terms: plain labels, a stable order by family,
 * and the geometry of the signed bars and uncertainty intervals.
 * Nothing here changes a value; the numbers come from `breakdown.terms` as the API sends them.
 */

export const TERM_FAMILIES = [
  { id: 'opponents', label: 'Adversaires', names: ['matchup', 'future_opponent', 'scaling'] },
  { id: 'team', label: 'Ton équipe', names: ['composition', 'synergy', 'archetype', 'mechanics', 'teamfight'] },
  { id: 'you', label: 'Toi', names: ['mastery'] },
  { id: 'patch', label: 'Patch', names: ['meta', 'popularity'] },
  { id: 'model', label: 'Modèle', names: ['model'] },
];

/** Labels a player understands without knowing the engine. */
export const TERM_LABEL = {
  matchup: 'Contre leurs picks',
  future_opponent: 'Risque de counter',
  scaling: 'Tempo vs leur scaling',
  composition: 'Équilibre de la compo',
  synergy: 'Synergie alliés',
  archetype: 'Plan de jeu',
  mechanics: 'Interactions de kits',
  teamfight: 'Teamfight',
  mastery: 'Ta maîtrise',
  meta: 'Force sur le patch',
  popularity: 'Popularité',
  model: 'Modèle de victoire',
};

/** The engine's own names, kept for tooltips and the comparison table. */
export const TERM_TECHNICAL = {
  matchup: 'Matchup',
  future_opponent: 'Adversaire à venir',
  scaling: 'Scaling adverse',
  composition: 'Composition',
  synergy: 'Synergie',
  archetype: 'Archétype',
  mechanics: 'Mécaniques',
  teamfight: 'Teamfight',
  mastery: 'Maîtrise',
  meta: 'Méta',
  popularity: 'Popularité',
  model: 'Modèle',
};

export const TERM_SOURCE_LABEL = { observed: 'mesuré', model: 'modèle', heuristic: 'règle' };

const ORDER = new Map(TERM_FAMILIES.flatMap(f => f.names.map((name, i) => [name, { family: f.id, index: i }])));

/** Group terms by family in a fixed order; unknown names go last, under their engine name. */
export function groupTerms(terms) {
  const buckets = new Map([...TERM_FAMILIES.map(f => [f.id, []]), ['other', []]]);
  for (const t of terms || []) {
    const place = ORDER.get(t.name);
    buckets.get(place ? place.family : 'other').push({
      ...t,
      label: TERM_LABEL[t.name] || t.name,
      technical: TERM_TECHNICAL[t.name] || t.name,
      estimated: t.source !== 'observed',
    });
  }
  const rank = name => ORDER.get(name)?.index ?? 0;
  return [...TERM_FAMILIES, { id: 'other', label: 'Autres' }]
    .map(f => ({ id: f.id, label: f.label, terms: buckets.get(f.id).sort((a, b) => rank(a.name) - rank(b.name)) }))
    .filter(f => f.terms.length > 0);
}

const clampPct = v => Math.max(0, Math.min(100, v));

/** A position on a symmetric axis [−scale, +scale], as a percentage of the track. */
const axis = (x, scale) => clampPct(50 + (50 * x) / scale);

/**
 * Geometry of a signed bar centred on zero, in percentages of the track:
 * the bar itself and a whisker for ±sd.
 */
export function termBar(value, sd, max = 2) {
  const v = Number(value) || 0;
  const width = clampPct((50 * Math.min(Math.abs(v), max)) / max);
  const side = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
  const spread = Number.isFinite(Number(sd)) && sd != null ? Math.abs(Number(sd)) : 0;
  const whiskerLeft = axis(v - spread, max);
  return {
    side,
    left: side === 'neg' ? 50 - width : 50,
    width,
    whiskerLeft,
    whiskerWidth: axis(v + spread, max) - whiskerLeft,
  };
}

/** Half-range of the shortlist axis: at least ±4 points, widened for extreme picks, at most ±10. */
export function intervalScale(picks) {
  const reach = Math.max(0, ...(picks || []).map(p => Math.abs(Number(p.score) || 0) + (Number(p.sd) || 0)));
  return Math.min(10, Math.max(4, Math.ceil(reach)));
}

/** Point and uncertainty band of one pick on the shortlist axis, in percentages. */
export function intervalGeometry(score, sd, scale) {
  const s = Number(score) || 0;
  const spread = sd == null || !Number.isFinite(Number(sd)) ? 0 : Math.abs(Number(sd));
  const left = axis(s - spread, scale);
  return { point: axis(s, scale), left, width: axis(s + spread, scale) - left };
}

/** Display size of the champion name in the hero, in px: long names shrink, never below 40. */
export function heroNameSize(name) {
  const length = String(name || '').length;
  return length <= 8 ? 68 : Math.max(40, 68 - (length - 8) * 4);
}
