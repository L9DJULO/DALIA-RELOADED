/**
 * DALIA — Shared constants.
 *
 * Single source of truth for values used across multiple components.
 */

/** DDragon base URL. */
export const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com/cdn';

/** Fallback DDragon version (used until the real one is fetched). */
const FALLBACK_VERSION = '14.24.1';

/** Module-level cache for the resolved DDragon version. */
let _resolvedVersion = localStorage.getItem('dalia_ddragon_version') || FALLBACK_VERSION;

/** Get the current DDragon version. */
export const getDDragonVersion = () => _resolvedVersion;

/** Set the DDragon version (called once after fetchPatch). */
export const setDDragonVersion = (version) => {
  if (version && version !== '?') {
    _resolvedVersion = version;
    localStorage.setItem('dalia_ddragon_version', version);
  }
};

/** Build a DDragon champion image URL using the current version. */
export const getDDragonChampUrl = (champKey) =>
  `${DDRAGON_BASE}/${_resolvedVersion}/img/champion/${champKey}.png`;

/** Convenience: champion image base path. */
export const getDDragonChampBase = () =>
  `${DDRAGON_BASE}/${_resolvedVersion}/img/champion`;

/** Role keys used throughout the application. */
export const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];

/** Human-readable role labels. */
export const ROLE_LABELS = {
  top: 'Top',
  jungle: 'Jungle',
  mid: 'Mid',
  bot: 'Bot',
  support: 'Support',
};

/** Tier list order. */
export const TIERS = ['S', 'A', 'B', 'C', 'D'];

/**
 * LoL Ranked draft sequence — 20 actions, 1:1 mirror of the server
 * (see `server/app/models/draft.py::DRAFT_SEQUENCE`).
 *
 * `slotIndex` is the 0..4 position of this action inside its own team's
 * bans / picks — so action 9 (Blue's 2nd pick) has slotIndex=1 on the Blue team.
 * The client uses slotIndex to target `blueBans[i]` / `redBans[i]` / enemy
 * ordered picks. Ally picks are role-keyed, so slotIndex isn't used for them —
 * the user picks a role chip instead.
 */
export const DRAFT_SEQUENCE = (() => {
  const raw = [
    ['ban', 'blue'], ['ban', 'red'], ['ban', 'blue'], ['ban', 'red'], ['ban', 'blue'], ['ban', 'red'],
    ['pick', 'blue'], ['pick', 'red'], ['pick', 'red'], ['pick', 'blue'], ['pick', 'blue'], ['pick', 'red'],
    ['ban', 'red'], ['ban', 'blue'], ['ban', 'red'], ['ban', 'blue'],
    ['pick', 'red'], ['pick', 'blue'], ['pick', 'blue'], ['pick', 'red'],
  ];
  const counters = { 'ban-blue': 0, 'ban-red': 0, 'pick-blue': 0, 'pick-red': 0 };
  return raw.map(([type, team], i) => {
    const k = `${type}-${team}`;
    const slotIndex = counters[k]++;
    return { action: i, type, team, slotIndex };
  });
})();

/** Short human label for a DRAFT_SEQUENCE entry. */
export const draftStepLabel = (step) => {
  if (!step) return '';
  const verb = step.type === 'ban' ? 'Ban' : 'Pick';
  const side = step.team === 'blue' ? 'Blue' : 'Red';
  return `${verb} ${side} #${step.slotIndex + 1}`;
};
