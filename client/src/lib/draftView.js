/**
 * What the draft screen says about the state of the draft: whose turn it is, when ban
 * advice matters, the group of equivalent picks, and the data behind the advice.
 */

/** Pick order of a League draft, blue first. */
export const PICK_TEAMS = ['blue', 'red', 'red', 'blue', 'blue', 'red', 'red', 'blue', 'blue', 'red'];

/**
 * "PICK 8 · À TOI", "PHASE DE BAN"… or null when there is no live turn to show.
 * `actionIsAlly` is who the League client says is acting; without it the standard
 * pick order decides.
 */
export function turnView({ live, inChampSelect, actionType, isMyTurn, actionIsAlly, phase, pickCount = 0, myTeam }) {
  if (!live || !inChampSelect) return null;
  if (phase === 'PLANNING') return { label: 'INTENTIONS', mine: false };
  if (phase === 'FINALIZATION') return { label: 'FINALISATION', mine: false };
  if (actionType === 'ban') return isMyTurn ? { label: 'BAN · À TOI', mine: true } : { label: 'PHASE DE BAN', mine: false };
  if (actionType !== 'pick' || pickCount >= PICK_TEAMS.length) return null;
  const ally = actionIsAlly ?? PICK_TEAMS[pickCount] === myTeam;
  const who = isMyTurn ? 'À TOI' : ally ? 'ALLIÉ' : 'ENNEMI';
  return { label: `PICK ${pickCount + 1} · ${who}`, mine: !!isMyTurn };
}

/** Ban advice matters during the live ban phase, or in a manual draft before any pick. */
export function showBanAdvice({ mode, actionType, pickCount = 0 }) {
  return mode === 'live' ? actionType === 'ban' : pickCount === 0;
}

/** Size of the leading group: the leader plus the picks the engine marks as tied with it. */
export function topGroupSize(picks) {
  if (!picks?.length) return 0;
  let size = 1;
  while (size < picks.length && picks[size]?.tie) size += 1;
  return size;
}

/** Another pick of the leading group, to remind the player it is an equivalent choice. */
export function groupPeer(picks, selected) {
  const size = topGroupSize(picks);
  if (size < 2 || selected >= size) return null;
  return picks[selected === 0 ? 1 : 0];
}

const RANKS = {
  iron: 'Fer', bronze: 'Bronze', silver: 'Argent', gold: 'Or', platinum: 'Platine',
  emerald: 'Émeraude', diamond: 'Diamant', master: 'Maître', grandmaster: 'Grand maître', challenger: 'Challenger',
};

/** "emerald_plus" → "Émeraude+", "gold" → "Or", "all" → "Tous rangs". */
export function rankLabel(rank) {
  if (!rank) return '';
  if (rank === 'all') return 'Tous rangs';
  const [tier, plus] = String(rank).split('_');
  if (!RANKS[tier]) return String(rank);
  return `${RANKS[tier]}${plus === 'plus' ? '+' : ''}`;
}

const collected = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** The facts behind the advice, for the status bar; `warn` marks missing or degraded data. */
export function dataStatusParts(status) {
  if (!status) return [];
  const parts = [];
  if (status.patch) parts.push({ text: `Patch ${status.patch}` });
  if (status.rank) parts.push({ text: rankLabel(status.rank) });
  if (status.meta_collected_at) parts.push({ text: `Stats du ${collected.format(new Date(status.meta_collected_at * 1000))}` });
  if (!status.meta_available) parts.push({ text: 'Statistiques absentes : analyse des kits uniquement', warn: true });
  if (status.source_errors?.length) parts.push({ text: 'Source dégradée', warn: true });
  parts.push(status.wpa_available ? { text: 'WPA estimé DALIA' } : { text: 'WPA indisponible', warn: true });
  return parts;
}

/** What the number next to an ally means: a measured pair, or the kit fallback. */
export function synergyNote({ games = 0, source } = {}) {
  if (source !== 'observed') {
    return { label: 'synergie kit', title: 'Complémentarité estimée des kits, pas un gain de win rate' };
  }
  if (!games) return { label: 'jamais jouée', title: 'Paire sans partie observée : aucun effet retenu' };
  return {
    label: `${games.toLocaleString('fr-FR')} parties`,
    title: 'Interaction mesurée : win rate du duo au-delà de la force de chacun',
  };
}
