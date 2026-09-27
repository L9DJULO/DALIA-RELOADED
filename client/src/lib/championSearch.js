/**
 * Champion search for the draft: typing "kaisa", "kai'sa" or "KAI SA" finds Kai'Sa,
 * and the first result is the one Enter picks.
 */

const SEPARATORS = /[\s'’.&-]+/g;

/** Lower case, no accents, no spaces or punctuation: "Nunu & Willump" → "nunuwillump". */
export function normalizeName(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(SEPARATORS, '');
}

/**
 * Champions matching `query`, best first: name prefix, then the start of a word in the
 * name, then any other part of it. Champions in `unavailable` (picked or banned) are left out.
 */
export function searchChampions(champions, query, unavailable = new Set(), limit = 8) {
  const q = normalizeName(query);
  if (!q) return [];
  const ranked = [];
  for (const champion of champions || []) {
    if (unavailable.has(champion.id)) continue;
    const name = normalizeName(champion.name);
    let rank;
    if (name.startsWith(q)) rank = 0;
    else if (String(champion.name).split(SEPARATORS).some(word => normalizeName(word).startsWith(q))) rank = 1;
    else if (name.includes(q)) rank = 2;
    else continue;
    ranked.push({ champion, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.champion.name.localeCompare(b.champion.name))
    .slice(0, limit)
    .map(r => r.champion);
}
